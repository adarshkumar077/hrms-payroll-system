# EITF HRMS — Deployment Guide

## Environments

| Env | Purpose |
|---|---|
| Local | Embedded Postgres (`npm run db:up` on **5433**) or Docker Compose |
| Staging / Prod | Managed Postgres + API + Web + Mobile store builds |

## Prerequisites

- Node.js **≥ 20**
- npm workspaces
- PostgreSQL 14+ (embedded or Docker)
- (Prod) reverse proxy with TLS (nginx / Caddy / cloud LB)

## Local (no Docker)

```powershell
cd C:\Users\Aadarsh\Projects\eitf-hrms
npm install
npm run db:up
copy .env.example apps\api\.env   # adjust DATABASE_URL if needed
npm run db:migrate
npm run db:seed
npm run dev:api
npm run dev:web
```

- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/api/docs`
- Web: `http://localhost:3000`

## Production API

1. Set secrets in env (never commit):
   - `DATABASE_URL`
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
   - `CORS_ORIGINS` (comma-separated web origins)
   - Optional: `OPENAI_API_KEY`, SMS/email provider keys
2. Build & run:

```bash
npm run build:api
npm run prisma:deploy -w @eitf/api
npm run start:prod -w @eitf/api
```

3. Put TLS terminator in front; forward to `API_PORT` (default 3001).
4. Schedule OS-level backups of Postgres **and** rely on in-app `POST /security/backups/run` JSON snapshots under `data/backups/`.

## Production Web

```bash
npm run build:web
# serve apps/web (.next) via `next start` or static export host
```

Set `NEXT_PUBLIC_API_URL` to the public API base (`https://api.example.com/api/v1`).

## Mobile release (Expo / EAS)

```bash
cd apps/mobile
npx eas-cli login
npx eas build -p android --profile preview   # APK
npx eas build -p ios --profile production    # IPA (Apple developer account)
```

Configure `eas.json` profiles and `app.json` bundle IDs (`com.eitf.hrms`).  
Set `EXPO_PUBLIC_API_URL` for the target environment.

## Migrations

```bash
# stop Nest watch on Windows before prisma generate if you hit EPERM
npm run prisma:migrate -w @eitf/api   # dev
npm run prisma:deploy -w @eitf/api    # prod
```

## Health checks

- `GET /api/v1/health`
- Swagger smoke of auth login

## Rollback

1. Redeploy previous API/web artifacts.
2. Restore Postgres from last backup.
3. Optionally restore latest `data/backups/<companyId>/backup-*.json` for config/audit forensics (not a full DB restore).
