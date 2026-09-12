# LARAVEL-BUILD-TASKS.md — Orbit → Laravel/MySQL + Static Frontend Rebuild Backlog

Executable WBS for the rewrite described in `LARAVEL-REBUILD-PLAN.md`: **Laravel 11 REST API + MySQL** (Bluehost shared-host compatible) **+ Next.js `output:"export"` (or Vite) static SPA frontend**. This is a **second implementation** of Orbit — almost nothing transfers mechanically except the *shape* of the data model and the *exact* statutory/ledger maths, which must be ported number-for-number.

Grounded in: `PROJECT.md`, `LARAVEL-REBUILD-PLAN.md`, `GAPS.md`, `prisma/schema.prisma` (36 models), `lib/compliance/payroll.ts`, `lib/compliance/gst.ts`, `lib/gl.ts`, `lib/auth.ts`, `lib/rbac.ts`, `lib/nav.ts`, `app/(app)/finance/invoices/{page,actions}.tsx`.

No Laravel/PHP code is written in this document — planning only.

---

## 0. How to use this backlog

- Every task has a stable **ID** (`WORKSTREAM-NN`), one-line description, **Deps** (task IDs that must merge first), **target file(s)**, **acceptance criteria**, and a **model tier**.
- Model tiers (token-optimization guidance, not a hard rule): **H = Haiku** (mechanical: CRUD scaffolding, migrations, boilerplate resources/routes), **S = Sonnet** (business logic, services, auth, integrations), **O = Opus** (only the highest-stakes correctness ports: statutory maths, GL balancing, payroll↔GL integration).
- Work is grouped into **7 execution waves** (§3). Within a wave, tasks are safe to fan out to parallel agents *unless* they touch the same file (noted per wave).
- **Fix forward, don't regress**: several TS behaviors already carry a documented fix for a past bug (see `GAPS.md` resolution table — CSRF state, upload validation, cron locking, ticket sort, etc.). Port the **fixed** version, not the original bug. Each relevant task calls this out explicitly.

---

## 1. THE RISK CALLOUT — read this before touching COMP-* or GL-*

**`lib/compliance/*` and `lib/gl.ts` are the highest-risk tasks in this entire rewrite.** They are India statutory law and double-entry accounting — a silent rounding or threshold divergence here is a legal-correctness bug, not a cosmetic one, and `GAPS.md` #12 already flags the TS originals as CA-unaudited. A PHP port that produces *different numbers* than the current TS is strictly worse than not rewriting at all.

**Mandatory method for every COMP-* / GL-* task: port the test file FIRST, translated 1:1 from the vitest source, asserting the exact literal values below — then write the PHP service until the ported tests pass. Do not write the service first and back-fill tests.**

Known-value anchors to assert against (pulled directly from `lib/compliance/payroll.test.ts`, `lib/compliance/gst.test.ts`, `lib/gl.test.ts` — do not re-derive, copy these):

| Function | Input | Must equal |
|---|---|---|
| `pfEmployee` | `basic=20000` (above ₹15k ceiling) | `1800` |
| `pfEmployee` | `basic=10001` | `1200` (rounding) |
| `esiEmployee` | `gross=21000` (at threshold) | `158` (`21000*0.0075=157.5→158`) |
| `esiEmployer` | `gross=21000` | `683` (`21000*0.0325=682.5→683`) |
| `esiEmployee` | `gross=25000` (above threshold) | `0` |
| `professionalTax` | `gross=10000` | `175`; `gross=10001` → `200` |
| `estimatedTds` | `annualGross=1000000` | `≈2817` (±10) |
| `computePayslip` | `gross=50000,basic=25000,annualGross=600000,lopDays=0` | `netPay=48000` |
| `computePayslip` | `gross=30000,basic=15000,lopDays=9,daysInMonth=30` | `esiEmployee=158`, `pt=200` (uses **payableGross**, not gross) |
| `computeGst` (intra) | `[{qty:1,unitPrice:1000,taxRate:18}]` | `cgst=90, sgst=90, igst=0, grandTotal=1180` |
| `computeGst` (inter) | same line, `intraState=false` | `igst=180, cgst=0, sgst=0` |
| `computeGst` (rounding) | `unitPrice=333.33, taxRate=18` | `subtotal=333.33, cgst=30, sgst=30` |
| `requiresEInvoice` | `aato=EINVOICE_AATO_THRESHOLD` (exactly ₹5cr) | `false` (strictly `>`, not `>=`) |
| `postInvoiceJournal` | `subtotal=1000, grandTotal=1180` | `Dr AR 1180 = Cr Sales 1000 + Cr GST 180` (balances) |
| `postPayrollJournal` | `grossTotal=100000, netTotal=82000` | `Dr Salaries Exp 100000 = Cr Payable 82000 + Cr Statutory 18000` |
| `postJournal` | any `Dr ≠ Cr` | **throws** |

**PHP-specific correctness traps to explicitly test for** (these are exactly the kind of bug a naive port introduces):
1. **`round()` semantics** — JS `Math.round` and PHP `round()` both round half-away-from-zero for positive numbers, so straight `round($n*100)/100` should match the TS `round2` — but write the boundary cases (`1180.455`, `100000.456`) as explicit tests, don't assume.
2. **`mockIrn`'s 32-bit hash overflow** (`lib/compliance/gst.ts` uses `(h * 31 + charCode + i) >>> 0`) — PHP ints are 64-bit with no `>>> 0` operator. The port must explicitly mask with `& 0xFFFFFFFF` after each step or the IRN sequence diverges from the TS one for longer seeds. Test: same seed in both languages must currently produce the same 64-hex-char string (cross-check by literally running the TS function on a fixed seed and hardcoding the expected output into the PHP test).
3. **PT is Maharashtra-only, TDS is "very simplified"** (`GAPS.md` #12) — port **as-is**, do not "improve" the maths mid-rewrite; scope creep here creates a *third* set of numbers to reconcile. File a follow-up, don't fix inline.
4. **GL auto-post derives the tax/statutory line as a subtraction** (`gst = grandTotal - subtotal`, `statutory = grossTotal - netTotal`) specifically so rounding never breaks the balance invariant — preserve this exact derivation, do not recompute CGST+SGST+IGST independently in the journal poster (that reintroduces the rounding bug the original code deliberately avoids).

Both `COMP-*` and `GL-*` require a **second-pass review by a different agent (or opus) than the one who wrote the port**, specifically diffing outputs against the table above line-by-line before the task is marked done. Get a practicing CA to eyeball `payroll.php`/`gst.php` before this ships to real payroll data (same caveat as the original — this is external, not code-fixable).

---

## 2. Workstreams (epics)

| Epic | Prefix | # Tasks | Theme |
|---|---|---|---|
| Project scaffold | `PROJ` | 6 | Laravel init, frontend init decision, config, routing skeleton |
| Database / migrations | `DB` | 21 | 36 Prisma models → MySQL migrations + Eloquent models + seeder |
| Auth (Sanctum+2FA+RBAC) | `AUTH` | 12 | Session, 2FA TOTP, password reset/invite, RBAC gates, SSO |
| Multi-tenancy | `TEN` | 4 | `BelongsToTenant` scope, isolation tests |
| Compliance services | `COMP` | 6 | PF/ESI/PT/TDS + GST — **highest risk**, see §1 |
| General Ledger | `GL` | 7 | Chart of accounts, balanced posting, auto-post hooks, reports — **highest risk**, see §1 |
| CRM API | `CRM` | 9 | Accounts, contacts, leads, opportunities, products, quotations, tickets, activities |
| HR API | `HR` | 4 | Employees, leave, attendance (geofenced) |
| Payroll API | `PAY` | 5 | Salary structures, payroll run lifecycle, payslips |
| Inventory API | `INV` | 5 | Warehouses, items, stock moves, purchase orders |
| Finance/AP/Bank API | `FIN` | 8 | GST invoices, vendor bills (AP), bank reconciliation, ledger reports |
| AI/OCR adapters | `AI` | 6 | Guzzle→LLM (Groq/OpenAI-compatible), lead scoring, copilot intents, OCR |
| Integrations | `INT` | 10 | Razorpay, billing, IRP e-invoice, marketplace, SSO, notify, storage, CSV, search |
| PDF | `PDF` | 5 | dompdf invoice/payslip/quotation printables |
| Jobs/scheduler | `JOB` | 4 | Cron-driven job runner (locked), Laravel Scheduler + Queue wiring |
| Frontend (static SPA) | `FE` | 33 | Per-page client-fetch rebuild of all 42 RSC pages |
| Testing | `TEST` | 4 | Cross-cutting harness + regression + tenant/RBAC suites |
| Deployment | `DEPLOY` | 8 | Bluehost shared-host runbook |
| **Total** | | **157** | |

---

## 3. Execution waves

| Wave | Theme | Task IDs | Files touched (collision note) |
|---|---|---|---|
| **1 — Bootstrap** (sequential prerequisite, do first, ~3 tasks) | Decisions everything else depends on | `PROJ-01`, `PROJ-02`, `DB-01` | New `laravel/` root, new `frontend/` root, a one-page ADR — **zero overlap**, but nothing in Wave 2 can start until these land. |
| **2 — Foundation fan-out** | Config, migrations, pure-logic ports, base test harness, FE kit | `PROJ-03..06`, `DB-02..10`, `COMP-01/02`, `GL-01`, `FE-01`, `TEST-01` | Each migration is its own file under `database/migrations/` — safe parallel. `COMP-01/02`/`GL-01` are isolated new files under `app/Services/`. `FE-01` is a separate repo root. |
| **3 — Models, Auth, Tenancy, GL wiring, FE kit** | Turn migrations into models; build the security spine; wire GL to real tables | `DB-11..21`, `AUTH-01..12`, `TEN-01..04`, `GL-02..07`, `FE-02..06` | `AUTH-*` all land in `app/Http/Controllers/Auth/*` — **assign to one agent/session, not parallel fan-out**, since steps share files (login → 2FA → session). `DB-11..19` are one file per model group — parallel-safe. |
| **4 — Business module APIs** | CRM/HR/Payroll/Inventory/Finance controllers | `CRM-01..09`, `HR-01..04`, `PAY-01..05`, `INV-01..05`, `FIN-01..08` | Each module owns its own `app/Http/Controllers/<Module>/*` directory — fully parallel across modules. **Within** a module, sequence per the Deps column (e.g. `PAY-02` before `PAY-03`). `FIN-02`'s e-invoice sub-step soft-depends on `INT-03` (Wave 5) — stub it and wire later. |
| **5 — Integrations, AI/OCR, PDF, Jobs** | Everything pluggable-and-mock | `AI-01..06`, `INT-01..10`, `PDF-01..05`, `JOB-01..04` | All separate `app/Services/<Integration>/*` files — parallel-safe. |
| **6 — Frontend pages** | One page per task, fetching Wave-4 APIs | `FE-07..32` | Each is its own page directory under `frontend/src/pages/<module>/` (or `app/(pages)` if using Next export) — parallel-safe once `FE-05` (shell) lands. |
| **7 — Consolidation + Deploy** | Full regression, RBAC/tenant sweep, E2E, shared-host rollout | `TEST-02..04`, `FE-33`, `DEPLOY-01..08` | Deploy tasks are ops runbooks, not code — sequential by nature (provision → upload → cron → smoke test). |

**Wave 1 task IDs to dispatch immediately:** `PROJ-01`, `PROJ-02`, `DB-01`.

---

## 4. Task tables

### 4.1 PROJ — Project scaffold

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| PROJ-01 | Init Laravel 11 skeleton (`composer create-project laravel/laravel`), PHP 8.2 target, `config/app.php` timezone `Asia/Kolkata`, base directory layout (`app/Services`, `app/Http/Controllers/<Module>`) | — | S | `php artisan serve` boots; `composer.json` targets PHP ^8.2; folder skeleton exists for every module in §2. |
| PROJ-02 | **Decision + ADR**: Next.js `output:"export"` (reuse Tailwind/components) vs plain Vite SPA for the static frontend — pick one, document why (per `LARAVEL-REBUILD-PLAN.md` §"frontend catch") | — | S | A short ADR file states the choice + 3 reasons; unblocks all `FE-*`. |
| PROJ-03 | CORS + Sanctum SPA config for a **cross-origin** static frontend (public_html) talking to `/api` — decide cookie-based Sanctum SPA auth vs Bearer token (shared-host subdomain setup makes cookie SameSite tricky; default to **Bearer token via `sanctum` personal-access-token** unless frontend is proven same-registrable-domain) | PROJ-01 | S | `config/cors.php` + `config/sanctum.php` committed; decision documented; a stub authenticated request round-trips from a different origin in local dev. |
| PROJ-04 | `.env.example` matrix mirroring every pluggable integration's env vars (AI/IRP/Razorpay/SSO/email/SMS/WhatsApp/OCR) — port the "mock-until-keys" pattern list from `PROJECT.md` | PROJ-01 | H | `.env.example` has one commented block per integration; app boots with **zero** of them set (all mock mode). |
| PROJ-05 | Composer dependency manifest: `laravel/sanctum`, `pragmarx/google2fa-qrcode`, `barryvdh/laravel-dompdf`, `guzzlehttp/guzzle`, `razorpay/razorpay`, `league/csv` | PROJ-01 | H | `composer.json` has all deps pinned; `composer install` succeeds; `vendor/` documented as **must be uploaded** (shared host may lack Composer — ties to `DEPLOY-01`). |
| PROJ-06 | `routes/api.php` skeleton — versioned `/api/v1` route groups mirroring `lib/nav.ts` module structure; base `Controller` class + JSON response/error envelope convention (`{data, error, meta}`) | PROJ-01 | S | Route list (`php artisan route:list`) shows one group per nav module; a 404/422/500 all return the same envelope shape. |

### 4.2 DB — Database / migrations (36 models)

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| DB-01 | **Decision**: primary key strategy — keep Prisma's `cuid()` string IDs (via `Str::ulid()`/`Str::orderedUuid()` + `HasUlids` trait) vs switch to bigint auto-increment. Recommend **string ULID** to minimize FK-type churn and keep IDs sortable/opaque like today. Document in an ADR. | — | S | ADR chosen; a one-line "PK convention" note that every migration task below follows. |
| DB-02 | Migration: platform core — `tenants, roles, users, event_logs` | DB-01, PROJ-01 | H | Columns match `prisma/schema.prisma` Tenant/Role/User/EventLog 1:1 (incl. `is_ceo`, `hourly_cost`, `two_factor_secret`, `reset_token`, indexes on `[tenant_id,type]`/`[tenant_id,created_at]`). |
| DB-03 | Migration: CRM — `accounts, contacts, leads, opportunities, products, quotations, quotation_lines, tickets, activities` | DB-01, PROJ-01 | H | 9 tables, FKs + indexes match schema (`[tenant_id,status]` on leads/tickets, `[tenant_id,stage]` on opportunities). |
| DB-04 | Migration: HR — `employees, leave_applications, attendances` | DB-01, PROJ-01 | H | Includes geofencing columns (`check_in_lat/lng`, `distance_m`) on attendances. |
| DB-05 | Migration: Payroll — `salary_structures, payroll_runs, payslips` | DB-01, PROJ-01 | H | `salary_structures.employee_id` unique; payslip columns match Payslip model exactly (pf/esi employee+employer split, `pt`, `tds`, `loss_of_pay`, `net_pay`). |
| DB-06 | Migration: Inventory — `warehouses, items, stock_moves, purchase_orders` | DB-01, PROJ-01 | H | `items.product_id` unique nullable; `stock_moves.qty` signed float for +in/-out. |
| DB-07 | Migration: Finance GST — `invoices, invoice_lines` | DB-01, PROJ-01 | H | Invoice columns incl. `irn, ack_no, eway_bill_no` nullable, `[tenant_id,status]` index. |
| DB-08 | Migration: Platform B — `notifications, jobs, attachments, payments, subscriptions` | DB-01, PROJ-01 | H | **Preserve the scalar `tenant_id` (no FK constraint)** on these 5 exactly as the Prisma comment intends — but see note below for an *optional* hardening flag. |
| DB-09 | Migration: GL — `ledger_accounts, journal_entries, journal_lines` | DB-01, PROJ-01 | H | `journal_lines.journal_entry_id` FK with `onDelete cascade`; `[tenant_id,accountId]` and `[tenant_id,date]` indexes present. |
| DB-10 | Migration: AP/Bank — `vendor_bills, vendor_bill_lines, bank_transactions` | DB-01, PROJ-01 | H | `bank_transactions` has `direction` enum-like string (`credit`/`debit`), `[tenant_id,reconciled]` index. |
| DB-11 | Eloquent models: platform core (`Tenant, Role, User, EventLog`) + define the `BelongsToTenant` trait contract (used by TEN-01) | DB-02 | S | Relationships (`Tenant hasMany Users/Roles/...`) match Prisma; `User` casts `two_factor_enabled` bool, hides secret fields from `toArray()`. |
| DB-12 | Eloquent models: CRM (9 models) + relationships (Account↔Contacts/Opportunities/Tickets/Invoices, Quotation↔Lines↔Product) | DB-03, DB-11 | S | Each model's `fillable`/`casts` match schema; nested `with()` eager-loads work for a quotation+lines+product round trip. |
| DB-13 | Eloquent models: HR (3) | DB-04, DB-11 | H | `Employee belongsTo User (nullable, unique)`, `hasMany Leaves/Attendances`, `hasOne SalaryStructure`. |
| DB-14 | Eloquent models: Payroll (3) | DB-05, DB-13 | H | `PayrollRun hasMany Payslips (cascade)`; `Payslip belongsTo Employee`. |
| DB-15 | Eloquent models: Inventory (4) | DB-06, DB-11 | H | `Item belongsTo Product (nullable)`, `hasMany StockMoves`. |
| DB-16 | Eloquent models: Finance GST (2) | DB-07, DB-11 | H | `Invoice hasMany Lines (cascade)`. |
| DB-17 | Eloquent models: Platform B (5) | DB-08, DB-11 | H | Scalar `tenant_id` scoping applied via the same `BelongsToTenant` trait even without an FK (query-level enforcement, matching `lib/tenantDb.ts`'s intent). |
| DB-18 | Eloquent models: GL (3) | DB-09, DB-11 | S | `JournalEntry hasMany Lines (cascade)`; `LedgerAccount` exposes an `isDebitNormal()` accessor mirroring `gl-constants.ts`. |
| DB-19 | Eloquent models: AP/Bank (3) | DB-10, DB-11 | H | `VendorBill hasMany Lines (cascade)`. |
| DB-20 | Seeder — port `prisma/seed.ts` demo data (2 demo users incl. `ceo@demo.orbit`/`sales@demo.orbit`, sample rows across every module) to a Laravel `DatabaseSeeder` + per-module seeders/factories | DB-11..19 | S | `php artisan db:seed` produces a login-ready demo tenant identical in shape (same counts per module) to the current `npm run setup` seed. |
| DB-21 | Schema-parity checklist — a one-time doc/test comparing every migration's columns against the `prisma/schema.prisma` field list, so no model/field is silently dropped in translation | DB-02..10 | S | Checklist covers all 36 models, all fields accounted for (ported, intentionally renamed, or explicitly deferred with a reason). |

> Note on DB-08: the original schema deliberately used a **scalar `tenantId` with no FK** on 5 models to avoid `Tenant` back-relation churn (see `PROJECT.md` "surprising things" #8 and `GAPS.md` #1). MySQL migrations *can* add a real FK cheaply now — flag this as an **optional hardening improvement**, not required for parity, and don't silently change scoping behavior without noting it in DB-21.

### 4.3 AUTH — Sanctum + 2FA + RBAC

*Build as one continuous thread (shared files) — do not fan this workstream out across independent agents.*

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| AUTH-01 | Install/configure Sanctum for token auth per PROJ-03's decision | DB-11, PROJ-03 | S | `php artisan sanctum:install` run; a stub protected route 401s without a token. |
| AUTH-02 | Signup endpoint — create tenant + CEO user, mirrors `lib/auth.ts signup()` (bcrypt hash, `isCeo:true`, `emailVerified:true`, creates a free-plan `Subscription`) | AUTH-01, DB-17 | S | Duplicate email → `{error: "An account with this email already exists."}`; success returns a session/token payload shaped like TS `Session`. |
| AUTH-03 | Login step 1 — verify credentials, detect `twoFactorEnabled`, mirrors `startLogin()` | AUTH-02 | S | Wrong password → generic `{error:true}` (no user-enumeration); 2FA user gets a short-lived (5 min) pending state, not a full session. |
| AUTH-04 | 2FA enrollment — `beginEnroll2FA`/`confirmEnroll2FA`/`disable2FA` using `pragmarx/google2fa-qrcode`; **encrypt the TOTP secret at rest** (Laravel `Crypt::encryptString`), **hash recovery codes** (not plaintext) — port the *fixed* GAPS #4 version | AUTH-03 | S | Secret column never stored plaintext (assert via raw DB read in test); recovery codes stored as hashes; plaintext codes returned to caller exactly once. |
| AUTH-05 | 2FA verify (login step 2) — TOTP code OR single-use recovery code, mirrors `completeTwoFactor()` | AUTH-04 | S | Correct TOTP → full session; correct recovery code → full session + code removed from the stored set; reused recovery code fails second time. |
| AUTH-06 | Password reset request/consume — **hash the reset token** (GAPS #4 fixed version), 1-hour expiry, mirrors `requestPasswordReset`/`resetPassword` | AUTH-02 | S | Expired/consumed token rejected; token never stored plaintext. |
| AUTH-07 | Invite teammate + accept invite, mirrors `inviteUser`/`acceptInvite` (hashed invite token, `mustReset:true` until accepted) | AUTH-02 | S | Inviting an existing email → `{error:"Email already in use."}`; accept sets `mustReset:false`, `emailVerified:true`. |
| AUTH-08 | `changePassword` endpoint (current-password verify → rehash) | AUTH-02 | H | Wrong current password → 422/false; correct → hash updates. |
| AUTH-09 | `/me` (session bootstrap) endpoint returning `{userId,tenantId,name,email,isCeo,roleId}` for frontend hydration on load | AUTH-03 | H | Frontend can call this once on boot to know who's logged in without re-parsing a JWT client-side. |
| AUTH-10 | RBAC layer — port `lib/rbac.ts` `can()`/`fieldHidden()` as a Laravel `Gate::define` + a `FieldVisibility` helper reading the same `Role.permissions` JSON shape (`{"leads":["read","write"], "_fields":{"opportunity.amount":"hidden"}}`); a route middleware enforcing per-module permission | DB-11 | S | `isCeo` or `roleId===null` → unrestricted (matches TS default); a role missing a module key → denied; field-hidden values are stripped from API Resources, not just UI-masked. |
| AUTH-11 | SSO (Google) adapter — pluggable, **random CSRF `state`** stashed in a short-lived signed cookie and verified on callback (port the *fixed* GAPS #5 version, not the original `"orbit"`-literal bug), degrades to disabled when no client ID/secret configured | AUTH-09 | S | Callback with a mismatched/missing state → rejected; no-credentials mode returns a clear "SSO not configured" rather than a crash. |
| AUTH-12 | Auth feature tests (Pest) — signup, login w/ and w/o 2FA, reset, invite, RBAC gate denial, SSO state mismatch | AUTH-02..11 | S | All pass; at least one test asserts a session token cannot carry a `tenantId` the DB user doesn't actually belong to. |

### 4.4 TEN — Multi-tenancy

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| TEN-01 | `BelongsToTenant` trait/global scope — auto-injects `tenant_id` on create, auto-filters every query to the authenticated user's tenant, mirrors `lib/tenantDb.ts scopedDb()` | DB-11, AUTH-09 | S | A query built through any tenant-scoped model, run under tenant A's auth context, structurally **cannot** return tenant B's rows (no opt-out without an explicit `withoutGlobalScope`). |
| TEN-02 | Apply the trait to all 32 tenant-scoped models (mechanical, one line per model) | TEN-01, DB-11..19 | H | Every model except `Tenant` itself uses the trait; a grep confirms no tenant-owned model was missed. |
| TEN-03 | Tenant-isolation Pest test — seed 2 tenants, assert cross-tenant read/write is blocked **through the real HTTP API**, not just the model layer (mirrors `lib/tenant-isolation.test.ts`, extended beyond just leads/invoices) | TEN-02, CRM-*, FIN-* (Wave 4) | S | Attempting to fetch/update tenant B's lead/invoice/employee/payslip while authed as tenant A returns 403/404, never the record. |
| TEN-04 | Middleware ensuring `tenant_id` is **never** accepted from client input on any write endpoint (always derived server-side from the auth context) | TEN-01 | S | A crafted request with a spoofed `tenant_id` in the body is ignored/overwritten, not honored. |

### 4.5 COMP — Compliance services (⚠️ see §1)

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| COMP-01 | Port `lib/compliance/payroll.ts` → `App\Services\Compliance\PayrollCompliance`: `isWageCompliant, suggestStructure, pfEmployee, pfEmployer, esiEmployee, esiEmployer, professionalTax, estimatedTds, computePayslip` | PROJ-01 | O | Every value in the §1 anchor table matches exactly; PT stays Maharashtra-only, TDS stays "very simplified" (not "improved"). |
| COMP-02 | Port `lib/compliance/gst.ts` → `App\Services\Compliance\GstCompliance`: `requiresEInvoice, hsnDigitsRequired, computeGst, mockIrn, round2` | PROJ-01 | O | Every value in §1 anchor table matches; `mockIrn` 32-bit overflow handled per §1 trap #2 — cross-checked against a hardcoded TS-generated output for a fixed seed. |
| COMP-03 | Pest suite ported 1:1 from `lib/compliance/payroll.test.ts` (all ~40 assertions, not a subset) | COMP-01 | S | Test file has ≥ as many assertions as the TS original; all green. |
| COMP-04 | Pest suite ported 1:1 from `lib/compliance/gst.test.ts` (all rounding/boundary/edge cases including empty-lines and high-value invoices) | COMP-02 | S | Test file has ≥ as many assertions as the TS original; all green. |
| COMP-05 | Written note (not code) documenting known simplifications carried over verbatim (Maharashtra-only PT, simplified TDS) as a tracked follow-up, so nobody "fixes" them silently later | COMP-01, COMP-02 | H | A short doc section (can live in this file's changelog or `docs/`) lists both simplifications and points at `GAPS.md` #12. |
| COMP-06 | Manual CA-style verification checklist — 10 known payroll scenarios (varying gross/basic/LOP/annual) run through both the TS original and the PHP port, outputs diffed side by side | COMP-01, COMP-03 | S | A table of 10 scenarios × both languages' outputs, zero deltas. |

### 4.6 GL — General Ledger (⚠️ see §1)

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| GL-01 | Port `lib/gl-constants.ts` — `ACCOUNT_TYPES, isDebitNormal, DEFAULT_COA` (14-account chart) | PROJ-01 | S | Identical 14 accounts/codes/types to `lib/gl.ts DEFAULT_COA`. |
| GL-02 | `ensureChart(tenantId)` — idempotent chart-of-accounts seeding, mirrors `lib/gl.ts` | GL-01, DB-18 | S | Calling twice for the same tenant doesn't duplicate accounts; returns a code→account map. |
| GL-03 | `postJournal()` — DB-transactional balanced posting; **throws/exception on `Dr≠Cr` or zero-total**; uses an explicit `round2()` matching JS `Math.round(n*100)/100` behavior (test the `1180.455`-style boundary per §1 trap #1) | GL-02 | O | Unbalanced input throws before any row is written (transaction rolled back); balanced input creates 1 `JournalEntry` + N `JournalLine`s atomically. |
| GL-04 | Auto-post hooks — `postInvoiceJournal, postPaymentJournal, postPayrollJournal` with the **exact same account codes, line shape, and narration format** as the TS originals, including the subtraction-derived GST/statutory line (§1 trap #4) | GL-03 | O | Given the §1 anchor-table inputs, the resulting journal lines match the TS output byte-for-byte (codes, amounts, narration string). |
| GL-05 | Reporting — `trialBalance()`, `financialStatements()` (P&L + balance sheet, `balanced` boolean check) | GL-03 | S | Balance sheet `assets == liabilities + equity` (within 1 rupee) on seeded demo data, mirroring the TS tolerance. |
| GL-06 | `backfillLedger()` — idempotent backfill from existing Finalized/Paid invoices + Locked/Paid payroll runs (skip if any journal entries already exist) | GL-04 | S | Running twice doesn't double-post; running against seed data reproduces the same entry count as the TS backfill. |
| GL-07 | Pest suite ported 1:1 from `lib/gl.test.ts` (DEFAULT_COA assertions, balancing invariants for invoice/payment/payroll, rounding edge cases) **plus** a new integration test that `postJournal()` actually throws (not just a unit-math assertion like the TS suite's pure-logic version) | GL-01..06 | S | All ported assertions green; the new throw-on-imbalance test is a real HTTP/service-layer test, not a pure-function one. |

### 4.7 CRM — CRM module API

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| CRM-01 | `AccountController` — list/create/update/delete, mirrors `app/(app)/accounts/actions.ts` | DB-12, TEN-02, AUTH-10 | S | CRUD + tenant scoping; GSTIN/state fields present (state feeds `FIN-01`'s intra/inter-state GST logic). |
| CRM-02 | `ContactController` — nested under Account, standalone CRUD too | CRM-01 | H | Contact optionally linked to an account; tenant-scoped. |
| CRM-03 | `LeadController` — CRUD + status transitions + `ownerId` assignment; stubs the AI lead-score hook (wired for real in `AI-02`) | DB-12, TEN-02 | S | `[tenant_id,status]`-indexed listing with filters; score/scoreReason fields nullable until AI wave lands. |
| CRM-04 | `OpportunityController` — CRUD + stage/probability transitions, links to Quotations | CRM-01 | S | Stage enum matches TS (`Qualification/Proposal/Negotiation/ClosedWon/ClosedLost`). |
| CRM-05 | `ProductController` — catalog CRUD (name/sku/hsn/unitPrice/taxRate), consumed by Quotations + Invoices | DB-12, TEN-02 | H | Read-heavy list used by `CRM-06` and `FIN-01`. |
| CRM-06 | `QuotationController` + nested `QuotationLine` create/update, subtotal/tax/discount/grandTotal computed server-side via `GstCompliance` | CRM-04, CRM-05, COMP-02 | S | Line totals recompute on any line change; status enum `Draft/Sent/Accepted/Rejected`. |
| CRM-07 | `TicketController` — CRUD, **severity-ranked sort** (port the GAPS #14 fix — `Urgent>High>Medium>Low`, not alphabetical), SLA due-date field | CRM-01 | S | Sorting by priority returns severity order, not alpha order (regression-test this explicitly). |
| CRM-08 | `ActivityController` — Task/Call/Meeting/Note CRUD, polymorphic `relatedTo` (`"Lead:<id>"` style string, matching TS), `summary` field for AI call-summary output | DB-12, TEN-02 | S | Same polymorphic string convention as TS (don't switch to a real polymorphic FK relation mid-port — keep behavior identical). |
| CRM-09 | CRM feature tests (Pest) — CRUD + tenant scoping for all 9 models | CRM-01..08 | S | One test class per controller; tenant-isolation assertion included per model. |

### 4.8 HR — HR module API

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| HR-01 | `EmployeeController` — CRUD, links to `User` (nullable unique), `managerId` self-reference | DB-13, TEN-02, AUTH-10 | S | Mirrors `app/(app)/hr/employees/actions.ts`; CTC field present for costing. |
| HR-02 | `LeaveApplicationController` — create + approve/reject workflow, `days` computed from date range | HR-01 | S | `[tenant_id,status]` filterable; approving deducts nothing automatically unless TS original does (verify against `hr/leave/actions.ts` before assuming). |
| HR-03 | `AttendanceController` — check-in/out incl. **geofencing** (lat/lng + distance-from-registered-address calc) — port whatever distance formula `app/(app)/hr/leave/actions.ts` actually uses (read it before implementing; don't assume haversine) | HR-01 | S | Distance stored in `distance_m`; status enum `Present/Absent/HalfDay/WeekOff/Leave`. |
| HR-04 | HR feature tests | HR-01..03 | S | CRUD + tenant scoping + a geofence-distance unit test with a known lat/lng pair. |

### 4.9 PAY — Payroll module API (ties COMP + GL together — high risk)

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| PAY-01 | `SalaryStructureController` — create/update per employee, runs `isWageCompliant`/`suggestStructure` from `COMP-01`, sets `compliant` flag | DB-14, HR-01, COMP-01 | S | Basic < 50% gross flips `compliant=false`, matching the 2025 Labour Codes rule. |
| PAY-02 | `PayrollRunController` create — for a month/year, computes a `Payslip` per active employee via `COMP-01 computePayslip`, status starts `Draft` | PAY-01 | O | Given the §1 anchor scenario (`gross:50000,basic:25000,annualGross:600000`), the generated payslip's `netPay` is exactly `48000`. |
| PAY-03 | Lock/pay lifecycle — `Draft→Locked` (freeze payslips, trigger `GL-04 postPayrollJournal`) → `Paid` | PAY-02, GL-04 | O | Locking a run posts a journal whose Dr/Cr match the run's `grossTotal`/`netTotal` per the §1 anchor table; locking twice doesn't double-post. |
| PAY-04 | `PayslipController` (read) — RBAC field-hiding of `netPay` for restricted roles via `AUTH-10 fieldHidden("payslip.netPay")` | PAY-02, AUTH-10 | S | A non-CEO role without the field permission gets `netPay` stripped/masked in the API response, matching the CLAUDE.md "sales role sees masked net pay" convention. |
| PAY-05 | Payroll integration tests — full run→lock→GL chain, asserting the posted journal balances **and** matches known numbers from `COMP-06`'s scenario table | PAY-01..04, GL-07 | O | End-to-end test: create structure → run payroll → lock → assert `trialBalance()` still balances and payslip numbers match the anchor table. |

### 4.10 INV — Inventory module API

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| INV-01 | `WarehouseController` — CRUD | DB-15, TEN-02 | H | Basic CRUD, tenant-scoped. |
| INV-02 | `ItemController` — CRUD, `onHand`/`reorderLevel` fields, low-stock query | INV-01, CRM-05 | S | Low-stock filter (`onHand <= reorderLevel`) works. |
| INV-03 | `StockMoveController` — GRN/Sale/Adjustment/Transfer, mutates `Item.onHand` transactionally | INV-02 | S | Posting a move updates `onHand` atomically (DB transaction); negative on-hand is either blocked or explicitly allowed — match whatever the TS original does. |
| INV-04 | `PurchaseOrderController` — CRUD, status `Draft/Sent/Received` | INV-01 | H | `[tenant_id,status]` filterable list. |
| INV-05 | Inventory feature tests | INV-01..04 | S | CRUD + tenant scoping + the stock-move on-hand mutation test. |

### 4.11 FIN — Finance/AP/Bank module API (GST correctness — high risk)

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| FIN-01 | `InvoiceController` create — GST calc via `COMP-02 computeGst`, intra/inter-state determined by `account.state === HOME_STATE` ("Maharashtra", matching the TS constant), sequential-ish invoice numbering (`INV-2026-NNN`) | CRM-01, CRM-05, COMP-02, TEN-02 | O | Given the §1 anchor GST inputs, `cgst/sgst/igst/grandTotal` match exactly; intra vs inter-state branches produce the right split. |
| FIN-02 | Finalize action — `Draft→Finalized`, triggers `GL-04 postInvoiceJournal`, calls the IRP e-invoice adapter (`INT-03`, stub until Wave 5 lands) when `requiresEInvoice()` is true, applies the ₹50k e-way-bill threshold; mark-paid transition | FIN-01, GL-04 | O | e-invoice branch only fires when `aato > 5cr AND type=="B2B"` (exact `COMP-02` boundary); GL posting matches the §1 invoice anchor row. |
| FIN-03 | Payment recording — `Payment` row + receipt number, `GL-04 postPaymentJournal`, notification on success, mirrors `recordPaymentAction` (only settles a `Finalized` invoice, defaults amount to `grandTotal`) | FIN-02, GL-04, INT-06 | S | Recording a payment against a `Draft` invoice is rejected; against `Finalized` flips it to `Paid` and posts a balanced Dr Bank/Cash = Cr AR entry. |
| FIN-04 | `VendorBillController` (AP) — **one** create path handling both manual and OCR-sourced bills (rename/merge per GAPS #10 — do NOT recreate the TS's two divergent `createBillAction` functions) | DB-19, TEN-02 | S | A single well-named action (e.g. `createVendorBill`) accepts an optional `source: manual|ocr` flag instead of two separate functions. |
| FIN-05 | `BankTransactionController` — import + reconciliation matching against `payment`/`vendorbill`/`journal` | FIN-03, FIN-04 | S | Matching sets `reconciled=true` + `matchedType`/`matchedId`; unmatched rows remain queryable. |
| FIN-06 | `LedgerController` (read-only) — wraps `GL-05 trialBalance()`/journal listing | GL-05 | H | Pagination + date-range filter on journal entries. |
| FIN-07 | Financial Reports endpoints — P&L, Balance Sheet, and the **GSTR-1 draft slab summary** (port the `bySlab` grouping-by-effective-tax-rate logic seen in `finance/invoices/page.tsx`) | GL-05, FIN-01 | S | Slab grouping reproduces the same rate buckets/counts/taxable/tax totals as the TS page for the same seed data. |
| FIN-08 | Finance feature tests — invoice GST correctness (assert against the §1 `computeGst` anchor rows through the real endpoint, not just the service), full invoice→payment→GL chain balance assertion | FIN-01..07, GL-07 | O | End-to-end: create invoice → finalize → pay → `trialBalance()` still balances; GST numbers match anchors exactly through the HTTP layer. |

### 4.12 AI — AI/OCR adapters

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| AI-01 | Guzzle HTTP client wrapper — `App\Services\Ai\AiClient`, OpenAI-compatible endpoint (Groq default, provider-agnostic), mirrors `lib/ai.ts`. **Must self-degrade to a local heuristic fallback and never throw**; returns `{result, source: "model"|"fallback"}` (this *is* the GAPS #11 fix — build it in from day one, don't regress to the silent-degrade original) | PROJ-01, PROJ-04 | S | With no API key configured, every AI call still returns a usable result tagged `source:"fallback"`; a mocked Guzzle failure also degrades gracefully instead of 500ing. |
| AI-02 | Lead scoring service — port the heuristic + model-path scoring logic feeding `CRM-03`'s `score`/`scoreReason` fields | AI-01, CRM-03 | S | Score is 0–100 int; fallback path still produces a plausible score, not null. |
| AI-03 | Copilot NL→intent classifier — port the **13 fixed intents** (never generates or executes raw SQL), mirrors `lib/copilot.ts` | AI-01 | S | Given a natural-language query, classifier returns one of exactly the 13 known intent keys, never an arbitrary string. |
| AI-04 | OCR service — vision-model call (Groq `llama-4-scout`-equivalent) for bill scanning, feeds `FIN-04`'s OCR-sourced vendor bill path | AI-01, FIN-04 | S | Mirrors `lib/ocr.ts` field extraction (vendor, amount, line items where available); degrades to a manual-entry prompt when no key configured. |
| AI-05 | AI Console + feature-badge endpoints — exposes `aiEnabled`/current provider so the frontend can render the "estimated/AI" fallback badge (GAPS #11 UI half) | AI-01 | H | `/api/ai/status` returns `{enabled: bool, provider: string|null}`. |
| AI-06 | AI feature tests — mock Guzzle responses (success + failure + timeout), assert the fallback path never throws and always returns a usable shape | AI-01..05 | S | 100% of AI service methods have a "no credentials" test case. |

### 4.13 INT — Integrations

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| INT-01 | Razorpay adapter (pluggable, mock-until-keys), mirrors `lib/payments.ts` | PROJ-04, PROJ-05 | S | No-key mode returns a deterministic mock payment reference, matching the "pluggable-and-mock" pattern. |
| INT-02 | Billing/Subscription service (plan/seats), mirrors `lib/billing.ts`, feeds `FE-29` | DB-17 | S | Plan upgrade/downgrade updates `Subscription.seats/plan/status`. |
| INT-03 | IRP e-invoice adapter (mock/live) — **the template pattern** — mirrors `lib/irp.ts`, reuses `COMP-02 mockIrn` for deterministic mock IRNs, feeds `FIN-02` | COMP-02, PROJ-04 | S | No-credentials mode returns a `mode:"mock"` IRN of the exact 64-hex-char format; live mode is a documented Guzzle call stub. |
| INT-04 | Marketplace lead-capture webhook endpoint(s), mirrors `app/api/marketplace/[source]/route.ts` | CRM-03 | S | POST from a named source (`JustDial/IndiaMART/TradeIndia/...`) creates a `Lead` with `source` set correctly. |
| INT-05 | SSO Google OAuth exchange — provider-specific token exchange behind `AUTH-11`'s CSRF-safe flow | AUTH-11 | S | Full round trip in mock/dev mode without real Google credentials configured returns a clear "not configured" state. |
| INT-06 | Notification adapters — email/SMS/WhatsApp (pluggable), mirrors `lib/notify.ts` + `lib/email.ts`; wires the **event→notification rule map** (port the GAPS #14 fix — automations should fire from `EventLog` entries, not only hand-called `notify()` sites) | DB-17, PROJ-04 | S | At least one event type (e.g. `payment.recorded`) auto-creates a `Notification` via the rule map, not just an explicit call site. |
| INT-07 | File storage abstraction — local disk + S3-ready interface, mirrors `lib/storage.ts`, **with upload validation** (10 MB cap + MIME allow-list — port the GAPS #9 *fixed* version, not the original unvalidated route) | PROJ-05 | S | Oversized/disallowed-MIME upload is rejected with a 422, not silently accepted. |
| INT-08 | CSV import/export service, mirrors `lib/csv.ts` + `app/(app)/import` + `app/api/export/[model]` | DB-11..19 | S | Export produces a CSV per model; import validates row shape before insert. |
| INT-09 | Global search service, mirrors `lib/search.ts` | DB-11..19 | S | Cross-module keyword search returns typed results (`{type, id, label, link}`). |
| INT-10 | Integration adapter tests — every integration in this table must pass its test suite with **zero** credentials configured (the whole point of "pluggable-and-mock") | INT-01..09 | S | CI green with an empty `.env` for every integration-specific var. |

### 4.14 PDF — Printables

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| PDF-01 | Install `barryvdh/laravel-dompdf`; base chrome-less Blade/HTML template matching `app/print/**`'s style | PROJ-05 | H | A trivial "hello invoice" PDF renders. |
| PDF-02 | Invoice PDF endpoint | PDF-01, FIN-01 | S | Renders all invoice lines, GST breakdown, IRN/QR if present. |
| PDF-03 | Payslip PDF endpoint — **respects RBAC field-hiding of net pay** for restricted roles (same rule as `PAY-04`) | PDF-01, PAY-04 | S | A restricted role's downloaded payslip PDF also masks net pay, not just the API JSON. |
| PDF-04 | Quotation PDF endpoint | PDF-01, CRM-06 | S | Renders line items, subtotal/tax/discount/grand total. |
| PDF-05 | PDF feature tests — smoke test each endpoint (200, correct content-type, non-empty byte stream) | PDF-02..04 | H | 3 smoke tests, all green. |

### 4.15 JOB — Jobs / scheduler

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| JOB-01 | `orbit:run-due-jobs` Artisan command consuming the `jobs` table, mirrors `lib/jobs.ts runDueJobs()` — **with atomic claim locking** (`updateMany where status=pending → running` before executing — port the GAPS #8 *fixed* version, not the original race-prone one) | DB-17 | S | Two concurrent invocations of the command never both execute the same job (test with a simulated race). |
| JOB-02 | Laravel Scheduler kernel wiring (`schedule:run` every minute) + `database` queue driver config, documented cPanel cron entries | JOB-01, PROJ-01 | H | `php artisan schedule:list` shows the job runner + queue worker entries. |
| JOB-03 | Notification rule map — event→notification auto-creation (ties to `INT-06`; the fix for GAPS #14's "half-wired" automations) | INT-06, JOB-01 | S | Rule map is data-driven (event type → notification template), not a hardcoded switch scattered across controllers. |
| JOB-04 | Job/notification feature tests — concurrency test (two simultaneous claims don't double-run), rule-map coverage test | JOB-01..03 | S | Concurrency test explicitly asserts no double-execution. |

### 4.16 FE — Frontend (static SPA), 33 tasks — one page/kit per task

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| FE-01 | Frontend project init per `PROJ-02`'s decision (Next `output:"export"` or Vite), Tailwind config ported from `app/globals.css`, base folder structure | PROJ-02 | S | Build produces a static `out/`/`dist/` folder with zero server dependency. |
| FE-02 | Typed API client + auth token/session storage (per `PROJ-03`'s Bearer-token decision), loading/error state hook | FE-01, PROJ-06, AUTH-09 | S | A `useApi()`-style hook handles 401→redirect-to-login uniformly. |
| FE-03 | Shared UI kit — port `components/ui.tsx` (`PageHeader/StatCard/MoneyStat/Badge/Empty`) + `.card/.th/.td/.btn/.input/.label/.badge` classes | FE-01 | H | Visual parity screenshot-checked against the current app for at least one page. |
| FE-04 | List/filter/pagination kit (`FilterBar`/`Pagination`, client-side equivalent of `lib/list.ts parseListParams/pageInfo/orderByFrom`) + format helpers (`inr`, `inrLakh`, `shortDate` ported verbatim) | FE-01 | H | Same query-param contract (`?q=&status=&sort=&order=&page=`) as today, just resolved client-side against the API instead of server RSC. |
| FE-05 | App shell — sidebar driven by a ported `nav.ts` config, header (search/notifications/settings), route guard redirecting unauthenticated users to `/login` | FE-02, FE-03 | S | Matches `lib/nav.ts`'s 7 groups/23 items exactly. |
| FE-06 | Auth pages — login, `/login/2fa`, signup, reset-password, accept-invite | FE-02, AUTH-02..07 | S | Full login flow incl. 2FA step works against the live API. |
| FE-07 | Dashboard / CEO cockpit page (cross-module aggregation) | FE-05, CRM-*, FIN-*, PAY-* | S | Renders at least the stat cards + recent-events feed seen in the current dashboard. |
| FE-08 | Leads page (list/create/score/convert/assign) | FE-05, CRM-03, AI-02 | S | |
| FE-09 | Opportunities page (stage change, quotation link) | FE-05, CRM-04 | S | |
| FE-10 | Accounts page + nested Contacts UI | FE-05, CRM-01/02 | S | |
| FE-11 | Quotations page + line-item builder + PDF link | FE-05, CRM-06, PDF-04 | S | |
| FE-12 | Tickets page (severity sort, SLA badges) | FE-05, CRM-07 | S | |
| FE-13 | Employees page (HR) | FE-05, HR-01 | S | |
| FE-14 | Leave & Attendance page (approve/reject, geofenced check-in) | FE-05, HR-02/03 | S | |
| FE-15 | Payroll page — salary structures + payroll-run wizard + payslip view with net-pay masking for restricted roles | FE-05, PAY-01..04 | S | UI actually hides net pay for the `sales@demo.orbit`-equivalent restricted role, matching CLAUDE.md's stated demo behavior. |
| FE-16 | Inventory page + adjust-stock form + item detail | FE-05, INV-01..03 | S | |
| FE-17 | Purchase Orders page | FE-05, INV-04 | S | |
| FE-18 | GST Invoices page — create/finalize/mark-paid/record-payment + GSTR-1 draft panel | FE-05, FIN-01..03, FIN-07 | S | Mirrors the current `finance/invoices/page.tsx` layout (stat cards, invoice table, GSTR-1 slab panel, compliance card). |
| FE-19 | Vendor Bills (AP) page — manual + OCR create paths through the single merged endpoint (`FIN-04`) | FE-05, FIN-04 | S | |
| FE-20 | Scan Bill (OCR) page | FE-05, AI-04, FIN-04 | S | |
| FE-21 | Bank Reconciliation page | FE-05, FIN-05 | S | |
| FE-22 | Ledger & Journals page | FE-05, FIN-06 | S | |
| FE-23 | Financial Reports page (P&L / Balance Sheet) | FE-05, FIN-07 | S | |
| FE-24 | Ask Orbit (Copilot) chat page | FE-05, AI-03 | S | |
| FE-25 | AI Console page | FE-05, AI-05 | S | |
| FE-26 | Integrations page + simulate-mock-event button | FE-05, INT-01/03/05/06 | S | |
| FE-27 | Documents page (attachments) + Import/Export page | FE-05, INT-07/08 | S | |
| FE-28 | Admin & Users page (roles/permissions editor, invite flow) + Notifications panel | FE-05, AUTH-10, INT-06 | S | |
| FE-29 | Billing page (plan/seats/subscription) | FE-05, INT-02 | S | |
| FE-30 | Settings page (profile, password change, 2FA enroll UI) | FE-05, AUTH-04/08 | S | |
| FE-31 | Search page (global search UI) | FE-05, INT-09 | S | |
| FE-32 | Production static build wiring — env-baked API base URL, output routed to a `public_html`-ready folder | FE-06..31 | S | A production build with a real API URL baked in serves correctly from a plain static file server (no Node). |
| FE-33 | Frontend E2E smoke checklist/tests (Playwright or manual, per `product-test-guide.md`) — login → create lead → create invoice → finalize → verify it lands on the GL ledger | FE-32, DEPLOY-05 | S | Full happy-path walkthrough passes against the deployed stack. |

### 4.17 TEST — Cross-cutting testing

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| TEST-01 | PHPUnit/Pest base setup — test DB config (sqlite in-memory or a dedicated MySQL test DB), `RefreshDatabase`, base `TestCase` with tenant/user/role factory helpers | PROJ-01 | S | Every module task from Wave 4 onward can `use RefreshDatabase` and call `$this->actingAsTenant($tenant, $user)` out of the box. |
| TEST-02 | Full regression pass — every ported Pest suite green in one CI run; produce a parity report (assertion count vs. the original 218 vitest tests) confirming nothing was silently dropped | All `*-*` test tasks | S | Report lists suite-by-suite counts; any shortfall vs. the TS original is explained, not silent. |
| TEST-03 | Tenant isolation sweep — extend `TEN-03` beyond CRM/Finance to **every** module (HR, Payroll, Inventory) | TEN-03, HR-*, PAY-*, INV-* | S | Cross-tenant read/write blocked for all 32 tenant-scoped models via the real API, not just a sample. |
| TEST-04 | RBAC enforcement sweep — `can()`/`fieldHidden()` exercised across every protected module + every known hidden field (starting with `payslip.netPay`) | AUTH-10, PAY-04 | S | A restricted-role test matrix covers every module in `lib/nav.ts`. |

### 4.18 DEPLOY — Bluehost shared-host rollout

| ID | Task | Deps | Model | Acceptance criteria |
|---|---|---|---|---|
| DEPLOY-01 | Composer vendor build-and-upload runbook (Composer often unavailable on shared SSH — `composer install --no-dev` locally, upload `vendor/`) | PROJ-05 | S | A documented, repeatable script/checklist; validated once against a real or simulated shared-host constraint. |
| DEPLOY-02 | Docroot config — point Apache at `laravel/public` (or relocate + patch paths); `storage/` + `bootstrap/cache/` writable perms | DEPLOY-01 | S | A fresh upload serves the Laravel welcome/API health route without 500s. |
| DEPLOY-03 | MySQL provisioning via cPanel + `.env` wiring + `artisan migrate --force` runbook | DB-02..10, DEPLOY-02 | S | All 36 tables exist on the shared-host MySQL instance post-migrate. |
| DEPLOY-04 | cPanel cron entries — `schedule:run` every minute + `queue:work --stop-when-empty` | JOB-02, DEPLOY-03 | H | Cron entries documented with exact command lines for cPanel's UI. |
| DEPLOY-05 | Static frontend upload to `public_html` + API base URL config + HTTPS/CORS verification | FE-32, DEPLOY-02 | S | Frontend loads over HTTPS and successfully calls the API cross-origin/cross-path per `PROJ-03`'s decision. |
| DEPLOY-06 | Production secrets — `APP_KEY`, Sanctum stateful domains, **throw-if-unset** checks for any secret equivalent to `AUTH_SECRET` (port the GAPS #4 "fail fast in prod" behavior) | AUTH-01, DEPLOY-03 | S | App refuses to boot in production with a missing critical secret, matching the current `lib/auth.ts` guard. |
| DEPLOY-07 | Post-deploy smoke-test runbook (login, create lead, create+finalize invoice, run payroll, verify GL balances) tied to `product-test-guide.md` | DEPLOY-05, FE-33 | S | Runbook executed once against the live shared-host deployment, all steps pass. |
| DEPLOY-08 | Backup strategy — MySQL dump cron + uploaded-file backup | DEPLOY-03 | H | A documented cron-based backup with a tested restore. |

---

## 5. RACI-style ownership guide

| Workstream | Primary agent type | Model tier | Notes |
|---|---|---|---|
| PROJ (scaffold) | `general-purpose` | Sonnet | One-time decisions; low ongoing churn. |
| DB (migrations/models) | `general-purpose` (fan-out) | Haiku for migrations/simple models, Sonnet for relationship-heavy models (DB-11/12/18/20) | Highly parallelizable — assign each migration/model group to a separate agent. |
| AUTH | `claude` (security-careful, single thread) | Sonnet, with an **opus or human security review pass** before merge | Do not fan out across agents — shared files, ordered steps, security-critical. |
| TEN | `claude` | Sonnet | Small but load-bearing; pair with a reviewer. |
| COMP | `claude` (correctness-critical) | **Opus** for the two service ports (COMP-01/02), Sonnet for tests | Mandatory second-agent review against the §1 anchor table before merge. |
| GL | `claude` | **Opus** for GL-03/GL-04 (posting + auto-hooks), Sonnet for reporting/backfill | Same second-review requirement as COMP. |
| CRM / HR / Inventory APIs | `general-purpose` (fan-out per module) | Sonnet (Haiku acceptable for pure-CRUD controllers like INV-01, CRM-02) | Parallel-safe across modules once Wave 3 lands. |
| Payroll API | `claude` | **Opus** (PAY-02/03/05 touch money + GL), Sonnet for PAY-01/04 | Highest-risk business-module workstream after COMP/GL themselves. |
| Finance/AP/Bank API | `claude` | **Opus** for FIN-01/02/08 (GST + e-invoice + GL chain), Sonnet for the rest | |
| AI/OCR adapters | `general-purpose` | Sonnet | Not correctness-critical in the legal sense, but must never throw — test the fallback path deliberately. |
| Integrations | `general-purpose` (fan-out) | Sonnet | Each integration is an isolated adapter file — safe to parallelize widely. |
| PDF | `general-purpose` | Haiku for templates, Sonnet for RBAC-aware payslip PDF | |
| Jobs/scheduler | `claude` | Sonnet | Concurrency-sensitive (locking) — needs a careful reviewer, not necessarily opus. |
| Frontend | `general-purpose` (heavy fan-out, one agent per page) | Haiku for display-only pages (FE-22/25/31), Sonnet for form/state-heavy pages (FE-06/15/18/20) | The biggest parallelization opportunity in the whole backlog — 33 largely-independent tasks. |
| Testing | `claude` (or a `code-reviewer`-type agent) | Sonnet | TEST-02 in particular benefits from a reviewer role distinct from whoever wrote the modules. |
| Deployment | `claude`, ops-careful, human-in-the-loop for production secrets/cPanel access | Sonnet | Not something to fully automate unattended — DEPLOY-06/07 should have a human sign-off gate. |

---

## 6. Definition of done (applies to every task above)

1. Code compiles/boots (`php artisan serve` / frontend `build`) with zero errors.
2. Task's own acceptance criteria met, verified by a Pest/Playwright test where the task table specifies one.
3. For any `COMP-*`/`GL-*`/`PAY-*`/`FIN-*` task: outputs cross-checked against the §1 anchor table or the relevant ported test file — **not just "looks reasonable."**
4. No task marks itself done by weakening a security/tenant-isolation/RBAC check to make a test pass.
5. `GAPS.md`-documented fixes (CSRF state, upload validation, cron locking, ticket sort, hashed tokens/secrets, AI fallback signaling, notification rule map) are carried forward as **fixed**, never reintroduced as bugs during translation.
