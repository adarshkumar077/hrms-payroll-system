# Full Orbit CRM merge into EITF HRMS

## Source / clones

| Path | Role |
|------|------|
| `C:\CRM` | Frozen source copy (created from `D:\CRM` when `C:\CRM` was missing). **Do not modify.** |
| `D:\CRM` | Original machine copy — verified untouched (same git HEAD). |
| `C:\Users\Aadarsh\Projects\CRM-CLONE` | Working 1:1 clone (15154 items excl `.next`). |
| `C:\Users\Aadarsh\Projects\eitf-hrms\apps\orbit` | Integrated Orbit app (`@eitf/orbit`) |

## Architecture

- **HRMS** = root app (Next 15 `:3000` + Nest `:3001` + Postgres `:5435`)
- **Orbit** = full Business OS as internal module (`basePath=/orbit`, Next 14 `:3010`)
- **Proxy** = HRMS `next.config.js` rewrites `/orbit/*` → Orbit
- **Auth** = one HRMS login → `/sso/orbit` → `POST /orbit/api/auth/hrms-sso` → `orbit_session` cookie
- **DB** = Orbit keeps its own Prisma/SQLite (`apps/orbit/prisma/dev.db`); HRMS Postgres unchanged

## Conflict resolution

| Orbit path | Resolution |
|------------|------------|
| `/dashboard`, `/tickets`, `/admin`, `/billing` | Served as `/orbit/...` so HRMS routes stay intact |
| All other CRM modules | `/orbit/leads`, `/orbit/finance/*`, etc. |

## Sidebar

Full Orbit nav under CRM / Finance / Intelligence / Setup / Operations (Inventory, PO) + HRMS modules preserved.

## Commands

```bash
npm install
npm run orbit:setup    # prisma generate + db push + seed
npm run db:up
npm run start:all      # api + web + orbit
```

Open http://localhost:3000 → login → CRM → Leads (or Setup → Billing).
