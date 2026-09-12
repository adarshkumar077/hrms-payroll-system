# Deploying Orbit

Orbit ships as a single container built from a multi-stage `Dockerfile` using
Next.js **standalone** output. The same image runs against **SQLite** (default,
zero-config) or **PostgreSQL** (recommended for production).

Dev is unchanged: `npm run dev` still runs on SQLite with no Docker.

---

## 1. Quick start — Docker + SQLite (one command)

```bash
docker compose up --build
```

- App: <http://localhost:3000>
- Health: <http://localhost:3000/api/health> → `{"status":"ok","db":true}`
- The SQLite file lives in the `orbit-data` volume (`/app/data/orbit.db`), so it
  survives restarts. On the **first** boot the DB is created, schema pushed, and
  seed data loaded automatically. Later boots detect existing data and skip seeding.

Plain Docker (no compose):

```bash
docker build -t orbit .
docker run -p 3000:3000 \
  -e AUTH_SECRET="$(openssl rand -base64 32)" \
  -e DATABASE_URL="file:/app/data/orbit.db" \
  -v orbit-data:/app/data \
  orbit
```

---

## 2. PostgreSQL (production-like) — compose profile

```bash
docker compose --profile postgres up --build
```

This starts:
- `db` — `postgres:16-alpine` (user/pass/db = `orbit`/`orbit`/`orbit`, volume `orbit-pgdata`)
- `orbit-pg` — the app, with `DATABASE_URL=postgresql://orbit:orbit@db:5432/orbit`
  and `PRISMA_SCHEMA=prisma/schema.postgres.prisma`.

The entrypoint waits for Postgres, regenerates the Prisma client for the Postgres
schema, runs `prisma db push`, and seeds once if the DB is empty.

> Change the default DB credentials before any real deployment.

---

## 3. How the Postgres provider switch works

Prisma requires the datasource `provider` to be a **string literal** (it can't be
an env var). So there are two schema files, kept identical except for that line:

| File | Provider | Used for |
|------|----------|----------|
| `prisma/schema.prisma` | `sqlite` | dev + default SQLite container |
| `prisma/schema.postgres.prisma` | `postgresql` | Postgres |

`prisma/schema.postgres.prisma` is generated from `schema.prisma` with only the
provider line changed — keep them in sync if you edit models.

Select the Postgres schema by setting **`PRISMA_SCHEMA=prisma/schema.postgres.prisma`**
in the environment. The entrypoint then regenerates the client and pushes with
that schema. Helper npm scripts also exist for running outside Docker:

```bash
npm run db:postgres:generate   # prisma generate --schema prisma/schema.postgres.prisma
npm run db:postgres:push       # prisma db push  --schema prisma/schema.postgres.prisma
npm run db:postgres:seed       # tsx prisma/seed.ts
```

---

## 4. Environment variables

See `.env.production.example`. Summary:

| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | ✅ | `file:/app/data/orbit.db` (SQLite) or `postgresql://…` |
| `PRISMA_SCHEMA` | Postgres only | `prisma/schema.postgres.prisma`; omit for SQLite |
| `AUTH_SECRET` | ✅ (prod) | **Must be a strong random value in prod** — sessions are signed with it. `openssl rand -base64 32` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | optional | Any OpenAI-compatible AI provider. Unset → local heuristic fallback (app stays fully functional). |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | optional | Native Anthropic; used only if `LLM_*` is unset. |

> **Security:** never ship the dev `AUTH_SECRET`. Set a unique strong secret per
> environment. `.env`, `.env.production`, and `*.db` are git-ignored and
> docker-ignored — secrets are never baked into the image.

---

## 5. Migrations & seeding

The container does this for you on boot (`docker-entrypoint.sh`):
1. `prisma db push` — syncs the schema (no migration history; this project uses
   push-based schema management).
2. Seeds via `tsx prisma/seed.ts` **only if the DB has zero `Tenant` rows**, so
   restarts never wipe data.

To re-seed manually (destructive), exec into the container or run locally:

```bash
# local, SQLite
npm run db:reset          # force-reset schema + reseed

# inside a running container
docker compose exec orbit npx tsx prisma/seed.ts
```

---

## 6. Deploying to a generic container host (Render / Railway / Fly / VPS)

The image is self-contained and listens on `$PORT` (defaults to 3000, bound to
`0.0.0.0`). General steps for any host:

1. **Build** from this repo's `Dockerfile` (most hosts do this automatically).
2. **Provision a Postgres database** (managed Postgres on the host, or your own).
3. **Set env vars**: `DATABASE_URL` (the Postgres URL),
   `PRISMA_SCHEMA=prisma/schema.postgres.prisma`, `AUTH_SECRET` (strong), and any
   `LLM_*` you want.
4. **Health check**: point the platform's health probe at `GET /api/health`
   (returns 200 when the DB is reachable, 503 otherwise).
5. **Port**: expose/route to `3000` (or set `PORT` and route to it).

Platform notes:
- **Render / Railway**: add a Postgres add-on, copy its connection string into
  `DATABASE_URL`, set the other env vars, deploy the Dockerfile. Health check path
  `/api/health`.
- **Fly.io**: `fly launch` (detects the Dockerfile), `fly postgres create` +
  `fly postgres attach` to inject `DATABASE_URL`, set secrets with
  `fly secrets set AUTH_SECRET=… PRISMA_SCHEMA=prisma/schema.postgres.prisma`.
  Ensure the app service `internal_port = 3000`.
- **Bare VPS**: install Docker + Compose and run
  `docker compose --profile postgres up -d --build`, front it with a reverse
  proxy (Caddy/Nginx) terminating TLS to `localhost:3000`.

For SQLite in production, mount a **persistent** volume at `/app/data` and set
`DATABASE_URL=file:/app/data/orbit.db`. (Postgres is recommended for anything
multi-instance or with real traffic.)
