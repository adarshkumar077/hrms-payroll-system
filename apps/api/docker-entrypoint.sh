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
echo "Starting API..."
exec node dist/main.js
