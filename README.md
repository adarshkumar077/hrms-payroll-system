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

## Quick start (no Docker)

**Minimum daily start (2 terminals):** see [docs/MANUAL-START.md](docs/MANUAL-START.md).

```bash
# Terminal 1 — keep open
npm run db:up

# Terminal 2 — API + web + Cloudflare tunnel (keep open)
npm run start:localhost
```

| Service | URL |
|---|---|
| Web (local HTTPS) | https://localhost:3000 |
| Web (LAN HTTPS — GPS) | `https://<your-LAN-IP>:3000` (your machine's LAN IP, printed by `start:localhost`) |
| Web (public) | URL printed by `start:localhost` / `.public-url.txt` |
| API health | http://localhost:3001/api/v1/health |
| Swagger | http://localhost:3001/api/docs |

**First-time setup** (once after clone):

```bash
# from the repo root
npm install
npm run db:up
# ensure apps/api/.env has DATABASE_URL for embedded Postgres
npm run db:migrate
npm run db:seed
```

## Login (first Super Admin)

- **Production:** set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`. The first Super Admin is created from them with a forced password change. Without them, use the first-run screen at `/auth/setup/super-admin`.
- **Local development:** `npm run db:seed` creates `admin@eitf.in` / `Admin@123` with a forced password change on first login. The seed never overwrites existing users.

No other demo accounts exist. Create users from **Admin → Users**.

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

```bash
cd apps/mobile
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
