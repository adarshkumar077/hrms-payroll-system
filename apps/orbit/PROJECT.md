# PROJECT.md — Orbit Business OS

Onboarding overview for an engineer or agent new to this codebase. Architecture context lives here; day-to-day rules live in [CLAUDE.md](CLAUDE.md); known issues in [GAPS.md](GAPS.md).

## What this is

**Orbit** is an AI-native, all-in-one **business operating system for Indian SMBs** (10–200 employees). It unifies what an SMB usually runs on 4–6 disconnected tools — CRM/sales, HR, payroll, inventory, and GST-compliant finance/accounting — behind a single real-time **CEO cockpit**, with AI embedded in the workflow (lead scoring, follow-up drafting, call summarization, a natural-language "ask your data" copilot, and invoice OCR). It was built to surpass **SangamCRM** (a sales-only CRM); the differentiator is the *unified data model* + *native India compliance* (PF/ESI/PT/TDS payroll, GST e-invoicing, double-entry ledger).

Status: **runnable MVP on seed data, single demo tenant.** Some external integrations are built *pluggable* and mocked until credentials are supplied (see below). It is not yet a production system of record.

## Tech stack (and why)

| Piece | Version | Why |
|---|---|---|
| Next.js (App Router, RSC) | 14.2.5 | One deployable, server-first. Pages read the DB directly; mutations are server actions — minimal code, tenant-scoping enforced server-side. |
| TypeScript | 5.9.3 | Types across a large surface. (Note: build *ignores* type errors — see GAPS.) |
| Prisma | 5.22.0 | Type-safe DB access. **Two schemas**: `schema.prisma` (SQLite, dev) + `schema.postgres.prisma` (Postgres, prod) — Prisma's `provider` can't be an env var. |
| Tailwind | 3.4.19 | Utility styling; shared component classes in `app/globals.css`. |
| jose + bcryptjs | 5.10 / 2.4.3 | Hand-rolled JWT-cookie auth + password hashing (no NextAuth — minimal deps). |
| qrcode | 1.5.4 | TOTP 2FA QR provisioning, offline. |
| vitest | 2.1.9 | Unit tests for pure logic (compliance maths, GL, parsers). |
| @anthropic-ai/sdk | 0.27.3 | Optional Anthropic path in the AI layer (lazy-imported). |
| AI runtime | — | Provider-agnostic **OpenAI-compatible** HTTP (currently **Groq**, free). Text: `llama-3.3-70b`; vision OCR: `llama-4-scout`. |

Runs on **SQLite with zero infra** for dev (`npm run setup`), Postgres for prod (Docker compose profile).

## Architecture

```
Browser
 └─ app/(app)/layout.tsx        auth gate (getSession) + Sidebar + header (search, 🔔, ⚙️)
     └─ <module>/page.tsx  (RSC)  reads `db` directly, ALWAYS scoped by session.tenantId
          └─ <Client>.tsx  "use client" + useTransition
               └─ actions.ts  "use server" → db write → revalidatePath → emit() [+ notify()]
                                                             └─ EventLog row (the event bus)
 CEO cockpit (app/(app)/dashboard) aggregates across every module + reads recent events
 Public API: app/api/{auth,cron,export,file,upload,marketplace,health}/…
```

**Layers:**
- **Presentation** — `app/(app)/**` authed pages (the `(app)` route group is *not* in the URL); `app/{login,signup,reset-password,accept-invite,login/2fa}` public; `app/print/**` chrome-less printable PDFs.
- **Business logic** — everything in `lib/` (see below). This is where the real work is; pages are thin.
- **Data** — `prisma/` (36 models, every business row carries `tenantId`), seeded by `prisma/seed.ts`.

**Key `lib/` modules (the load-bearing core):**
| Module | Role |
|---|---|
| `db.ts` | Prisma singleton. |
| `auth.ts` | JWT-cookie sessions, signup/reset/invite, **2FA (TOTP) login flow**, `establishSession` (SSO+2FA). |
| `rbac.ts` | JSON role permissions — module-level (`can`) + field-level (`fieldHidden`, e.g. mask payslip net pay). |
| `events.ts` / `notify.ts` | Append-only `EventLog` bus; in-app + pluggable email/SMS/WhatsApp notifications. |
| `compliance/payroll.ts`, `compliance/gst.ts` | **Statutory calculators** (PF/ESI/PT/TDS; CGST/SGST/IGST, e-invoice gate). Pure, unit-tested. Legal-sensitive. |
| `gl.ts` | **Double-entry ledger** — chart of accounts, balanced `postJournal` (throws if Dr≠Cr), auto-post hooks, trial balance / P&L / balance sheet. |
| `ap.ts`, `payments.ts`, `billing.ts`, `bank.ts` | Vendor bills→GL, payments (Razorpay-pluggable), plans/seats, bank reconciliation. |
| `ai.ts`, `copilot.ts`, `ocr.ts` | AI layer — all **degrade to a local fallback** so the app runs with no key. Copilot classifies NL into 13 fixed intents (never writes SQL). |
| `irp.ts`, `sso.ts`, `marketplace.ts`, `storage.ts`, `csv.ts`, `list.ts`, `search.ts` | GST e-invoice (mock/live), Google SSO (pluggable), lead capture, file storage, CSV, list filtering, global search. |

Data flows **into the GL automatically**: finalizing an invoice, recording a payment, and locking payroll each post a balanced journal, so Financial Reports reflect real activity.

## Key design decisions (inferred + documented)

- **Modular monolith, clean-sheet** (not a fork of ERPNext) — a single shared data model is what makes the cross-module cockpit possible. See `docs/ai/DECISIONS.md`.
- **RSC-first + server actions, no separate REST layer for CRUD** — less code, tenant-scoping stays server-side.
- **Multi-tenant by `tenantId` column on every table** (not schema-per-tenant) — simple at SMB scale; the cost is that *every query must remember to scope* (a real footgun — see GAPS).
- **Everything external is pluggable + mock-until-keys** — AI, IRP e-invoicing, Razorpay, SSO, email/SMS/WhatsApp all work in a degraded/manual mode with no credentials and light up when env vars are set. This is a deliberate, repeated pattern (`lib/irp.ts` is the template).
- **Statutory maths isolated + unit-tested** — `lib/compliance/` is the one place to audit legal correctness.

## Critical paths (what matters most)

- **`lib/auth.ts` + `lib/rbac.ts` + `app/(app)/layout.tsx`** — the security spine. A bug here is a cross-tenant/privilege breach. Change with extreme care.
- **`lib/compliance/*` + `lib/gl.ts`** — money and legal correctness. Guarded by tests; keep them green and get a CA to verify the formulas.
- **`prisma/schema.prisma` + `schema.postgres.prisma`** — the data model. Any change must be mirrored across *both* files (no CI enforces this).
- **`lib/ai.ts`** — the shared AI completion path all AI features route through.

**Safe to change casually:** individual `app/(app)/<module>/page.tsx` list/detail views, UI copy, `components/ui.tsx` styling, seed data, the playbooks in `docs/ai/`.

## Surprising / non-obvious things

1. **Two Prisma schema files, hand-synced.** Edit one → mirror the other or prod silently diverges.
2. **`dev.db` lives at `prisma/dev.db`**, not repo root (SQLite path is relative to the schema).
3. **`npm run build` fails with an EPERM DLL error if a dev/prod server is running** (Windows locks the Prisma query engine). Stop the server first.
4. **Green build ≠ type-clean** — `next.config.mjs` ignores TS *and* ESLint errors. Several pages have latent type errors yet run.
5. **An AI result may be the local heuristic, not the model** — the AI layer never throws. Check the header/console badge (`aiEnabled`, provider label).
6. **The `(app)` folder is a route group** — not part of the URL. `/dashboard` = `app/(app)/dashboard/page.tsx`.
7. **Not a git repository** — `docs/ai/STATE.md` + `DECISIONS.md` are the only project history.
8. **Newer models use a scalar `tenantId` with no FK relation** (Notification, Job, Payment, Subscription, LedgerAccount, JournalLine, VendorBill, BankTransaction) — no DB-level referential integrity; scoping is purely code-enforced.

## Where to go next

- Full feature spec: `product-spec-prd.md` · market rationale: `product-blueprint.md` · incumbent audit: `sangamcrm-portal-audit.md`.
- Manual test walkthrough: `product-test-guide.md` · deploy: `DEPLOY.md`.
- Current done/half/planned: `docs/ai/STATE.md`. Task playbooks: `docs/ai/playbooks/`.
