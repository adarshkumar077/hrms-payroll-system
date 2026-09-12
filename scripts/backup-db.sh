#!/bin/sh
# PostgreSQL backup — runs inside db-backup container (daily by default)
set -eu

TS="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="/backups/eitf_hrms_${TS}.sql.gz"
RET="${BACKUP_RETENTION_DAYS:-14}"

echo "[backup] Starting pg_dump → ${FILE}"
pg_dump -Fc --no-owner --no-acl | gzip > "${FILE}"
echo "[backup] Done: $(du -h "${FILE}" | cut -f1)"

# Prune old backups
find /backups -name 'eitf_hrms_*.sql.gz' -mtime +"${RET}" -delete 2>/dev/null || true
echo "[backup] Retention: ${RET} days"
