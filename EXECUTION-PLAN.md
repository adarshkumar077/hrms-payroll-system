# EITF HRMS — Execution Plan

Companion to [AUDIT-REPORT.md](AUDIT-REPORT.md). Every audit finding is split into small **end-to-end tasks**. Each task has:

- a **goal**: what is true when it's done
- the **files** it owns
- **acceptance** checks
- the **model** assigned to it

Tasks in the same wave touch different files, so they run in parallel. Each one runs in its own git worktree and branch. Waves run in order because later waves build on earlier ones.

**Model routing:** the cheapest model that can reliably deliver the goal.

| Model | Used for |
|---|---|
| **Haiku** | Mechanical edits, config, docs, deletions with a clear list |
| **Sonnet** | Normal feature or refactor work, tests, CI, dependency upgrades |
| **Opus** | Money math, tax rules, auth/session redesign: anything where a subtle bug is expensive |

**Branch flow:** `main` → `audit-fixes` (integration branch) ← one branch per task, merged after review. Nothing is pushed until the owner approves.

---

## Wave 1: Security blockers and cleanup (parallel)

### T1: Secrets and env hygiene · Haiku
- **Goal:** No real secret is tracked in git, and every required secret is documented.
- **Files:** `.gitignore`, `.env.production` (untrack only), `.env.production.example`, `.env.example`
- **Do:**
  - `git rm --cached .env.production` and ignore `.env.production`.
  - In the examples, add `INTEGRATION_SECRET_KEY`, `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`, each with an `openssl rand -base64 48` hint.
  - Set the example `CORS_ORIGINS` to the HTTPS origin, never `*`.
- **Acceptance:**
  - `git ls-files | grep -x .env.production` returns nothing.
  - The local file still exists on disk.
- **Owner action, not automated:** rotate the real secrets on the server, and optionally purge them from git history.

### T2: Safe bootstrap admin · Sonnet
- **Goal:** A fresh production database never gets a known default password.
- **Files:**
  - `apps/api/prisma/seed.ts`
  - `apps/api/docker-entrypoint.sh`
  - `docker-compose.yml` (api env section only)
  - `docker-compose.prod.yml`
- **Do:**
  - Read the bootstrap admin email and password from env.
  - In production, refuse to create the admin when either is unset. Print a clear message and exit 0 so boot continues; `/auth/setup/super-admin` still works.
  - Use the dev default only when `NODE_ENV !== 'production'`.
  - Set `forcePasswordChange: true` and never log the password.
- **Acceptance:**
  - Running the seed with `NODE_ENV=production` and no env creates no user.
  - With env set, it creates one user with `force_password_change = true`.
  - `npm run build:api` passes.

### T3: API hardening · Sonnet
- **Goal:** The CORS policy, client IP detection, the IP allowlist and secret handling can't be bypassed in production.
- **Files:**
  - `apps/api/src/main.ts`
  - `apps/api/src/common/secret-crypto.ts`
  - `apps/api/src/auth/auth.controller.ts` (`meta()` only)
  - `apps/api/src/security/ip-allowlist.guard.ts`
  - `apps/api/src/security/security.controller.ts` (IP read only)
  - `apps/api/src/attendance/attendance.service.ts` (webhook compare only, near line 1792)
- **Do:**
  - **CORS in production:** allow only the `CORS_ORIGINS` list plus the `PUBLIC_APP_URL` origin, and drop `*`. The LAN, trycloudflare and ngrok origins are allowed only outside production.
  - **Client IP:** call `app.set('trust proxy', …)` with a configurable `TRUST_PROXY` (default `1`). Use `req.ip` everywhere instead of the raw `x-forwarded-for` header. **This closes an IP-allowlist bypass**: `ip-allowlist.guard.ts` currently trusts a header any client can set.
  - **Integration key:** `INTEGRATION_SECRET_KEY` is required in production, so throw at boot if it's missing. Keep the dev fallback for development only.
  - **Webhook secret:** compare with `crypto.timingSafeEqual`.
  - **Startup logs:** remove the hard-coded `192.168.1.69` line, and print the Swagger line only when Swagger is enabled.
- **Acceptance:**
  - `npm run build:api` passes and the existing tests pass.
  - New unit tests cover:
    - the CORS origin function in production vs development
    - the allowlist using `req.ip`

### T4: Remove dormant CRM · Sonnet
- **Goal:** The repo contains only the HRMS product, and nothing references the CRM.
- **Files:**
  - Delete: `apps/orbit/`, `vendor/orbit-crm/`, `vendor/ORBIT-CRM.md`, `_orbit_backup/`, `apps/api/src/crm/`, `apps/web/src/app/crm/`, `apps/web/src/app/sso/orbit/`, `apps/mobile/app/crm-*.tsx`
  - Delete the CRM merge reports in the root: `UNIFIED-MERGE.md`, `CRM-MERGE-STATUS.md`, `ORBIT-FULL-MERGE.md`, `SELF-CONTAINED-CRM-MERGE.md`, `COMPLETION-REPORT-ORBIT-MERGE.md`, `COMPLETION-REPORT-SELF-CONTAINED.md`, `AUDIT-CLONE-MERGE-BILLING.md`
  - Edit: root `package.json` (drop the `apps/orbit` workspace and the orbit scripts), `package-lock.json` (regenerate), the CRM models in `apps/api/prisma/schema.prisma` plus a new migration that drops those tables, and any remaining imports, links or redirects in web, mobile and API
- **Acceptance:**
  - `grep -ri "orbit\|crm" apps/ --include=*.ts --include=*.tsx -l` leaves only intentional redirect rules.
  - `npm ci`, `build:api` and `build:web` pass.
  - `prisma migrate diff` is clean.

### T5: Docs and repo junk · Haiku
- **Goal:** The docs match reality and the repo carries no binaries or private keys.
- **Files:**
  - `README.md`, `PROJECT-HANDOVER.md`, `docs/MANUAL-START.md`, `docs/DEPLOYMENT.md`
  - Untrack and ignore: `deploy/bin/cloudflared.exe`, `apps/web/certificates/*.pem`
  - The scripts that use those files: `scripts/start-*.mjs` and the web `dev:https` script. Download cloudflared or generate the certs when missing, or print instructions.
- **Do:**
  - Use one source of truth for logins: the bootstrap admin comes from env, as in T2.
  - Replace `C:\Users\Aadarsh\...` with relative or cross-platform commands.
  - Drop the CRM rows from the handover.
- **Acceptance:**
  - No `.exe` or `.pem` is tracked.
  - `grep -rn "Aadarsh" *.md docs/` returns nothing.

---

## Wave 2: Dependencies, money types, tooling (after wave 1 is merged)

### T6: Dependency upgrades · Sonnet
- **Goal:** `npm audit --omit=dev` shows 0 critical and 0 high.
- **Files:** `package.json` files and `package-lock.json` only, plus minimal code fixes for breaking changes
- **Do:** Upgrade:
  - Next.js
  - NestJS, Express and multer
  - Prisma
  - nodemailer
  - sharp
  - zod
  - otplib (v13)
  - anything else flagged
- **Acceptance:**
  - The audit is clean, or each remaining item is listed with a reason.
  - Both builds and the tests pass.

### T7: Money as Decimal · Opus
- **Goal:** Every monetary value is stored as `Decimal(14,2)` and calculated with exact decimal math.
- **Files:**
  - `apps/api/prisma/schema.prisma` (the money `Float` fields only) plus a migration
  - `apps/api/src/payroll/**`
  - Money code in `employees/`, `attendance/` (earnings and OT pay), `leave/` (encashment), loans, ESD, reimbursements, `reports/`
  - Web formatting where it parses numbers
- **Do:**
  - Classify each of the 57 `Float` fields as money or non-money. Non-money includes GPS coordinates, percentages and multipliers; those stay `Float`.
  - Migrate the money fields.
  - Use `Prisma.Decimal` (decimal.js) in the calculator.
  - Apply one rounding rule: round half-up to 2 decimal places at line level.
  - Serialize as string or number consistently in the API.
- **Acceptance:**
  - The migration applies to a copy of the seed database.
  - Golden tests show `payroll-calculator` produces exact paise.
  - Both builds pass.

### T8: ESLint and CI · Sonnet
- **Goal:** Every push is linted, tested and built automatically.
- **Files:**
  - ESLint config and devDependencies for the api and web
  - Root `lint` script: make it non-mutating and sequential
  - `.github/workflows/ci.yml`, which runs install → prisma generate → lint → test → build api and web → `npm audit --omit=dev --audit-level=high`
- **Acceptance:**
  - `npm run lint` exits 0 locally. Fix the errors, or turn off noisy rules with a comment explaining why.
  - The workflow YAML is valid.
- **Note:** This edits `package.json` too, so run it **after T6** is merged.

---

## Wave 3: Payroll compliance, storage, sessions, backups (after wave 2 is merged)

### T9: Indian statutory payroll engine · Opus
- **Goal:** Payroll computes TDS, PF, ESI and professional tax correctly, with configurable rule tables.
- **Files:**
  - `apps/api/src/payroll/` (calculator, a new `statutory/` folder)
  - Schema for the rule tables and the employee's tax-regime choice
  - The payroll settings UI in web
- **Do:**
  - **TDS:** old and new regime slabs with standard deduction, rebate (87A), cess, annual projection and monthly TDS, with slabs stored as data per financial year.
  - **PF:** 12% from the employee and 12% from the employer on Basic (plus DA). The wage ceiling is configurable (default ₹15,000), with the EPS/EPF split.
  - **ESI:** 0.75% from the employee and 3.25% from the employer when gross pay is at or below a threshold (default ₹21,000).
  - **Professional tax:** state-wise slab table.
  - Keep the per-employee toggles.
- **Acceptance:**
  - Golden test cases pass for a range of salaries in both regimes.
  - The defaults are documented in `docs/PAYROLL-RULES.md`, marked **"verify with CA before go-live"**.

### T10: Statutory exports · Sonnet *(after T9)*
- **Goal:** HR can download the files needed to file and pay.
- **Do:**
  - PF ECR text file
  - ESI contribution sheet
  - Form 16 / 12BA data export (CSV or XLSX)
  - Bank salary transfer file (CSV)
- Use the existing export engine (`apps/api/src/common/export.engine.ts`).
- **Acceptance:** API endpoints exist, are restricted to HR and Super Admin, and have tests on file format.

### T11: Object storage for selfies and documents · Sonnet
- **Goal:** Images and files live in S3-compatible storage, and the database stores only keys.
- **Files:**
  - `apps/api/src/documents/storage.service.ts` (add an S3/R2 driver chosen by env; local remains the default)
  - The selfie write path in `attendance.service.ts`
  - Selfie read and serve via signed URLs, gated by the existing privacy rules
  - A one-off migration script that moves existing base64 rows
  - Lower the JSON body limit once selfies upload as files
- **Acceptance:**
  - Tests pass with the local driver.
  - The migration script supports a dry-run mode.
  - No new rows contain `data:image`.

### T12: Cookie sessions and CSP · Opus
- **Goal:** An XSS bug can't steal a session.
- **Files:**
  - `apps/api/src/auth/**`
  - `apps/web/src/lib/api.ts` and the auth context
  - `next.config.js` (headers)
  - `apps/api/src/main.ts` (cookie-parser only)
- **Do:**
  - Put the refresh token in an `httpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`.
  - Keep the access token in memory only.
  - On page load, call silent refresh.
  - Add CSRF protection for cookie-authenticated routes.
  - Add a strict CSP via Next headers.
  - The mobile app keeps bearer tokens in SecureStore.
  - **Enforce `forcePasswordChange` on the server** (found in T2): add a global guard that returns 403 for every route except change-password, logout and `auth/me` while the flag is set, plus a web route guard that keeps the user on `/account/password`.
- **Acceptance:**
  - No tokens appear in `localStorage`.
  - Login, refresh, logout and 2FA work end to end; test with a browser run.

### T13: Off-site encrypted backups · Haiku
- **Goal:** Nightly backups also land off the server, encrypted, and a restore has been tested.
- **Files:** the `db-backup` service in `docker-compose.yml`, a new `deploy/backup/` script (pg_dump → `age`/gpg → rclone to S3/R2/B2), `docs/BACKUP_AND_RECOVERY.md`
- **Acceptance:**
  - The script works with the remote unset (it skips the upload with a warning).
  - The restore steps are documented.

### T14: Core test suite · Sonnet
- **Goal:** Auth, RBAC and the main workflows are protected against regressions.
- **Do:** Add tests for:
  - login, 2FA and lockout
  - role guards
  - employee-scope and IDOR checks (`authorization.util.ts`)
  - the leave approval chain
  - payroll generate → approve → payslip visibility
- **Acceptance:** CI runs them, and they pass.

---

## Wave 4: Launch (owner-led, assisted)

| Task | Who |
|---|---|
| T15: Provision the VPS and domain, set up Cloudflare Tunnel, fill in `.env.production` with **new** secrets | Owner |
| T16: `docker:up`, then smoke, security and load tests; fill in `docs/PERFORMANCE-REPORT.md` | Sonnet runs the scripts against the URL you give it |
| T17: Soak test and monitoring | Owner starts it; Haiku summarises the logs |
| T18: Pilot one department through one full payroll cycle; reconcile against the current system | Owner + HR |
| T19: EAS mobile builds against the production URL | Owner (needs an Expo account) |

---

## Progress

| Task | Model | Wave | Status | Branch |
|---|---|---|---|---|
| T1 Secrets and env | Haiku | 1 | ✅ merged | |
| T2 Bootstrap admin | Sonnet | 1 | ✅ merged | |
| T3 API hardening | Sonnet | 1 | ✅ merged (+ proxy-trust fix) | |
| T4 Remove CRM | Sonnet | 1 | ✅ merged | |
| T5 Docs and junk | Haiku | 1 | ✅ merged (+ LAN-IP cleanup) | |
| T6 Dependency upgrades | Sonnet | 2 | ✅ merged (audit: 0 prod vulns) | |
| T7 Money as Decimal | Opus | 2 | 🔄 running | |
| T8 ESLint and CI | Sonnet | 2 (after T6) | ✅ merged (0 errors, 48 warnings) | |
| T9 Statutory engine | Opus | 3 | ⏳ | |
| T10 Statutory exports | Sonnet | 3 (after T9) | ⏳ | |
| T11 Object storage | Sonnet | 3 | ⏳ | |
| T12 Cookie sessions and CSP | Opus | 3 | 🔄 running | |
| T13 Off-site backups | Haiku | 3 | ✅ merged | |
| T14 Core tests | Sonnet | 3 | ⏳ | |
| T15–T19 Launch | Owner | 4 | ⏳ | |
