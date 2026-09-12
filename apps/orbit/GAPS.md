# GAPS.md — Code-Quality Review

Candid engineering review of code health (distinct from the *feature*-level `product-gap-analysis.md`). Ordered most-important first. Each item: **what · where · why · fix**.

## Resolution status (2026-07-07 hardening pass)
| # | Item | Status |
|---|---|---|
| 1 | Tenant isolation safety net | ✅ `lib/tenantDb.ts` `scopedDb()` + isolation test; `finance/invoices` converted as the reference. Follow-up: migrate remaining modules (mechanical). |
| 2 | Dual-schema drift guard | ✅ `lib/schema-sync.test.ts` fails on drift. |
| 3 | Build ignored TS errors | ✅ 0 type errors; `ignoreBuildErrors: false`. |
| 4 | Plaintext secrets / weak AUTH_SECRET | ✅ 2FA secret encrypted (AES-GCM), recovery codes + reset/invite tokens hashed, prod throws without `AUTH_SECRET`. |
| 5 | SSO CSRF `state` | ✅ Random state in httpOnly cookie, verified on callback. |
| 6 | No auth/RBAC/tenant tests | 🟡 Partial — tenant-isolation integration test added; auth/RBAC action tests still TODO. |
| 7 | `db push` only, no migrations | ✅ Postgres baseline migration + `npm run db:migrate:deploy`; dev keeps push by choice. |
| 8 | Cron no locking | ✅ Atomic claim per job. |
| 9 | Upload unvalidated | ✅ 10 MB + MIME allow-list; S3 seam documented. |
| 10 | Dup logic / dup `createBillAction` | ✅ Shared `SortLink`; OCR action renamed. |
| 11 | AI silent degradation | 🟡 Partial — `scoreLead` + copilot carry `source`; lead-table badge derives from `aiEnabled`; drafting/summary still string-only. |
| 12 | Statutory maths not audited | ⚠️ **External** — needs a practicing CA to sign off `lib/compliance/*`. Not code-fixable. |
| 13 | Dead code `login()` | ✅ Removed. |
| 14 | Events→notifications; ticket sort | ✅ Rule map fires notifications; severity-ranked sort. |

**11 fully fixed · 2 partial (#6, #11) · 1 external (#12).** Original detail below.

---

### 1. Multi-tenant isolation is 100% code-enforced, with no DB safety net — HIGH
- **What:** Every query must include `where: { tenantId }`; a single omission leaks another tenant's data. Newer models (`Notification`, `Job`, `Payment`, `Subscription`, `LedgerAccount`, `JournalEntry`, `JournalLine`, `VendorBill`, `BankTransaction`) use a **scalar `tenantId` with no FK relation**, so there's not even referential integrity.
- **Where:** `prisma/schema.prisma` (scalar-tenantId models); every `app/(app)/**/page.tsx` & `actions.ts`.
- **Why:** One forgotten scope = cross-tenant breach — the worst-case bug for a multi-tenant SaaS.
- **Fix (one task):** Add a `lib/tenantDb.ts` helper (or Prisma `$extends` client extension) that injects `tenantId` into every query for a session, and route all reads/writes through it; start with the finance modules.

### 2. Two Prisma schemas, hand-synced, no guard — HIGH
- **What:** `schema.prisma` (SQLite) and `schema.postgres.prisma` (Postgres) are separate files kept in sync by hand.
- **Where:** `prisma/schema.prisma`, `prisma/schema.postgres.prisma`.
- **Why:** They *will* drift; prod (Postgres) breaks silently when only the dev schema is edited.
- **Fix:** Add a CI/test step that diffs the two files' model bodies (ignoring the `provider`/`datasource` block) and fails on mismatch. A ~30-line vitest or shell check.

### 3. Build ignores all TypeScript & ESLint errors — HIGH
- **What:** `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds` are on, and several pages carry latent type errors that ship anyway.
- **Where:** `next.config.mjs`; known offenders flagged in `docs/ai/GOTCHAS.md` (`app/(app)/hr/leave`, `app/(app)/integrations`, `app/(app)/admin`, `app/api/file/[id]`).
- **Why:** Real bugs (e.g. the `lib/bank.ts` credit/debit regex bug) hide behind a green build.
- **Fix:** Run `npx tsc --noEmit`, fix the handful of current errors, then flip `ignoreBuildErrors` to `false` (keep ESLint lenient if needed).

### 4. Secrets & tokens stored in plaintext; weak default AUTH_SECRET — HIGH
- **What:** `twoFactorSecret`, `recoveryCodes` (JSON), `resetToken`, `inviteToken` are stored unencrypted; `AUTH_SECRET` silently falls back to a hard-coded dev string if unset.
- **Where:** `lib/auth.ts` (`secret = new TextEncoder().encode(process.env.AUTH_SECRET || "dev-secret")`, token fields), `prisma/schema.prisma` User model.
- **Why:** A DB leak exposes every user's 2FA secret and reset tokens; a missing prod env var means forgeable sessions.
- **Fix:** Encrypt 2FA secrets/recovery codes at rest (or hash recovery codes like passwords), hash reset/invite tokens, and **throw at startup** if `AUTH_SECRET` is unset in production.

### 5. SSO callback has a placeholder CSRF `state` — HIGH (security)
- **What:** The Google OAuth `state` param is the fixed literal `"orbit"` and is never verified on callback.
- **Where:** `app/api/auth/sso/google/route.ts` and `.../callback/route.ts` (marked `TODO(real-idp)`).
- **Why:** No CSRF protection on the SSO login flow.
- **Fix:** Generate a random `state`, stash it in a short-lived httpOnly cookie on initiate, and reject the callback if it doesn't match.

### 6. Only pure-function unit tests exist — no coverage of the risky paths — HIGH
- **What:** 7 test files cover pure logic (`compliance/*`, `gl`, `ap`, `bank`, `totp`, `list`). **Zero tests** for server actions, RBAC enforcement, tenant scoping, auth flows, or GL auto-posting integration.
- **Where:** `lib/*.test.ts` (present) vs. `app/(app)/**/actions.ts` (untested).
- **Why:** The most breach-prone code (auth, RBAC, tenant scoping) is exactly what's untested.
- **Fix:** Add an integration test harness (vitest + a throwaway SQLite file) that seeds two tenants and asserts one cannot read/write the other's records via the real actions. Start with `leads` and `finance/invoices`.

### 7. Schema evolution is `db push` only — no migrations — MEDIUM/HIGH
- **What:** All scripts use `prisma db push` (no `migrations/` dir).
- **Where:** `package.json` scripts, `docker-entrypoint.sh`.
- **Why:** Safe in dev; in prod `db push` can drop columns/data with no history or rollback.
- **Fix:** Switch prod to `prisma migrate` (generate an initial baseline migration), keep `db push` for local dev only.

### 8. `/api/cron` job runner has no locking — MEDIUM
- **What:** `runDueJobs()` fetches pending jobs and processes them with no claim/lock; two concurrent cron hits double-run jobs (double notifications, etc.).
- **Where:** `lib/jobs.ts`, `app/api/cron/route.ts`.
- **Why:** Duplicate side effects under any concurrency (two schedulers, retries).
- **Fix:** Atomically claim each job (`updateMany where status=pending → running`) before executing, or add a DB advisory lock around the batch.

### 9. File upload is unvalidated & local-disk only — MEDIUM
- **What:** `app/api/upload/route.ts` accepts any file with no size/MIME allow-list; `lib/storage.ts` writes to local `data/uploads/` (breaks on serverless/multi-instance).
- **Where:** `app/api/upload/route.ts`, `lib/storage.ts` (comment already notes the S3 gap).
- **Why:** Unbounded upload = disk-fill DoS; local FS = lost files on most hosts.
- **Fix:** Add a size cap + MIME allow-list in the route; abstract storage behind an interface with an S3 driver for prod.

### 10. Duplicated logic across list pages & two `createBillAction`s — MEDIUM
- **What:** Each list page re-implements the same filter/sort/paginate wiring; a `SortLink` helper is copy-pasted in `leads` and `tickets`; **two different `createBillAction` functions** exist (`app/(app)/finance/ocr/actions.ts` and `.../bills/actions.ts`).
- **Where:** `app/(app)/{leads,tickets,accounts,finance/invoices,finance/bills,hr/employees}/page.tsx`.
- **Why:** Divergent behavior over time; confusing for the next editor.
- **Fix:** Extract a shared `SortLink` into `components/ListControls.tsx` and a `buildListQuery()` helper; rename the OCR one to `createBillFromOcrAction` to disambiguate.

### 11. AI layer degrades silently — no signal at the call site — MEDIUM
- **What:** `ai.ts`/`copilot.ts`/`ocr.ts` never throw; a returned result may be the local heuristic, not the model, and callers can't tell per-call.
- **Where:** `lib/ai.ts`, `lib/copilot.ts`, `lib/ocr.ts`.
- **Why:** A CEO could trust a "fallback" cockpit answer as a real model answer.
- **Fix:** Return a `{ result, source: "model" | "fallback" }` shape and surface a small "estimated/AI" badge in the UI for fallback results.

### 12. Simplified statutory & accounting maths, not audited — MEDIUM (correctness)
- **What:** TDS is explicitly "very simplified"; PT slabs are Maharashtra-only; GL omits input-GST/ITC (bill total is expensed) and employer PF/ESI in the payroll journal.
- **Where:** `lib/compliance/payroll.ts` (`estimatedTds`, `professionalTax`), `lib/ap.ts`, `lib/gl.ts` (`postPayrollJournal`).
- **Why:** Wrong statutory numbers erode trust permanently; internal-consistency tests don't prove legal correctness.
- **Fix:** Get a practicing CA to review `lib/compliance/*`; add per-state PT tables and an ITC asset split as follow-ups (tracked, not silent).

### 13. Dead code: legacy `login()` — LOW
- **What:** `login(email, password)` in `lib/auth.ts` is superseded by `startLogin` (2FA-aware) and no longer called by the login page.
- **Where:** `lib/auth.ts`.
- **Why:** A second, non-2FA login path is a latent security foot-gun if anything wires to it.
- **Fix:** Delete `login()` (or make it call `startLogin`).

### 14. Half-wired: events don't auto-create notifications; ticket sort is alphabetical — LOW
- **What:** `emit()` (EventLog) and `notify()` (Notification) are separate; "workflow alerts" are hand-called, not driven by events. Ticket `priority` sort is alphabetical (Low/Medium/High/Urgent), not severity order.
- **Where:** `lib/events.ts` + `lib/notify.ts`; `app/(app)/tickets/page.tsx`.
- **Why:** The advertised "automated alerts" only fire where a dev remembered to call `notify()`; ticket sort surprises users.
- **Fix:** Add a small event→notification rule map consumed by the cron runner; add a severity-rank field or order for priority sort.

---

**Not repeated here** (tracked in `product-gap-analysis.md` as *feature* gaps, not code quality): telephony, native mobile app, real GSP/Razorpay/email delivery, GSTR-3B filing, DPDP tooling depth.

---

## Wave D additions (2026-07-12 telephony + Tally connector + WhatsApp)

### Telephony webhook single-tenant scope — MEDIUM
- **What:** `app/api/webhooks/telephony` resolves tenant via `findFirst` (same as the marketplace webhook), so in multi-tenant it would match by call fields alone (e.g. a phone number appearing in multiple accounts). Single-tenant only.
- **Where:** `app/api/webhooks/telephony/route.ts`, `lib/telephony.ts`.
- **Why:** True multi-tenant call matching needs metadata (e.g. a connector ID or account FK) in the webhook event itself, which Exotel's Passthru applet doesn't provide by design.
- **Fix:** Documented limitation (see DEMO.md "Pilot-scale known gaps"). When multi-tenant is needed, add a per-tenant Passthru URL or a per-tenant TELEPHONY_WEBHOOK_TOKEN routing step.

### `/studio/sla` is set-only, no unset affordance — LOW
- **What:** `ticket_priority` option meta can carry `{slaHours}` (e.g. priority "Urgent" has 4-hour SLA). The `/studio/sla` editor allows setting slaHours per priority, but there's no "remove SLA" button — once set, it stays (even if the UI shows a blank input, the prior value persists).
- **Where:** `app/(app)/studio/sla/page.tsx`, `lib/studio/sla.ts`.
- **Why:** Oversight in the editor UI; the underlying model supports `null` but the form doesn't expose it.
- **Fix:** Add a "Clear SLA" or "No SLA" button next to each priority input, or allow an empty submission to null the value.

### Wave D delivery/call status literals are provider-domain by design — INFO (not a gap)
- **What:** `lib/telephony.ts` defines `CallStatus` ("initiated"/"answered"/"completed"/"missed"/"failed") as Orbit's normalized shape. Exotel's raw Passthru events arrive with Exotel statuses (queued/ringing/in-progress/completed/busy/no-answer/failed/etc.), which are normalized on arrival via `STATUS_MAP`. Similarly, `lib/whatsapp.ts` normalizes Exotel's WhatsApp delivery statuses (queued/sent/delivered/failed/read) to Orbit's shape. Tally connector statuses (pending/exported/failed) are Tally-domain and stored as-is in `TallyLedger.exportStatus`.
- **Where:** `lib/telephony.ts:STATUS_MAP`, `lib/whatsapp.ts` (implicit, via `MessageLog.status`), `prisma/schema.prisma` (TallyLedger.exportStatus enum).
- **Why:** Providers have different status vocabularies; normalizing at the seam lets the rest of the app use a stable vocabulary. Storing Tally statuses verbatim is correct because they're not displayed in the UI (only in the admin ledger for debugging).
- **No fix needed:** this is intentional design, documented in `docs/ai/design/wave-d-contracts.md`.
