#!/usr/bin/env bash
# Restore PostgreSQL from backup volume — run on VPS inside project dir
set -euo pipefail
BACKUP_FILE="${1:?Usage: restore-db.sh /path/to/backup.sql.gz}"

echo "==> Stopping API to release connections..."
docker compose --env-file .env.production stop api web nginx cloudflared 2>/dev/null || true

echo "==> Restoring from $BACKUP_FILE"
gunzip -c "$BACKUP_FILE" | docker compose --env-file .env.production exec -T postgres \
  pg_restore -U "${POSTGRES_USER:-eitf}" -d "${POSTGRES_DB:-eitf_hrms}" --clean --if-exists 2>/dev/null \
  || gunzip -c "$BACKUP_FILE" | docker compose --env-file .env.production exec -T postgres \
  psql -U "${POSTGRES_USER:-eitf}" -d "${POSTGRES_DB:-eitf_hrms}"

echo "==> Restarting stack..."
docker compose --env-file .env.production --profile tunnel up -d

echo "==> Verify: curl -s https://YOUR_DOMAIN/api/v1/health"
