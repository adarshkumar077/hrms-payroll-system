# Deploying Orbit to Shared Hosting (cPanel / CloudLinux "Node.js Selector" / Passenger)

This is a **from-scratch runbook** for running Orbit on a shared cPanel host — no
Docker, no root, no VPS. It's a companion to `DEPLOY.md` (which covers the
Docker/VPS/managed-container path); this file covers the very different
constraints of `cloudlinux-selector` + Phusion Passenger shared hosting.

**Read this first, honestly:** shared hosting is a **poor-to-marginal fit** for
Orbit. It works for a low-traffic demo/single-tenant deployment if you follow
this guide exactly, but you will hit real limits (see §1 and §9). If you have
any budget at all, a $5–7/mo VPS or a platform like Render/Railway/Fly (see
`DEPLOY.md` §6) will be dramatically less painful. This guide assumes you're
doing it anyway.

---

## 0. What you're deploying

| Fact | Value |
|---|---|
| Framework | Next.js **14.2.5**, App Router, `output: "standalone"` (`next.config.mjs`) |
| ORM | Prisma **5.22.0** (`@prisma/client` 5.18.0 in `package.json`, 5.22.0 per lockfile) |
| Dev DB | SQLite, file at `prisma/dev.db` |
| Prod-capable DB | SQLite (single-process) **or** Postgres via `prisma/schema.postgres.prisma` |
| Dev Node version | v24.x (your machine) — **target Node 18 or 20 on the host** |
| Build command | `npm run build` = `prisma generate && next build` |
| First-run DB init | `npm run setup` = `prisma generate && prisma db push && tsx prisma/seed.ts` |
| Repo state | **Not a git repo** — you'll upload files directly (zip/SFTP), not `git pull` |

---

## 1. Prerequisites & honest limits

### What your cPanel account needs
- **CloudLinux "Node.js Selector"** (a.k.a. Passenger Node app support) — check
  cPanel home page for a tile literally called **"Setup Node.js App"**.
- **Node 18.x or 20.x** available in that selector's version dropdown. Orbit
  was developed on Node 24, but Next 14.2 + Prisma 5.22 run fine on 18/20 —
  target the **highest 18 or 20 patch** your host offers.
- **SSH access** (Terminal in cPanel, or real SSH). You need this to run
  `prisma generate`, `npm install`, and (optionally) push/seed the DB. If your
  plan has **no terminal at all**, stop here — you cannot run Prisma's native
  binary or npm postinstall scripts, and this deployment is not viable.
- Enough **disk quota** for `node_modules` (Prisma's engine binaries alone are
  50–100 MB) plus your SQLite file/uploads if you go that route.
- A **subdomain or addon domain** pointed at the app (cPanel Node.js apps bind
  to a domain/subdomain + path, not an arbitrary port you pick).

### What shared hosting can't do (be honest about these)
| Limitation | Why it matters here |
|---|---|
| **No Docker, no root** | `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` in this repo are **irrelevant** to this path. Ignore them. |
| **Low RAM / CPU caps, often with OOM-killer or process limits** | `next build` compiles the whole app in-memory and can need 1–2+ GB. Most shared plans (512 MB–1 GB per Node app) **will OOM or hang during `next build`.** |
| **No background daemons / long-running processes you control** | You cannot run a separate cron worker process. Scheduled jobs (payroll reminders, SLA ageing, compliance nudges) must be triggered by **cPanel's cron**, hitting an HTTP endpoint (`POST /api/cron`) — see §7. |
| **Passenger manages the Node process for you** | You don't run `node server.js` yourself in a shell and leave it — Passenger starts/stops/restarts it based on the "startup file" you configure. This works with the `standalone` server but you must point Passenger at the right file (§5). |
| **File system is usually persistent but not guaranteed backed up** | Fine for SQLite/local uploads (unlike serverless), but treat it as your only copy — take your own backups. |

**Recommendation:** because `next build` is the single biggest risk of
failure, **build the app on your own machine (or a CI runner) and upload the
build output**, rather than running `npm run build` on the shared host. This
guide's primary path (§4) does exactly that. A `npm start`-on-host fallback
that still avoids building on the host is also covered.

---

## 2. Database choice

### Option A — SQLite (simplest, single-process)

- The DB is one file, `prisma/dev.db` in dev (path comes from `DATABASE_URL` in
  `prisma/schema.prisma`, which uses `provider = "sqlite"`).
- On the host, point `DATABASE_URL` at a file **outside** any directory
  Passenger/cPanel might wipe on redeploy, and inside your app's writable
  space, e.g.:
  ```
  DATABASE_URL="file:/home/YOURCPANELUSER/orbit-data/orbit.db"
  ```
  (Use an **absolute path**. A relative `file:./dev.db` is resolved relative to
  wherever the Node process's cwd ends up under Passenger, which is not always
  what you expect — absolute paths remove the ambiguity.)
- Create that directory once via cPanel File Manager or SSH:
  ```bash
  mkdir -p /home/YOURCPANELUSER/orbit-data
  chmod 700 /home/YOURCPANELUSER/orbit-data
  ```
- **Trade-offs:**
  - Zero external dependency, zero cost, simplest to reason about.
  - **Single-process only.** SQLite does not tolerate multiple Node processes
    (or Passenger spinning up >1 worker) writing concurrently — you will hit
    `SQLITE_BUSY` / "database is locked" errors. Keep Passenger's process count
    at **1** for this app (see §5).
  - No horizontal scaling, no replica, no separate backup tooling — back up by
    copying the `.db` file while the app is briefly stopped (or use SQLite's
    `.backup` command).
  - Fine for a demo/single-tenant/low-traffic install. Not fine for anything
    with real concurrent write load.

### Option B — External managed Postgres (Neon / Supabase free tier)

Better fit if you want more than one Node worker, real backups, or you may
outgrow a single file.

1. Create a free Postgres instance on **Neon** (neon.tech) or **Supabase**
   (supabase.com). Copy the connection string it gives you — it looks like:
   ```
   postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
   ```
2. Put that string in `DATABASE_URL` in your host's environment variables
   (§5) — **not** in a committed file.
3. Generate the client and push the schema **using the Postgres schema file**,
   `prisma/schema.postgres.prisma` (kept hand-in-sync with `schema.prisma` —
   see `GAPS.md` item 2, there's no automated check that they match):
   ```bash
   npm run db:postgres:generate   # prisma generate --schema prisma/schema.postgres.prisma
   npm run db:postgres:push       # prisma db push  --schema prisma/schema.postgres.prisma
   npm run db:postgres:seed       # tsx prisma/seed.ts
   ```
   Run these **on the server (or a Linux box)**, after `DATABASE_URL` is set —
   see the engine gotcha in §3 for why "on the server" matters.
4. **Trade-offs:**
   - Real concurrent-write safety, connection pooling (Neon/Supabase both
     offer a pooled connection string — use the "pooled"/"pgbouncer" variant
     if your host's Node app can spawn more than one worker).
   - Free tiers sleep/cold-start or cap storage/compute hours — fine for a
     demo, watch the limits for anything real.
   - One more external moving part / another provider dependency and login.
   - Egress from shared hosting to the DB provider must not be blocked by the
     host's firewall (rare, but check if connections time out).

**Recommendation for this guide's audience:** start with SQLite (Option A) —
it's the lowest-friction path on a host you don't fully control. Move to
Option B only if you need more than one demo tenant or hit lock contention.

---

## 3. The Prisma engine gotcha (read this before you upload anything)

Prisma's query engine is a **native binary, compiled per OS/libc**. The
`@prisma/client` you generate on your Windows dev machine (or any non-Linux
machine) embeds a **Windows** engine binary. Shared hosting runs **Linux**
(usually with glibc — CloudLinux; occasionally musl on some minimal images).
Uploading a Windows-generated client to a Linux host means every DB call fails
immediately at runtime with an error like:

```
Query engine library for current platform "debian-openssl-3.0.x" could not be found.
```

**Fix — declare the Linux target(s) in the generator block, then regenerate
on (or for) Linux:**

**✅ Already done in this repo** — both `prisma/schema.prisma` and
`prisma/schema.postgres.prisma` are pre-configured with the Linux targets below,
and the engines are already downloaded into `node_modules/.prisma/client/`
(`libquery_engine-{debian,rhel}-openssl-{1.1,3.0}.x.so.node`). If you edit them,
keep the two files in sync per `AGENTS.md`'s ⛔ warning on this file pair:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "debian-openssl-1.1.x", "debian-openssl-3.0.x", "rhel-openssl-1.1.x", "rhel-openssl-3.0.x"]
}
```

- `"native"` keeps your local (Windows) dev workflow (`npm run dev`) working
  unchanged.
- `debian-openssl-{1.1,3.0}.x` covers Debian/Ubuntu-family hosts on either
  OpenSSL 1.1 (older) or 3.0 (newer).
- `rhel-openssl-{1.1,3.0}.x` covers CloudLinux/CentOS/RHEL-derived hosts
  (CloudLinux — the most common cPanel base — is RHEL-derived) on either OpenSSL.
- Both 1.1.x and 3.0.x are included because shared hosts vary; the right one is
  picked automatically at runtime.
- If `prisma generate` on your Linux/host run prints a different platform
  string than the two above, add that exact string to the array and
  regenerate — the error message always tells you the exact target name it
  wanted.

**Then, critically: run `prisma generate` again *on the server* (via SSH/
Terminal) after uploading**, so the engine binaries actually present in
`node_modules/.prisma/client` match Linux:

```bash
cd ~/orbit            # your app's home dir on the host
npx prisma generate                                       # SQLite schema
# or, if using Postgres:
npx prisma generate --schema prisma/schema.postgres.prisma
```

Do this **every time** you change `prisma/schema.prisma` or upload a fresh
build — a stale/mismatched client is the #1 failure mode on this kind of host
(see Troubleshooting, §9).

---

## 4. Build locally, upload the `standalone` output

Because `next build` is memory-hungry and shared CPU/RAM allocations are
small, **build on your own machine**, then upload only the output.

### 4.1 Build locally (Windows dev machine is fine for this step)

```powershell
npm install
npm run build
```

`npm run build` runs `prisma generate && next build`. Because
`next.config.mjs` sets `output: "standalone"`, this produces:

```
.next/standalone/     <- self-contained server + trimmed node_modules
.next/static/         <- hashed JS/CSS assets (NOT included in standalone/ automatically)
public/                <- your static public assets (also NOT auto-included)
```

> Note: the Prisma client generated by this local build is your **Windows**
> native engine — that's fine, you'll regenerate on the server per §3. What
> you're uploading here is mostly the compiled Next.js server + your app
> code; the engine binary gets fixed up server-side.

### 4.2 What to upload, and exactly where it goes

The standalone server (`server.js`) expects `.next/static` and `public` to
live **next to it**, not next to your source tree. Confirmed layout from this
repo's own `.next/standalone/` output: `server.js` sits at the standalone
root, alongside a trimmed `node_modules/` and a `.next/` folder — but that
inner `.next/` does **not** include `static/` (Next explicitly excludes hashed
static assets from the standalone trace to keep it small; you copy them in).

Build the upload folder locally like this before transferring:

```powershell
# from the repo root, after `npm run build`
Copy-Item -Recurse .next/static      .next/standalone/.next/static
Copy-Item -Recurse public            .next/standalone/public
Copy-Item -Recurse prisma            .next/standalone/prisma
Copy-Item package.json               .next/standalone/package.json
```

End result — this is the **entire folder you upload** (zip it: e.g.
`orbit-standalone.zip`):

```
.next/standalone/
├── server.js                 <- Passenger's "Application startup file" target
├── package.json               (for reference / npm scripts on host, e.g. db:push)
├── node_modules/               (trimmed, standalone-traced deps)
├── prisma/
│   ├── schema.prisma
│   ├── schema.postgres.prisma
│   └── seed.ts
├── .next/
│   ├── static/                <- copied in manually (see above)
│   ├── server/
│   ├── BUILD_ID
│   └── ...manifests
└── public/                    <- copied in manually (see above)
```

Upload/extract this whole tree into your cPanel app's **application root**
(e.g. `/home/YOURCPANELUSER/orbit`), via cPanel File Manager's Upload + Extract,
or SFTP.

> `prisma/seed.ts` is TypeScript — the trimmed standalone `node_modules`
> **does not** include `tsx` or dev dependencies. If you need to seed on the
> host (§6), you must additionally install `tsx` there:
> `npm install --no-save tsx` inside the app root (after cPanel's Node
> selector has set up its own `node_modules`/virtualenv for the app — see §5).

### 4.3 Fallback path — `next start` instead of standalone

If the standalone bundle gives you trouble (missing native module, path
issues), a simpler but heavier fallback: upload the **whole repo** (minus
`node_modules`, `.git` if any, `data/`) including `.next/` (the *full* build
output, not just standalone), plus `package.json`, then on the host:

```bash
npm install --omit=dev      # or npm ci --omit=dev
npx prisma generate          # fix the engine per §3
npm start                    # = next start, reads PORT from env
```

Set Passenger's **startup file** to a tiny shim `app.js` (Passenger expects to
require a file, not shell out to an npm script):

```js
// app.js — fallback shim for `next start` under Passenger
process.env.PORT = process.env.PORT || 3000;
require("child_process").execSync("node_modules/.bin/next start -p " + process.env.PORT, { stdio: "inherit" });
```

This uses more disk (full `node_modules` incl. `next`'s CLI + devDeps you keep)
and more RAM at runtime than the standalone server, but avoids the "did I copy
static/public to the right place" class of mistakes. **Prefer §4.2** unless
you hit a wall.

---

## 5. cPanel "Setup Node.js App" configuration

In cPanel: **Setup Node.js App → Create Application**.

| Field | Value |
|---|---|
| **Node.js version** | 20.x (or 18.x) — pick the highest available |
| **Application mode** | Production |
| **Application root** | `orbit` (relative to home, i.e. `/home/YOURCPANELUSER/orbit`) — wherever you extracted the folder from §4.2 |
| **Application URL** | your domain or subdomain, e.g. `orbit.yourdomain.com` |
| **Application startup file** | `server.js` (standalone path) — or `app.js` if using the §4.3 fallback shim |
| **Passenger process count / workers** | **1** if using SQLite (§2 Option A — SQLite cannot safely serve concurrent writers from multiple processes). Can raise if using Postgres (§2 Option B). |

After creating the app, cPanel shows a command like:
```
source /home/YOURCPANELUSER/nodevenv/orbit/20/bin/activate && cd /home/YOURCPANELUSER/orbit
```
Use that to get into the app's Node-selector-managed environment via
Terminal/SSH whenever you need to run `npm`/`npx` commands for this app (it
sets `PATH`/`NODE_PATH` for the selected Node version).

### Environment Variables (cPanel "Setup Node.js App" → your app → Environment variables)

| Variable | Required? | Notes / source |
|---|---|---|
| `AUTH_SECRET` | **REQUIRED** | Sessions are JWT-signed with this (`lib/auth.ts`). If unset, the app **silently falls back to a hard-coded dev secret** — forgeable sessions. Generate: `openssl rand -base64 32` (run locally; shared hosts may lack `openssl` in the restricted shell). |
| `DATABASE_URL` | **REQUIRED** | SQLite: `file:/home/YOURCPANELUSER/orbit-data/orbit.db` (absolute path). Postgres: `postgresql://USER:PASS@HOST:5432/db?sslmode=require`. |
| `NODE_ENV` | **REQUIRED** | `production` |
| `PORT` | Usually set by Passenger automatically | Only hard-code if your setup needs it explicitly; the standalone server reads `process.env.PORT` (defaults 3000 per `Dockerfile`'s `ENV PORT=3000`, but Passenger typically injects its own). |
| `PRISMA_SCHEMA` | Only if using Postgres | `prisma/schema.postgres.prisma` — informational for your own scripts; **cPanel's Node selector doesn't run `docker-entrypoint.sh`**, so this var isn't auto-consumed here — it's just a reminder of which schema file to pass explicitly to `prisma` commands you run by hand (`--schema prisma/schema.postgres.prisma`). |
| `LLM_BASE_URL` | Optional | Any OpenAI-compatible endpoint (e.g. Groq: `https://api.groq.com/openai/v1`). Unset → local heuristic fallback, app stays functional (`.env.production.example`). |
| `LLM_API_KEY` | Optional | Paired with `LLM_BASE_URL`. |
| `LLM_MODEL` | Optional | e.g. `llama-3.3-70b-versatile`. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Optional | Native Anthropic path, used only if `LLM_*` unset (`.env.production.example`). |
| `OCR_MODEL` | Optional | Vision model name for invoice OCR (`lib/ocr.ts`) — needs a vision-capable model on the same `LLM_BASE_URL`/`LLM_API_KEY`; unset → OCR stub mode ("fill fields manually"). |
| `CRON_SECRET` | Optional but **strongly recommended** | Shared secret `POST /api/cron` checks via `x-cron-secret` header (`app/api/cron/route.ts`). Unset → the endpoint runs **open/unauthenticated**. Set this before wiring the cron in §7. |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Optional | Live payment collection (`.env.payments.example`, `lib/payments.ts`); both unset → manual/mock payment mode. |
| `RAZORPAY_WEBHOOK_SECRET` | Optional | Verifies Razorpay webhook signatures; recommended if you set the two above. |
| `IRP_BASE_URL` / `IRP_CLIENT_ID` / `IRP_CLIENT_SECRET` / `IRP_USERNAME` / `IRP_PASSWORD` | Optional | GST e-invoicing live IRN (`.env.irp.example`, `lib/irp.ts`); **all five** must be set together or it falls back to mock IRN. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | "Sign in with Google" SSO (`.env.sso.example`, `lib/sso.ts`); both unset → SSO button redirects to "not configured". Redirect URI to register: `https://yourdomain/api/auth/sso/google/callback`. |
| `MARKETPLACE_WEBHOOK_KEY` | Optional | Required header value (`x-orbit-key`) for inbound lead webhooks (`.env.marketplace.example`); unset → webhook runs in open "dev mode" (fine for testing, not for prod). |
| `EMAIL_WEBHOOK_URL` / `SMS_WEBHOOK_URL` / `WHATSAPP_WEBHOOK_URL` | Optional | Not found wired to any `.env.*.example` file or read via `process.env` in the current codebase — `lib/notify.ts` handles email/SMS/WhatsApp notification *hooks*, but if you intend to point them at real webhook URLs, check `lib/notify.ts` directly for the exact variable names before assuming these three exist; treat as **not yet implemented / verify before relying on them**. |

> Every "optional" integration above is deliberately **pluggable and safe to
> leave unset** — Orbit was built so the app stays fully functional in a
> degraded/manual mode with no credentials (per `PROJECT.md`). Only add these
> when you actually have the credentials.

---

## 6. First-run DB init & seed

Via cPanel Terminal (or SSH), inside the Node selector's environment for this
app (`source .../nodevenv/orbit/20/bin/activate && cd ~/orbit`):

```bash
# 1. Fix the Prisma engine for Linux (see §3) — do this first, always.
npx prisma generate                                             # SQLite
# npx prisma generate --schema prisma/schema.postgres.prisma    # Postgres instead

# 2. Push the schema (creates tables; no migration history — see GAPS.md #7)
npx prisma db push                                              # SQLite
# npx prisma db push --schema prisma/schema.postgres.prisma     # Postgres instead

# 3. Seed demo data (requires tsx — see the note at the end of §4.2 if
#    you're on the trimmed standalone node_modules and it's missing)
npx tsx prisma/seed.ts
```

Or, equivalently, if you uploaded the full repo (§4.3 fallback) and have all
devDependencies installed, the single combined command from `package.json`
works too:

```bash
npm run setup     # prisma generate && prisma db push && tsx prisma/seed.ts
```

**Demo login after seeding:**

| Email | Password | Role |
|---|---|---|
| `ceo@demo.orbit` | `orbit123` | CEO — sees everything |
| `sales@demo.orbit` | `orbit123` | Restricted role |

**Change this password (or delete/replace the seed user) before exposing the
app publicly** — `orbit123` is a known, documented demo credential.

After Passenger restarts the app (cPanel → Setup Node.js App → **Restart**),
visit your Application URL and log in.

---

## 7. Background jobs via cPanel cron

There is no daemon you can leave running for scheduled work (payroll
reminders, SLA ageing, compliance nudges — all driven by `lib/jobs.ts`'s
`runDueJobs()`). Instead, use **cPanel → Cron Jobs** to hit the app's HTTP
endpoint on a schedule.

1. Set `CRON_SECRET` in the app's environment (§5) to a strong random value.
2. cPanel → **Cron Jobs** → Add New Cron Job:
   - **Common Settings:** e.g. "Once per hour" (`0 * * * *`) — tune to how
     time-sensitive your jobs are (`runDueJobs()` only processes jobs whose
     `runAt` has passed, so hourly is safe even if some jobs are due sooner).
   - **Command:**
     ```bash
     curl -s -X POST -H "x-cron-secret: YOUR_CRON_SECRET_VALUE" https://yourdomain.com/api/cron
     ```
3. Confirm `curl` exists on the host (`which curl` in Terminal) — nearly
   always true on cPanel, but verify. If not, `wget --header="x-cron-secret: ..." --post-data="" https://yourdomain.com/api/cron` is the fallback.

`GET /api/cron` also works and runs the same handler (`app/api/cron/route.ts`
aliases GET to POST) — useful for a quick manual browser test, but prefer POST
+ the header for the scheduled job so it's actually authenticated.

> Note the lack of job-locking (`GAPS.md` #8): if you set the cron interval
> shorter than a job can take to run, or run this from two places at once,
> jobs can double-execute. Hourly is a safe default for this app's job types.

---

## 8. File uploads

`lib/storage.ts` writes uploaded files to `data/uploads/<tenantId>/` on
**local disk**, relative to `process.cwd()`, and records an `Attachment` row
in the DB pointing at the relative path.

- **This is fine on shared hosting** — unlike serverless platforms (Vercel
  etc.), a cPanel Node app has a persistent, non-ephemeral filesystem. The
  code comment in `lib/storage.ts` itself flags this local-FS approach as
  "dev/VPS-only" and notes a production swap to S3 is the intended long-term
  fix (also tracked as gap #9 in `GAPS.md` — no size/MIME validation either);
  for a single-instance shared-hosting deployment, local disk is acceptable.
- Ensure the directory exists and is writable by the Node process's user
  (Passenger runs the app as your cPanel user, so normal ownership is fine):
  ```bash
  mkdir -p ~/orbit/data/uploads
  chmod 700 ~/orbit/data/uploads
  ```
  (Path is relative to wherever `process.cwd()` resolves for the running app
  — normally your application root. If uploads unexpectedly fail to appear,
  check cwd via a quick `console.log(process.cwd())` or the app's error log.)
- **Do not** point this at a directory that gets wiped when you redeploy/
  re-upload a new build — uploaded files and the SQLite DB (if colocated)
  must live outside the folder you overwrite each release. Recommended: keep
  `data/uploads/` and the SQLite file (§2) in a sibling directory to the app
  root, e.g. `~/orbit-data/`, not inside `~/orbit/`.
- **Known gap to plan around:** no S3/object-storage backend exists yet, and
  no size cap or MIME allow-list is enforced on upload (`GAPS.md` #9) — if
  this app will take uploads from untrusted users, treat that as a
  pre-existing risk, not something this hosting guide fixes.

---

## 9. Troubleshooting — top failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `Query engine library for current platform "..." could not be found` / `PrismaClientInitializationError` at runtime | Prisma client was generated on Windows (or wrong Linux flavor) and shipped to a different Linux host | Add `binaryTargets` to **both** schema files (§3), then run `npx prisma generate` **on the host** before restarting the app. Match the exact platform string from the error. |
| Build hangs, gets killed, or cPanel Terminal session drops during `npm run build` / `next build` | OOM — shared hosting RAM caps (often 512 MB–1 GB per Node app) can't fit the Next.js compiler + Webpack in memory | **Don't build on the host.** Build locally (§4.1) and upload the `standalone` output (§4.2). If you must build on-host, ask support to temporarily raise the memory limit, or build via a free CI runner (GitHub Actions) and download the artifact. |
| Login "succeeds" but sessions seem forgeable, or cookies don't behave as expected in prod | `AUTH_SECRET` env var not set — `lib/auth.ts` silently falls back to a hard-coded `"dev-secret"` string (see `GAPS.md` #4) | Set `AUTH_SECRET` in cPanel's Node app environment variables (§5) to a strong random value **before** going live. There is no startup check that blocks the app if it's missing — this fails silently. |
| Pages load but with no CSS / broken images / 404s on `/_next/static/...` | Standalone server's `.next/static` and/or `public` weren't copied into the uploaded tree, or were placed at the wrong level (must sit next to `server.js`, i.e. inside `.next/standalone/`, not next to the source repo's own `.next/`) | Re-check the copy commands in §4.2. `server.js` expects `./.next/static` and `./public` relative to itself. |
| `SQLITE_ERROR: attempt to write a readonly database` or `database is locked` | Either (a) the SQLite file/dir isn't writable by the app's OS user, or (b) `DATABASE_URL` points at a relative/wrong path Passenger resolves differently than you expect, or (c) more than one Passenger worker process is writing concurrently | Use an **absolute** `DATABASE_URL` path (§2 Option A). `chmod`/`chown` the containing directory to the cPanel user. Keep Passenger process count at 1 for this app if staying on SQLite. |
| App won't start / Passenger shows a generic 503 or "application failed to start" | Wrong **startup file** configured, or `PORT`/`HOSTNAME` binding mismatch (the app must listen on the port Passenger assigns, on `0.0.0.0` not `127.0.0.1` only) | Confirm "Application startup file" is `server.js` (standalone) or `app.js` (fallback shim). Check the app's error log (cPanel → Setup Node.js App → your app → **Errors** / or `stderr.log` in the app root) for the actual exception. |
| Everything works except scheduled reminders never fire | No cron wired, or `CRON_SECRET` mismatch between the env var and the cron command's header | Verify the cron job exists (cPanel → Cron Jobs) and the `x-cron-secret` header value matches `CRON_SECRET` exactly. Test manually first: `curl -X POST -H "x-cron-secret: ..." https://yourdomain.com/api/cron` and check the JSON response. |
| `npx tsx prisma/seed.ts` fails with "command not found" or module resolution errors | Standalone `node_modules` is trimmed and doesn't include `tsx`/devDependencies | `npm install --no-save tsx` in the app root, or use the full-repo fallback path (§4.3) which keeps devDependencies. |

---

## 10. Go-live checklist

- [ ] Node 18 or 20 selected in cPanel's Node.js Selector (not host default).
- [ ] Built **locally**, not on the host (`npm run build` ran on your machine).
- [ ] `binaryTargets` added to `prisma/schema.prisma` **and**
      `prisma/schema.postgres.prisma` (if using Postgres), and `npx prisma
      generate` re-run **on the host** after upload.
- [ ] `.next/static` and `public` copied into `.next/standalone/` before
      upload (or full-repo fallback used).
- [ ] `AUTH_SECRET` set to a strong, unique value (`openssl rand -base64 32`)
      — not left unset, not the dev default.
- [ ] `DATABASE_URL` set, using an **absolute** path (SQLite) or a working
      connection string (Postgres), pointing **outside** the folder you'll
      overwrite on the next redeploy.
- [ ] `NODE_ENV=production` set.
- [ ] `npx prisma db push` (or the Postgres-schema equivalent) run
      successfully — tables exist.
- [ ] `npx tsx prisma/seed.ts` run — demo tenant/users exist (or you've
      created your own tenant and **changed/removed** the `orbit123` demo
      password).
- [ ] App restarted in cPanel and the Application URL loads over **HTTPS**
      (cPanel → SSL/TLS → AutoSSL, or your domain's existing cert) — do not
      run this over plain HTTP given it handles auth/payroll/financial data.
- [ ] `CRON_SECRET` set, and a cPanel cron job wired to
      `POST /api/cron` with the matching `x-cron-secret` header.
- [ ] `data/uploads/` (or wherever you pointed `lib/storage.ts`'s upload root)
      exists and is writable by the app's OS user.
- [ ] Passenger process count = 1 if using SQLite.
- [ ] Any optional integrations you actually plan to use (`LLM_*`,
      `RAZORPAY_*`, `IRP_*`, `GOOGLE_CLIENT_*`, `MARKETPLACE_WEBHOOK_KEY`) are
      set; everything else left unset is fine (degrades gracefully).
