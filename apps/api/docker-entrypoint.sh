#!/bin/sh
set -e
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Seeding company roles/settings; bootstrap Super Admin only if BOOTSTRAP_ADMIN_EMAIL/PASSWORD are set (else use POST /api/v1/auth/setup/super-admin)..."
npx tsx prisma/seed.ts || true
npx tsx prisma/remove-demo-employees.ts || true
npx tsx prisma/sync-settings.ts || true
echo "Starting API..."
exec node dist/main.js
