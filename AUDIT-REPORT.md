# EITF HRMS & Payroll — Project Audit & Launch Plan

**Audit date:** 2026-11-14
**Repository:** https://github.com/adarshkumar077/hrms-payroll-system (`main` @ `bbce721`)
**Scope:** Code, configuration, dependencies, build/test health, security, deployment readiness

---

## 1. Project overview

A self-hosted **HR & Payroll platform for a single Indian company** (EITF Enhancing IT Infrastructure Pvt. Ltd.).

| Layer | Tech | Size |
|---|---|---|
| API | NestJS 11 + Prisma 6 + PostgreSQL 16 | ~22.5k LOC, 104 models, 23 migrations |
| Web | Next.js 15 + React 19 + Tailwind | ~21.7k LOC, 64 pages |
| Mobile | Expo 52 (React Native) | ~1.7k LOC, 20 screens |
| Infra | Docker Compose (nginx, api, web, postgres, redis, db-backup) + Cloudflare Tunnel or Let's Encrypt | — |

### Modules

- **Attendance** — selfie + GPS + address mark, geofence, QR, biometric webhook, overtime, daily earnings, late-mark → ULOB conversion
- **Leave** — multi-step approvals, accrual, carry-forward, encashment, ledger
- **Payroll** — CTC structures, LOP, loans/EMI, ESD, reimbursements, payslips
- **Employees** — full profile (personal, employment, bank, govt IDs, family), credentials
- **Supporting** — shifts, holidays, documents, onboarding/exit/FNF, assets, performance, training, helpdesk, workflows, reports, AI insights
- **Security** — 2FA (TOTP/OTP), IP allowlist, audit logs, login activity

**Roles:** `SUPER_ADMIN`, `ADMIN`, `HR`, `EMPLOYEE`

**Dormant code:** A CRM product ("Orbit") was merged and later disabled. Still present: `apps/orbit` (~61k LOC), `vendor/orbit-crm` (~61k LOC duplicate), `apps/api/src/crm`, CRM Prisma models, `apps/web/src/app/crm`, `_orbit_backup`.

---

## 2. Health check results

| Check | Result |
|---|---|
| `npm ci` | ✅ Pass |
| `npm run build:api` | ✅ Pass |
| `npm run build:web` | ✅ Pass (64 pages) |
| Tests | ✅ 17/17 pass — but only **3 spec files**, all in `attendance/` |
| `npm run lint` | ❌ Fails — `eslint` not installed (exit 127) |
| CI pipeline | ❌ None (no `.github/workflows`) |
| `npm audit --omit=dev` | ❌ **3 critical, 16 high, 3 moderate** |
| Load / soak tests | ❌ Never run (`docs/PERFORMANCE-REPORT.md` is an empty template) |

---

## 3. Launch readiness verdict

| Launch type | Ready? |
|---|---|
| Deployment tooling (Docker, VPS, tunnel, SSL) | ✅ Flexible and mostly ready |
| Internal pilot for EITF | ⚠️ After Phase 1 + 2 fixes below (~1–2 weeks) |
| Statutory-compliant Indian payroll | ❌ Needs Phase 2 work |
| Multi-company / SaaS product | ❌ Not designed for it yet (seed assumes one company) |

---

## 4. Findings

### 🔴 Critical — must fix before go-live

| # | Finding | Location |
|---|---|---|
| C1 | Real production secrets committed to git (Postgres password, JWT access/refresh secrets — word-like, not random) | `.env.production` |
| C2 | Fresh production DB is seeded with default Super Admin `admin@eitf.in` / `Admin@123`, `forcePasswordChange: false`, password printed to logs; runs automatically on container boot | `apps/api/prisma/seed.ts:9-11,110,116`, `apps/api/docker-entrypoint.sh` |
| C3 | 3 critical + 16 high dependency vulnerabilities (Next.js cache poisoning, `proxy-addr` IP spoofing, `tar` path traversal, multer DoS, nodemailer, body-parser, sharp, zod, …) | `package-lock.json` |
| C4 | All money stored as `Float` (57 Float fields, 0 Decimal) → paise rounding errors in payroll | `apps/api/prisma/schema.prisma` |
| C5 | Statutory payroll incomplete: TDS is a flat 1%, no income-tax slabs / old-vs-new regime, no ESI, PF is a fixed default amount, flat professional tax, no Form 16 / PF ECR / ESI challan exports | `apps/api/src/payroll/payroll-calculator.ts:50-112` |
| C6 | CORS wide open: `CORS_ORIGINS=*` in prod env, and code always allows any private-LAN IP and any `*.trycloudflare.com` / `*.ngrok*` origin with `credentials: true`, even in production | `.env.production`, `apps/api/src/main.ts:26-68` |

### 🟠 High

| # | Finding | Location |
|---|---|---|
| H1 | Access + refresh tokens stored in `localStorage`, and Content-Security-Policy is disabled → any XSS = session theft | `apps/web/src/lib/api.ts:48-61`, `apps/api/src/main.ts:13` |
| H2 | Selfies stored as base64 data URLs in Postgres `TEXT` columns → database bloat, slow backups; 12 MB JSON body limit | `schema.prisma:748-791`, `attendance.service.ts`, `main.ts:19` |
| H3 | Backups only go to a Docker volume on the same VPS — no off-site copy | `docker-compose.yml` (`db-backup` service) |
| H4 | `x-forwarded-for` taken as-is for client IP (spoofable); verify the IP allowlist guard does not rely on it | `apps/api/src/auth/auth.controller.ts` (`meta()`), `security/` |
| H5 | Hard-coded crypto fallback key `'eitf-dev-secret-key'` for integration secrets | `apps/api/src/common/secret-crypto.ts:5` |
| H6 | Test coverage very low: no tests for payroll, leave, auth, or RBAC/IDOR scoping | `apps/api/src/**` |
| H7 | Biometric webhook secret compared with `!==` (not constant-time) | `apps/api/src/attendance/attendance.service.ts:1792` |

### 🟡 Medium / cleanup

| # | Finding |
|---|---|
| M1 | ~120k LOC of dead CRM code (`apps/orbit`, `vendor/orbit-crm`, `_orbit_backup`, `apps/api/src/crm`, web `crm/` + `sso/orbit/` pages). `apps/orbit` is still a root workspace (slows installs, adds vulns). |
| M2 | 52 MB `deploy/bin/cloudflared.exe` committed; localhost TLS private key committed (`apps/web/certificates/localhost-key.pem`) |
| M3 | Docs inconsistent: README says seed is `admin@eitf.in / Admin@123`; `PROJECT-HANDOVER.md` lists 4 different demo accounts. Windows-only paths (`C:\Users\Aadarsh\...`) throughout. |
| M4 | Hard-coded LAN IP `192.168.1.69` printed in API startup logs (`main.ts`) |
| M5 | Mobile app not in root workspaces, still contains CRM screens (`crm-leads.tsx`, `crm-tasks.tsx`), lint is a placeholder |
| M6 | `npm run lint` runs `eslint --fix` (mutates files) and uses `&` (runs in background on Unix) |
| M7 | Swagger log line printed even when Swagger is disabled in production |
| M8 | Handover contacts table empty |

### ✅ What is done well

- bcrypt (cost 12), hashed refresh tokens, TOTP/OTP 2FA
- Global guard chain: Throttler → JWT → Roles → IP allowlist → 2FA
- Rate limits on login / OTP / setup routes
- `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`
- Helmet headers; Swagger disabled in production
- No raw / unsafe SQL anywhere
- Attendance + company audit logs
- Docker health checks on every service, auto `prisma migrate deploy` on boot, nightly DB backups with retention
- Biometric webhook is secret-protected; `setup/super-admin` only works when no admin exists

---

## 5. Execution plan (developer checklist)

### Phase 1 — Security blockers (≈ 2–3 days)

- [ ] **C1** Remove `.env.production` from git (`git rm --cached`), add `.env.production` to `.gitignore`, keep only `.env.production.example`
- [ ] **C1** Rotate `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (generate with `openssl rand -base64 48`); consider purging from git history
- [ ] **C2** Seed reads bootstrap admin email/password from env (`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`); refuse to seed in production if unset; set `forcePasswordChange: true`; stop logging the password
- [ ] **C3** Upgrade Next.js, NestJS / Express, multer, nodemailer, Prisma, sharp, zod; re-run `npm audit --omit=dev` until 0 critical / 0 high
- [ ] **C6** Production CORS = exact `PUBLIC_APP_URL` origin only; allow LAN / tunnel origins **only** when `NODE_ENV !== 'production'`
- [ ] **H5** Require `INTEGRATION_SECRET_KEY` in production; remove hard-coded fallback
- [ ] **H7** Use `crypto.timingSafeEqual` for webhook secret
- [ ] **H4** Set Express `trust proxy` to the nginx hop only and use `req.ip` instead of raw `x-forwarded-for`

### Phase 2 — Payroll correctness (≈ 1 week)

- [ ] **C4** Migrate all money fields from `Float` → `Decimal(14,2)`; update calculator to use decimal math (e.g. `Prisma.Decimal` / `decimal.js`) with explicit rounding rules
- [ ] **C5** TDS: implement income-tax slabs for old + new regime, employee regime choice, annual projection, monthly TDS
- [ ] **C5** PF: 12% employee / employer on basic (wage ceiling ₹15,000 configurable), EPS/EPF split
- [ ] **C5** ESI: 0.75% employee / 3.25% employer when gross ≤ ₹21,000 (configurable)
- [ ] **C5** Professional tax: state-wise slabs (configurable table)
- [ ] **C5** Exports: Form 16 / Form 12BA data, PF ECR file, ESI challan, bank transfer file
- [ ] Unit tests for every payroll rule (golden test cases with known salaries)

### Phase 3 — Storage, auth hardening, backups (≈ 3–4 days)

- [ ] **H2** Store selfies / documents in object storage (S3 / Cloudflare R2) via the existing `storage.service.ts`; DB keeps only the key/URL; migrate existing base64 rows
- [ ] **H1** Move refresh token to `httpOnly`, `Secure`, `SameSite=Strict` cookie; keep access token in memory; enable a strict CSP
- [ ] **H3** Ship nightly backups off-site (S3 / R2 / B2) with encryption; document and test a restore

### Phase 4 — Engineering hygiene (≈ 3–4 days)

- [ ] **M6** Install and configure ESLint for api + web; make `lint` non-mutating; fix `&` → sequential
- [ ] Add GitHub Actions CI: install → prisma generate → lint → test → build api + web → `npm audit`
- [ ] **H6** Tests for auth, RBAC / employee scoping (IDOR), leave approval chain, payroll run generate/approve
- [ ] **M1** Remove dormant CRM: `apps/orbit`, `vendor/orbit-crm`, `_orbit_backup`, `apps/api/src/crm`, web `crm/` + `sso/orbit/`, mobile CRM screens; drop CRM Prisma models in a migration
- [ ] **M2** Remove `cloudflared.exe` and localhost certs from git (download / generate in scripts instead)
- [ ] **M3/M4/M7** Fix docs (single source of truth for logins, cross-platform paths), remove hard-coded LAN IP and misleading Swagger log
- [ ] **M5** Add mobile app to workspaces, real lint, point to production API URL

### Phase 5 — Deploy & verify (≈ 2–3 days + pilot)

- [ ] Provision 4 GB VPS (Hetzner / DigitalOcean / Contabo), install Docker
- [ ] Set up domain + Cloudflare Tunnel (or nginx + certbot)
- [ ] Fill `.env.production` from the example with fresh secrets; `npm run docker:up`
- [ ] Run `npm run smoke-test`, `npm run security-test`, `node scripts/load-test.mjs <URL> 20`; fill `docs/PERFORMANCE-REPORT.md`
- [ ] Start soak test (`scripts/soak-test.mjs`) and uptime monitoring (`npm run monitor`)
- [ ] Pilot with one department for one full payroll cycle; reconcile payroll output against current system
- [ ] Build mobile apps via EAS against the production HTTPS URL

---

## 6. Deployment options (already supported in repo)

| Option | Files | Notes |
|---|---|---|
| Docker Compose + Cloudflare Tunnel (recommended) | `docker-compose.yml`, `deploy/cloudflare/config.yml` | No open ports; `npm run docker:up:tunnel` |
| Docker Compose + nginx + Let's Encrypt | `deploy/nginx/`, `deploy/certbot/init-letsencrypt.sh` | Requires ports 80/443 |
| Caddy | `deploy/Caddyfile` | Automatic HTTPS |
| systemd on VPS | `deploy/systemd/eitf-hrms.service`, `deploy/vps-install.sh` | Non-Docker option |

Minimum server: **4 GB RAM, 2 vCPU, 40 GB SSD** (more if selfies stay in the DB).

---

*Generated from a full code / config / dependency review plus fresh `npm ci`, builds, tests and `npm audit` on 2026-11-14.*

---

## Addendum (found during execution)

| # | Finding | Status |
|---|---|---|
| A1 | IP allowlist trusted the client-supplied `X-Forwarded-For` header, so anyone could bypass it | Fixed in T3 |
| A2 | Default minimum password length was 5 characters | Raised to 8 for new passwords (login still accepts existing shorter passwords). Existing databases keep their stored `security.password_min_length`; raise it in Security Settings |
| A3 | `forcePasswordChange` was only enforced by a web redirect, not by the API | Fixed in T12 / T12b |
| A5 | Payroll generation never paid the configured monthly gross to employees with a salary config (preview showed full salary; payslip ~₹0). LOP ignored employees without a Basic allowance | Fixed after T9: gross is a SALARY earning; LOP falls back to it. **HR must confirm gross excludes the allowances entered beside it** |
| A4 | Pre-existing schema drift: `import_jobs.error_report` naming, missing unique index on `roles(company_id, code)` | Fixed in T14 (migration de-duplicates roles first); CI now fails on any future drift |
| A6 | Employees could see their own DRAFT/REVIEW payroll in payroll history before HR approved the run | Fixed after T14 |
| A7 | Wrong 2FA codes never counted toward account lockout | Fixed after T14 (missing codes still don't count) |
