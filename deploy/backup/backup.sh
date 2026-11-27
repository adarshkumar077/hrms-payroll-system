#!/bin/sh
# EITF HRMS: backup job (database + uploaded files). Runs inside the db-backup container.
#
# Usage:
#   backup.sh once   run one backup now (default)
#   backup.sh loop   run one backup per day at BACKUP_HOUR_UTC (container default)
#
# Connection: standard libpq variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
#
# Environment:
#   BACKUP_DIR              local backup directory (default /backups)
#   BACKUP_STATUS_DIR       where last_status.json is written for monitoring (default $BACKUP_DIR)
#   UPLOADS_DIR             uploaded documents / attendance selfies to archive (default /uploads;
#                           skipped with a warning when not mounted)
#   BACKUP_RETENTION_DAYS   delete local and remote backups older than this (default 14)
#   BACKUP_HOUR_UTC         hour (0-23, UTC) for the daily run in loop mode (default 20 = 01:30 IST)
#   BACKUP_AGE_RECIPIENT    age public key (age1...). If unset, archives stay UNENCRYPTED and local.
#   BACKUP_RCLONE_REMOTE    rclone destination, e.g. r2:eitf-hrms-backups. If unset, no upload.
#                           rclone config: /config/rclone/rclone.conf if mounted, else RCLONE_CONFIG_* env.
#
# Every archive is verified before it counts as a backup: the database dump must be readable by
# pg_restore --list, the uploads archive by tar -t. A SHA-256 checksum of each is recorded.
#
# Exit status: 0 only when every enabled step succeeded (dump, verification, encryption, uploads
# archive and, when configured, the off-site upload). Local copies are always kept on failure.
# Each run writes last_status.json (no secrets) which the API monitor checks and alerts on.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
STATUS_DIR="${BACKUP_STATUS_DIR:-$BACKUP_DIR}"
UPLOADS_DIR="${UPLOADS_DIR:-/uploads}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
HOUR_UTC="${BACKUP_HOUR_UTC:-20}"
RCLONE_CONF_FILE="/config/rclone/rclone.conf"

log() {
  printf '%s [backup] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

warn() {
  log "WARNING: $*"
}

err() {
  log "ERROR: $*" >&2
}

if [ -f "$RCLONE_CONF_FILE" ]; then
  RCLONE_CONFIG="$RCLONE_CONF_FILE"
  export RCLONE_CONFIG
fi

json_str() {
  # Minimal JSON string escaping for file names / short error codes.
  printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"
}

sha256_of() {
  sha256sum "$1" | cut -d' ' -f1
}

bytes_of() {
  wc -c < "$1" | tr -d ' '
}

# encrypt_file <plain> -> prints final path; removes the plaintext on success.
encrypt_file() {
  plain="$1"
  if [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
    printf '%s' "$plain"
    return 0
  fi
  if ! age -r "$BACKUP_AGE_RECIPIENT" -o "${plain}.age" "$plain"; then
    rm -f "$plain" "${plain}.age"
    return 1
  fi
  rm -f "$plain"
  printf '%s' "${plain}.age"
}

OFFSITE_ERRORS=""
upload_offsite() {
  file="$1"
  remote="${BACKUP_RCLONE_REMOTE%/}"
  log "uploading $(basename "$file") -> ${remote}/"
  if ! rclone copy "$file" "${remote}/"; then
    err "off-site upload failed for $(basename "$file"); local copy kept"
    OFFSITE_ERRORS="${OFFSITE_ERRORS} $(basename "$file")"
    return 1
  fi
  # Confirm the object is really there with the same size.
  remote_size="$(rclone size --json "${remote}/$(basename "$file")" 2>/dev/null | sed -n 's/.*"bytes":\([0-9]*\).*/\1/p')"
  if [ "${remote_size:-}" != "$(bytes_of "$file")" ]; then
    err "off-site copy of $(basename "$file") could not be confirmed (size mismatch)"
    OFFSITE_ERRORS="${OFFSITE_ERRORS} $(basename "$file")"
    return 1
  fi
  return 0
}

run_backup() {
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$BACKUP_DIR" "$STATUS_DIR"
  OFFSITE_ERRORS=""
  overall=0

  # ── 1. Database dump, verified ────────────────────────────────────────────
  db_ok=false; db_file=""; db_bytes=0; db_sha=""
  base="${BACKUP_DIR}/eitf_hrms_${ts}.dump"
  log "pg_dump -Fc -> ${base}"
  if pg_dump -Fc --no-owner --no-acl -f "${base}.partial" && mv "${base}.partial" "$base"; then
    if pg_restore --list "$base" >/dev/null 2>&1; then
      tables="$(pg_restore --list "$base" | grep -c ' TABLE DATA ' || true)"
      log "dump verified: $(du -h "$base" | cut -f1), ${tables} tables with data"
      if final="$(encrypt_file "$base")"; then
        db_ok=true; db_file="$final"; db_bytes="$(bytes_of "$final")"; db_sha="$(sha256_of "$final")"
        [ "$final" != "$base" ] && log "encrypted -> ${final}" || warn "BACKUP_AGE_RECIPIENT is not set; dump is UNENCRYPTED"
      else
        err "age encryption of the dump failed; plaintext removed"
      fi
    else
      err "dump verification failed (pg_restore --list); removing unusable dump"
      rm -f "$base"
    fi
  else
    rm -f "${base}.partial"
    err "pg_dump failed"
  fi
  [ "$db_ok" = true ] || overall=1

  # ── 2. Uploaded files (documents, attendance selfies), verified ──────────
  up_ok=false; up_file=""; up_bytes=0; up_sha=""; up_count=0; up_state="skipped"
  if [ -d "$UPLOADS_DIR" ]; then
    up_count="$(find "$UPLOADS_DIR" -type f | wc -l | tr -d ' ')"
    ubase="${BACKUP_DIR}/eitf_uploads_${ts}.tar.gz"
    log "archiving ${up_count} uploaded file(s) -> ${ubase}"
    if tar -C "$UPLOADS_DIR" -czf "${ubase}.partial" . && mv "${ubase}.partial" "$ubase" && tar -tzf "$ubase" >/dev/null 2>&1; then
      if ufinal="$(encrypt_file "$ubase")"; then
        up_ok=true; up_state="ok"; up_file="$ufinal"; up_bytes="$(bytes_of "$ufinal")"; up_sha="$(sha256_of "$ufinal")"
        log "uploads archive verified$( [ "$ufinal" != "$ubase" ] && echo ' and encrypted')"
      else
        up_state="failed"; err "age encryption of the uploads archive failed"
      fi
    else
      rm -f "${ubase}.partial" "$ubase"
      up_state="failed"; err "uploads archive failed or could not be verified"
    fi
    [ "$up_ok" = true ] || overall=1
  else
    warn "UPLOADS_DIR ${UPLOADS_DIR} is not mounted; uploaded files are NOT in this backup"
  fi

  # ── 3. Local retention ────────────────────────────────────────────────────
  if ! find "$BACKUP_DIR" -maxdepth 1 -type f -name 'eitf_*' -mtime "+${RETENTION_DAYS}" -exec rm -f {} \; ; then
    warn "local retention cleanup reported errors"
  fi
  log "local retention: ${RETENTION_DAYS} days"

  # ── 4. Off-site copy (encrypted archives only) ───────────────────────────
  offsite="skipped"
  if [ -z "${BACKUP_RCLONE_REMOTE:-}" ]; then
    warn "BACKUP_RCLONE_REMOTE is not set; skipping off-site upload (backup is local only)"
    offsite="not_configured"
  elif [ -z "${BACKUP_AGE_RECIPIENT:-}" ]; then
    warn "refusing to upload unencrypted archives off-site; set BACKUP_AGE_RECIPIENT"
    offsite="refused_unencrypted"
  else
    offsite="ok"
    for f in "$db_file" "$up_file"; do
      [ -n "$f" ] || continue
      upload_offsite "$f" || offsite="failed"
    done
    if [ "$offsite" = "ok" ]; then
      if ! rclone delete "${BACKUP_RCLONE_REMOTE%/}" --min-age "${RETENTION_DAYS}d" --include 'eitf_*'; then
        err "remote retention cleanup failed on ${BACKUP_RCLONE_REMOTE}"
      fi
    else
      overall=1
    fi
  fi

  # ── 5. Status for monitoring (no secrets, no personal data) ──────────────
  finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  ok_json=false; [ "$overall" -eq 0 ] && ok_json=true
  encrypted=false; [ -n "${BACKUP_AGE_RECIPIENT:-}" ] && encrypted=true
  tmp="${STATUS_DIR}/.last_status.json.tmp"
  cat > "$tmp" <<EOF
{
  "ok": ${ok_json},
  "startedAt": $(json_str "$started"),
  "finishedAt": $(json_str "$finished"),
  "encrypted": ${encrypted},
  "database": { "ok": ${db_ok}, "file": $(json_str "$(basename "${db_file:-none}")"), "bytes": ${db_bytes}, "sha256": $(json_str "$db_sha") },
  "uploads": { "state": $(json_str "$up_state"), "file": $(json_str "$(basename "${up_file:-none}")"), "bytes": ${up_bytes}, "files": ${up_count}, "sha256": $(json_str "$up_sha") },
  "offsite": { "state": $(json_str "$offsite"), "failed": $(json_str "$(echo "$OFFSITE_ERRORS" | sed 's/^ //')") },
  "retentionDays": ${RETENTION_DAYS}
}
EOF
  mv "$tmp" "${STATUS_DIR}/last_status.json"
  if [ "$overall" -eq 0 ]; then
    log "backup run OK"
  else
    err "backup run FAILED (see ${STATUS_DIR}/last_status.json); local copies kept"
  fi
  return "$overall"
}

seconds_until_hour() {
  now_s="$(date -u +%s)"
  day_s=$(( now_s % 86400 ))
  wait_s=$(( HOUR_UTC * 3600 - day_s ))
  if [ "$wait_s" -le 0 ]; then
    wait_s=$(( wait_s + 86400 ))
  fi
  echo "$wait_s"
}

loop() {
  log "scheduler started: daily at ${HOUR_UTC}:00 UTC"
  while :; do
    wait_s="$(seconds_until_hour)"
    log "next run in ${wait_s}s"
    sleep "$wait_s"
    if ! run_backup; then
      err "scheduled backup failed; retrying at the next scheduled time"
    fi
  done
}

case "$HOUR_UTC" in
  ''|*[!0-9]*) err "BACKUP_HOUR_UTC must be an integer 0-23"; exit 2 ;;
esac
if [ "$HOUR_UTC" -gt 23 ]; then
  err "BACKUP_HOUR_UTC must be 0-23"
  exit 2
fi

case "${1:-once}" in
  once) run_backup ;;
  loop) loop ;;
  *) echo "usage: backup.sh [once|loop]" >&2; exit 2 ;;
esac
