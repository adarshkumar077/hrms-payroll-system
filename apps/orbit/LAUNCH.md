# LAUNCH.md — Ship Orbit to a Client

The tight go-live runbook. Detailed reference: [SHARED-HOSTING-SETUP.md](SHARED-HOSTING-SETUP.md). Click-through verification: [UI-FLOW.md](UI-FLOW.md). Architecture: [PROJECT.md](PROJECT.md).

## ✅ Verified before you ship (I tested this exact build)
- **Standalone build boots and serves** — `/api/health` returns `{"status":"ok","db":true}`, `/login` returns 200.
- **All 4 Linux Prisma engines are bundled** in `deploy/node_modules/.prisma/client/` (Debian + RHEL, OpenSSL 1.1.x & 3.0.x) — **no `prisma generate` on the host required.**
- **One hard requirement:** the SQLite `DATABASE_URL` **must be an absolute path** in the standalone build (a relative path resolves against the bundled schema in `node_modules` and fails with `db:false`).

## 1. Build the upload artifact (on your machine)
```bash
npm install
npm run build          # produces .next/standalone (stop any dev server first — Windows DLL lock)
npm run db:reset       # optional: pristine demo data in prisma/dev.db
npm run package        # assembles ./deploy  (add -Zip via the script for orbit-deploy.zip)
```
`deploy/` (~101 MB) is fully self-contained: `server.js`, `.next/static`, `public`, the seeded `prisma/dev.db`, `node_modules` (incl. the Linux engines), `ENV.sample.txt`, `README-DEPLOY.txt`. **Upload its *contents*** to your host's application root.

## 2. Host prerequisites
- Shared hosting with **Node.js 18 or 20** (cPanel "Setup Node.js App" / CloudLinux Node Selector / Passenger). No Docker/root needed.
- **Do not run `next build` on the host** — shared RAM caps cause OOM. Always build locally and upload `deploy/`.

## 3. Database — pick one
| Option | When | How |
|---|---|---|
| **SQLite** (default, in the artifact) | Single client, low concurrency | Keep `deploy/prisma/dev.db`. Set an **absolute** `DATABASE_URL` (see §5). Pin the app to **1 process** (SQLite can't take concurrent writes). |
| **External Postgres** (Neon/Supabase free) | Real concurrency / reliability | On your machine: `set DATABASE_URL=postgres://…` then `npm run db:postgres:push && npm run db:postgres:seed`. Set that same `DATABASE_URL` on the host. Don't upload `dev.db`. |

## 4. cPanel "Setup Node.js App"
| Field | Value |
|---|---|
| Node version | 18 or 20 |
| Application root | where you uploaded `deploy/` contents |
| Application URL | your domain/subdomain |
| Application startup file | `server.js` |
| Passenger / port | app reads `PORT` from env |

## 5. Environment variables (set in the Node App "Environment variables" UI — NOT a .env file)
| Var | Required | Value |
|---|---|---|
| `AUTH_SECRET` | **YES** | A strong 48+ char random string. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. **Never reuse a secret from a doc/chat; don't commit it.** |
| `DATABASE_URL` | **YES** | SQLite: `file:/absolute/path/to/prisma/dev.db` (absolute!). Postgres: the connection string. |
| `NODE_ENV` | YES | `production` |
| `PORT` | usually | as the host requires |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | optional | Enables live AI (Groq free): `https://api.groq.com/openai/v1` / `gsk_…` / `llama-3.3-70b-versatile` |
| `OCR_MODEL` | optional | Live invoice OCR: `meta-llama/llama-4-scout-17b-16e-instruct` |
| `CRON_SECRET` | optional | Protects `/api/cron` (see §7) |
| `GOOGLE_CLIENT_ID/SECRET`, `RAZORPAY_*`, `IRP_*`, `MARKETPLACE_WEBHOOK_KEY` | optional | Light up SSO / payments / GST e-invoice / lead webhooks. All run in mock/manual mode until set. |

The app **runs fully without any optional var** — those just upgrade mock/manual features to live.

## 6. Start & first login
- Start the app (cPanel "Restart"/"Run"). Open the URL.
- Demo login: **`ceo@demo.orbit` / `orbit123`** (CEO) or `sales@demo.orbit` / `orbit123` (restricted).
- **Clean launch (no demo data):** delete `prisma/dev.db` on the host (SQLite) or use a fresh Postgres DB, then the first user creates their org at **`/signup`**.

## 7. Background jobs (payroll/SLA/compliance reminders)
Add a cPanel cron job (e.g. hourly):
```bash
curl -s -X POST https://YOURDOMAIN/api/cron -H "x-cron-secret: YOUR_CRON_SECRET"
```
(Omit the header if you didn't set `CRON_SECRET`.) Without cron, scheduled reminders simply don't fire — nothing else breaks.

## 8. Go-live checklist
- [ ] Strong `AUTH_SECRET` set (unique, not from any doc).
- [ ] `DATABASE_URL` is **absolute** (SQLite) or the real Postgres string.
- [ ] App starts; `https://YOURDOMAIN/api/health` → `{"status":"ok","db":true}`.
- [ ] HTTPS on (cPanel AutoSSL / Let's Encrypt).
- [ ] SQLite → app pinned to 1 process; `prisma/dev.db` path is **writable**.
- [ ] File uploads dir (`data/uploads/`) is writable (or wire S3 — see GAPS.md #9).
- [ ] Cron added if you want reminders.
- [ ] Walked the smoke tests in [UI-FLOW.md](UI-FLOW.md) §5.

## 9. Honest limits of shared hosting (from SHARED-HOSTING-SETUP.md)
1. **`next build` will OOM** on shared RAM — build locally (this runbook does).
2. **SQLite + no daemon** is single-process and fragile at scale — move to Postgres for real load, or off shared hosting.
3. **Local file storage** (`data/uploads/`) works on persistent shared disks but not serverless — swap for S3 before scaling.

Security items to close before real client data: `GAPS.md` #1 (tenant scoping), #4 (encrypt 2FA secrets / strong `AUTH_SECRET`), #5 (SSO CSRF). Statutory maths (`lib/compliance/*`) should get a CA review.
