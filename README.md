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

**Minimum daily start (2 terminals):** see [docs/MANUAL-START.md](docs/MANUAL-START.md).

```powershell
# Terminal 1 — keep open
npm run db:up

# Terminal 2 — API + web + Cloudflare tunnel (keep open)
npm run start:localhost
```

| Service | URL |
|---|---|
| Web (local) | http://localhost:3000 |
| Web (LAN) | http://192.168.1.69:3000 |
| Web (public) | URL printed by `start:localhost` / `.public-url.txt` |
| API health | http://localhost:3001/api/v1/health |
| Swagger | http://localhost:3001/api/docs |

**First-time setup** (once after clone):

```powershell
cd C:\Users\Aadarsh\Projects\eitf-hrms
npm install
npm run db:up
# ensure apps/api/.env has DATABASE_URL for embedded Postgres
npm run db:migrate
npm run db:seed
```

## Login (after seed)

After `npm run db:seed`:

| User | Password |
|---|---|
| `superadmin` | `Super@123` |
| `admin` | `Admin@123` |
| `hr001` | `HR@123` |
| `emp001` | `Emp@123` |

If no Super Admin exists yet, open http://localhost:3000 and use **Initial Super Admin Setup**, or run `apps/api` bootstrap with `SETUP_SUPER_ADMIN_*` env vars. Only an existing Super Admin can create HR accounts (Security → Admin Users or `POST /auth/admin-users`).

## Documentation pack (Phase 13)

| Doc | Path |
|---|---|
| Manual start (2 terminals) | `docs/MANUAL-START.md` |
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
