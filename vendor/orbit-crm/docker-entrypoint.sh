#!/bin/sh
set -e

# ─────────────────────────────────────────────────────────────
# Orbit container entrypoint.
#  1. Wait for the DB (Postgres) to accept connections.
#  2. Sync the schema with `prisma db push`.
#  3. Seed once, only if the DB looks empty (no Tenant rows).
#  4. Hand off to the server (CMD -> node server.js).
# ─────────────────────────────────────────────────────────────

: "${DATABASE_URL:?DATABASE_URL must be set}"

# Which schema to push. For Postgres, override with PRISMA_SCHEMA=prisma/schema.postgres.prisma
PRISMA_SCHEMA="${PRISMA_SCHEMA:-prisma/schema.prisma}"

echo "==> Orbit entrypoint | schema=$PRISMA_SCHEMA"

# If pointed at Postgres, wait for the server to be reachable before pushing.
case "$DATABASE_URL" in
  postgres*://*)
    echo "==> Waiting for Postgres to be ready..."
    tries=0
    until node -e "
      const u=new URL(process.env.DATABASE_URL);
      require('net').connect({host:u.hostname,port:u.port||5432})
        .on('connect',()=>process.exit(0))
        .on('error',()=>process.exit(1));
    " 2>/dev/null; do
      tries=$((tries+1))
      if [ "$tries" -ge 60 ]; then
        echo "!! Postgres not reachable after 60s, continuing anyway..."
        break
      fi
      sleep 1
    done
    ;;
esac

# The client baked into the image was generated from the SQLite schema during
# build. If we're running a different schema (e.g. Postgres), regenerate the
# client so its datasource provider matches, otherwise queries fail at runtime.
if [ "$PRISMA_SCHEMA" != "prisma/schema.prisma" ]; then
  echo "==> Non-default schema — regenerating Prisma client for $PRISMA_SCHEMA..."
  npx prisma generate --schema "$PRISMA_SCHEMA"
fi

echo "==> Applying schema (prisma db push)..."
npx prisma db push --schema "$PRISMA_SCHEMA" --accept-data-loss

# Seed only on an empty database so restarts don't wipe data.
echo "==> Checking whether to seed..."
NEEDS_SEED=$(node -e "
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  db.tenant.count()
    .then(c => { console.log(c === 0 ? 'yes' : 'no'); })
    .catch(() => { console.log('yes'); })
    .finally(() => db.\$disconnect());
")

if [ "$NEEDS_SEED" = "yes" ]; then
  echo "==> Empty DB detected — seeding..."
  npx tsx prisma/seed.ts || echo "!! Seed failed (continuing); app will still start."
else
  echo "==> DB already has data — skipping seed."
fi

echo "==> Starting server: $*"
exec "$@"
