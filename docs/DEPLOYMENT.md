# EITF HRMS — Deployment Guide

> **Production VPS + HTTPS:** See **[PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md)** for the complete 24×7 Docker + Cloudflare Tunnel guide.

## Quick start (VPS)

```bash
cp .env.production.example .env.production
# Edit secrets + CLOUDFLARE_TUNNEL_TOKEN + PUBLIC_APP_URL
./deploy/up.sh
```

## Environments

| Env | Purpose |
|---|---|
| Local | Embedded Postgres (`npm run db:up` on **5435**) or Docker Compose |
| Staging / Prod | Managed Postgres + API + Web + Mobile store builds |

## Prerequisites

- Node.js **≥ 20**
- npm workspaces
- PostgreSQL 14+ (embedded or Docker)
- (Prod) reverse proxy with TLS (nginx / Caddy / cloud LB)

## Local (no Docker)

```bash
# from the repo root
npm install
npm run db:up
cp .env.example apps/api/.env   # adjust DATABASE_URL if needed
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
   - `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` for the first Super Admin (or use `/auth/setup/super-admin` on first run)
   - Optional: `OPENAI_API_KEY`, SMS/email provider keys
2. Build & run:

```bash
npm run build:api
npm run prisma:deploy -w @eitf/api
npm run start:prod -w @eitf/api
```

3. Put TLS terminator in front; forward to `API_PORT` (default 3001).
4. Schedule OS-level backups of Postgres **and** rely on in-app `POST /security/backups/run` JSON snapshots under `data/backups/`.

## Object storage (selfies and documents)

Attendance selfies and HR documents are stored as objects; Postgres keeps only keys
(`storage:selfies/<companyId>/<yyyy-mm>/<recordId>-<in|out>-<random>.jpg`). Selfies are returned to
the client as short-lived (5 min) signed URLs, only to users already allowed to see them.

- `STORAGE_DRIVER=local` (default): files under `LOCAL_STORAGE_DIR` (mount a persistent volume).
  Signed links are HMAC-signed `GET /api/v1/storage/object?...` URLs (`STORAGE_SIGNING_SECRET`,
  falling back to `JWT_ACCESS_SECRET`; set `API_PUBLIC_URL` if the web app is on another origin).
- `STORAGE_DRIVER=s3`: any S3-compatible service. Cloudflare R2 example:

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=eitf-hrms-files
S3_ACCESS_KEY_ID=<R2 API token access key>
S3_SECRET_ACCESS_KEY=<R2 API token secret>
S3_FORCE_PATH_STYLE=false
```

  Keep the bucket private (no public access); the API presigns reads. Documents uploaded while on
  `local` stay readable after switching (each row records its driver), but new files go to S3 and
  existing local files are not copied automatically.

Migrating existing base64 selfies (run once after deploy; safe to re-run):

```bash
npm run db:migrate-selfies              # dry run: prints counts and bytes
npm run db:migrate-selfies -- --apply   # upload + rewrite rows to storage: keys
```

The API JSON body limit is 4 MB; selfies are validated (JPEG/PNG/WebP magic bytes, max 2 MB decoded).

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
# on Windows, stop the Nest watcher before prisma generate if you hit EPERM
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
