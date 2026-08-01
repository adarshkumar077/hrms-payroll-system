# EITF HRMS & Payroll Platform

Enterprise HRMS & Payroll for **EITF Enhancing IT Infrastructure Pvt. Ltd.**

Phases **1–13 complete** (modules **2** and **14** skipped). See `docs/PHASE1.md` … `docs/PHASE13.md`.

## Stack

| Layer | Tech |
|---|---|
| API | NestJS + Prisma + PostgreSQL |
| Web | Next.js + TypeScript + Tailwind |
| Mobile | Expo (React Native) + EAS build profiles |
| Jobs | `@nestjs/schedule` (backups, SLA helpers) |

## Quick start (Windows / no Docker)

```powershell
cd C:\Users\Aadarsh\Projects\eitf-hrms
npm install
npm run db:up
# ensure apps/api/.env has DATABASE_URL for port 5433
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Swagger | http://localhost:3001/api/docs |

## First-time Super Admin setup

No default login credentials are shipped. After `npm run db:migrate` and `npm run db:seed`:

1. Open http://localhost:3000
2. Complete the **Initial Super Admin Setup** form (shown when no Super Admin exists), **or** run:

```powershell
cd apps\api
$env:SETUP_SUPER_ADMIN_EMAIL="your-admin@company.com"
$env:SETUP_SUPER_ADMIN_PASSWORD="YourSecurePassword"
$env:SETUP_SUPER_ADMIN_MOBILE="9876543210"
npx tsx prisma/bootstrap-super-admin.ts
```

Only an existing Super Admin can create HR accounts (Security → Admin Users or `POST /auth/admin-users`).

## Documentation pack (Phase 13)

| Doc | Path |
|---|---|
| User manuals | `docs/USER_MANUALS.md` · Web `/help` |
| Training | `docs/TRAINING.md` |
| Deployment | `docs/DEPLOYMENT.md` |
| Backup & recovery | `docs/BACKUP_AND_RECOVERY.md` |
| Audit & security | `docs/AUDIT_AND_SECURITY.md` |
| Database | `docs/DATABASE.md` |
| Export engine | `docs/EXPORT_ENGINE.md` |

## Mobile store builds

```powershell
cd apps\mobile
npx eas-cli build -p android --profile preview
npx eas-cli build -p ios --profile production
```

See `apps/mobile/eas.json` and `docs/DEPLOYMENT.md`.

## Monorepo

```
apps/api      NestJS REST API + Prisma
apps/web      Next.js portals
apps/mobile   Expo employee/manager app
docs/         Phase notes + ops manuals
```
