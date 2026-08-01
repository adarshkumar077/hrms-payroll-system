#!/bin/sh
set -e
echo "Running Prisma migrations..."
npx prisma migrate deploy
echo "Seeding company roles, settings, and initial Super Admin if needed..."
npx tsx prisma/seed.ts || true
npx tsx prisma/remove-demo-employees.ts || true
npx tsx prisma/sync-settings.ts || true
echo "Starting API..."
exec node dist/main.js
