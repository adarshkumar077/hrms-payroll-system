#!/bin/sh
# EITF HRMS: PostgreSQL backup job. Runs inside the db-backup container.
#
# Usage:
#   backup.sh once   run one backup now (default)
#   backup.sh loop   run one backup per day at BACKUP_HOUR_UTC (container default)
#
# Connection: standard libpq variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
#
# Environment:
#   BACKUP_DIR              local backup directory (default /backups)
#   BACKUP_RETENTION_DAYS   delete local and remote backups older than this (default 14)
#   BACKUP_HOUR_UTC         hour (0-23, UTC) for the daily run in loop mode (default 20 = 01:30 IST)
#   BACKUP_AGE_RECIPIENT    age public key (age1...). If unset, the dump stays UNENCRYPTED and local.
#   BACKUP_RCLONE_REMOTE    rclone destination, e.g. r2:eitf-hrms-backups. If unset, no upload.
#                           rclone config: /config/rclone/rclone.conf if mounted, else RCLONE_CONFIG_* env.
#
# Exit status: non-zero only when the dump (or the encryption of the dump) fails.
# Upload problems are logged as ERROR and do not change the exit status.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
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

upload_offsite() {
  file="$1"
  remote="${BACKUP_RCLONE_REMOTE%/}"
  log "uploading $(basename "$file") -> ${remote}/"
  if ! rclone copy "$file" "${remote}/"; then
    err "off-site upload failed for $(basename "$file"); local copy kept"
    return 0
  fi
  # Remote retention: only touch files that match our naming scheme.
  if ! rclone delete "$remote" --min-age "${RETENTION_DAYS}d" --include 'eitf_hrms_*'; then
    err "remote retention cleanup failed on ${remote}"
  fi
}

run_backup() {
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  base="${BACKUP_DIR}/eitf_hrms_${ts}.dump"
  mkdir -p "$BACKUP_DIR"

  log "pg_dump -Fc -> ${base}"
  if ! pg_dump -Fc --no-owner --no-acl -f "${base}.partial"; then
    rm -f "${base}.partial"
    err "pg_dump failed"
    return 1
  fi
  mv "${base}.partial" "$base"
  log "dump complete: $(du -h "$base" | cut -f1)"

  final="$base"
  if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
    if ! age -r "$BACKUP_AGE_RECIPIENT" -o "${base}.age" "$base"; then
      rm -f "$base" "${base}.age"
      err "age encryption failed; plaintext dump removed"
      return 1
    fi
    rm -f "$base"
    final="${base}.age"
    log "encrypted -> ${final}"
  else
    warn "BACKUP_AGE_RECIPIENT is not set; dump is UNENCRYPTED"
  fi

  # Local retention.
  if ! find "$BACKUP_DIR" -maxdepth 1 -type f -name 'eitf_hrms_*' -mtime "+${RETENTION_DAYS}" -exec rm -f {} \; ; then
    warn "local retention cleanup reported errors"
  fi
  log "local retention: ${RETENTION_DAYS} days"

  # Off-site upload.
  if [ -z "${BACKUP_RCLONE_REMOTE:-}" ]; then
    warn "BACKUP_RCLONE_REMOTE is not set; skipping off-site upload (backup is local only)"
  elif [ "$final" = "$base" ]; then
    warn "refusing to upload an unencrypted dump off-site; set BACKUP_AGE_RECIPIENT"
  else
    upload_offsite "$final"
  fi
  return 0
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
