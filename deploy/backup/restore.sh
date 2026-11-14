#!/bin/sh
# EITF HRMS: restore a backup created by backup.sh.
#
# Usage:
#   restore.sh [--yes] <backup>
#
#   <backup> is either a local file (eitf_hrms_*.dump or eitf_hrms_*.dump.age) or an
#   rclone path such as r2:eitf-hrms-backups/eitf_hrms_20261113T200001Z.dump.age
#
# Environment:
#   BACKUP_AGE_IDENTITY_FILE  age private key file (required for .age backups). Keep it off the server.
#   DATABASE_URL              target database URL, or use PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
#   BACKUP_RCLONE_CONFIG      optional rclone config file for downloads (otherwise rclone's
#                             defaults apply, including RCLONE_CONFIG_* env vars).
#
# Safety: without --yes the script only prints the plan and exits 2.
# The restore uses pg_restore --clean --if-exists, which DROPS and recreates every object
# in the target database. Restore into a scratch database first (see docs/BACKUP_AND_RECOVERY.md).
set -eu

usage() {
  cat <<'EOF'
usage: restore.sh [--yes] <backup-file-or-rclone-path>

  Without --yes: print the plan and exit 2 (nothing is restored).
  With --yes:    download/decrypt if needed, verify the archive, then pg_restore --clean --if-exists.
EOF
}

log() {
  printf '%s [restore] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

YES=0
SRC=""
for arg in "$@"; do
  case "$arg" in
    --yes) YES=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
    *)
      if [ -n "$SRC" ]; then
        echo "only one backup may be given" >&2
        exit 2
      fi
      SRC="$arg"
      ;;
  esac
done

if [ -z "$SRC" ]; then
  usage >&2
  exit 2
fi

NAME="$(basename "$SRC")"

# Work out the target and describe it without printing credentials.
if [ -n "${DATABASE_URL:-}" ]; then
  TARGET_DESC="DATABASE_URL (credentials hidden)"
  TARGET_ARG="$DATABASE_URL"
elif [ -n "${PGDATABASE:-}" ]; then
  TARGET_DESC="database '${PGDATABASE}' on host '${PGHOST:-local socket}'"
  TARGET_ARG="$PGDATABASE"
else
  echo "set DATABASE_URL or PGDATABASE to the target database" >&2
  exit 2
fi

case "$NAME" in
  *.age)
    if [ -z "${BACKUP_AGE_IDENTITY_FILE:-}" ] || [ ! -r "${BACKUP_AGE_IDENTITY_FILE:-}" ]; then
      echo "BACKUP_AGE_IDENTITY_FILE must point to a readable age identity file" >&2
      exit 2
    fi
    ;;
esac

log "source: ${SRC}"
log "target: ${TARGET_DESC}"
log "action: pg_restore --clean --if-exists (DROPS and recreates objects in the target)"

if [ "$YES" -ne 1 ]; then
  log "dry run only. Re-run with --yes to restore."
  exit 2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Fetch the backup if it is not a local file.
if [ -f "$SRC" ]; then
  FILE="$SRC"
else
  command -v rclone >/dev/null 2>&1 || { echo "rclone is required to download ${SRC}" >&2; exit 1; }
  if [ -n "${BACKUP_RCLONE_CONFIG:-}" ]; then
    RCLONE_CONFIG="$BACKUP_RCLONE_CONFIG"
    export RCLONE_CONFIG
  fi
  log "downloading ${SRC}"
  rclone copyto "$SRC" "${WORK}/${NAME}"
  FILE="${WORK}/${NAME}"
fi

# Decrypt if needed.
case "$NAME" in
  *.age)
    log "decrypting with age identity"
    age -d -i "$BACKUP_AGE_IDENTITY_FILE" -o "${WORK}/restore.dump" "$FILE"
    DUMP="${WORK}/restore.dump"
    ;;
  *)
    DUMP="$FILE"
    ;;
esac

# Verify the archive is readable before touching the target.
log "verifying archive"
pg_restore --list "$DUMP" >/dev/null

log "restoring"
pg_restore --clean --if-exists --no-owner --no-acl --dbname="$TARGET_ARG" "$DUMP"
log "restore finished"
