# Playbook: add/change a Prisma model or field

⛔ Data-model change = a boundary. Confirm with the user first (see AGENTS.md).

## Steps
1. Edit `prisma/schema.prisma` (the sqlite/dev schema). Keep the multi-tenant rule: business tables carry `tenantId` + `tenant Tenant @relation(...)`. Enums are stored as `String` with a `//` comment listing allowed values (SQLite has no enums — see any model).
2. **Mirror the identical change to `prisma/schema.postgres.prisma`.** These are hand-synced; divergence breaks prod silently (`GOTCHAS.md`).
3. Apply to dev DB: `npm run db:push` (no migration files in this repo — it's push-based).
4. Regenerate client: happens via `db:push`; or `npx prisma generate`.
5. If new data should exist for the demo, extend `prisma/seed.ts` (note: seed `deleteMany`s everything first) and run `npm run db:reset`.
6. Update any `page.tsx`/`actions.ts` reading the model.

## Files to touch
`prisma/schema.prisma`, `prisma/schema.postgres.prisma`, maybe `prisma/seed.ts`, consuming pages/actions.

## Verify
`npm run db:push` succeeds for BOTH: `npm run db:push` and `npm run db:postgres:push` (the latter needs a Postgres `DATABASE_URL`; UNVERIFIED end-to-end — schema validates only). Then `npm run build`.
