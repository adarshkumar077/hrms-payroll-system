#!/bin/sh
set -e
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Seeding company roles/settings; bootstrap Super Admin only if BOOTSTRAP_ADMIN_EMAIL/PASSWORD are set (else use POST /api/v1/auth/setup/super-admin)..."
npx tsx prisma/seed.ts || true
# Disabled on automatic start (production data safety). Both scripts remain in prisma/ and can be
# run by hand when really intended:
#   remove-demo-employees.ts deletes the login and deactivates any employee named "Mukesh Pandey"
#     or with code EITF001 / email mukesh.pandey@eitf.local — it would hit a real employee too.
#   sync-settings.ts overwrites company policy settings (office start time, grace minutes, ULOB
#     thresholds, incentive rules…) with built-in defaults, undoing HR's changes on every restart.
#   Manual use:  docker compose exec api npx tsx prisma/sync-settings.ts
# npx tsx prisma/remove-demo-employees.ts || true
# npx tsx prisma/sync-settings.ts || true

# Least privilege: migrations and the seed above run as the database owner (DATABASE_URL). When
# APP_DB_PASSWORD is set, the API itself runs as a separate login role that can only read/write
# rows (no CREATE/ALTER/DROP, not superuser). The role is created or its password refreshed here.
if [ -n "${APP_DB_PASSWORD:-}" ]; then
  APP_DB_USER="${APP_DB_USER:-eitf_app}"
  if ! printf '%s' "$APP_DB_PASSWORD" | grep -Eq '^[A-Za-z0-9]{24,}$'; then
    echo "APP_DB_PASSWORD must be at least 24 letters/digits (e.g. openssl rand -hex 32)." >&2
    exit 1
  fi
  if ! printf '%s' "$APP_DB_USER" | grep -Eq '^[a-z_][a-z0-9_]{0,40}$'; then
    echo "APP_DB_USER must be a simple lowercase identifier." >&2
    exit 1
  fi
  echo "Applying least-privilege database role ${APP_DB_USER}..."
  npx prisma db execute --url "$DATABASE_URL" --stdin <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN
    CREATE ROLE ${APP_DB_USER} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  ALTER ROLE ${APP_DB_USER} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${APP_DB_PASSWORD}';
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO ${APP_DB_USER}', current_database());
END
\$\$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ${APP_DB_USER};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_DB_USER};
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${APP_DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${APP_DB_USER};
REVOKE ALL ON TABLE _prisma_migrations FROM ${APP_DB_USER};
SQL
  DATABASE_URL="$(printf '%s' "$DATABASE_URL" | sed "s#://[^@]*@#://${APP_DB_USER}:${APP_DB_PASSWORD}@#")"
  export DATABASE_URL
else
  echo "WARNING: APP_DB_PASSWORD is not set; the API connects as the database owner. Set it for least privilege." >&2
fi

echo "Starting API..."
exec node dist/main.js
