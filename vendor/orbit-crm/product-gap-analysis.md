# Orbit — Product Gap Analysis & Missing-Features Report

**Author:** Director of Product (review) · **Date:** 2026-07-06 · **Baseline:** `docs/ai/STATE.md`

## Verdict

Orbit is a **breadth-complete MVP demo** — 7 modules + cockpit + live AI, on seed data, single tenant. That is genuinely rare and it proves the thesis. But it is **not yet a system of record**: an SMB cannot yet *run* on it because the layers that create trust (money movement, compliance filing, data ownership, auth, notifications) and the commercial layers (onboarding, billing, tenancy) are missing or mocked. The next phase is **depth, not breadth.** Adding an 8th module would be a mistake; hardening the 7 into something a CFO trusts is the job.

Gaps below are graded **P0 = blocks a real paying customer · P1 = needed for competitive parity / retention · P2 = differentiation & scale.**

---

## 1. Platform & foundation (mostly P0 — nothing ships without these)

| Gap | Sev | Why it matters |
|---|---|---|
| **Real multi-tenancy & signup** | P0 | Today one demo tenant; marketplace webhook uses `db.tenant.findFirst`. No org creation, self-serve signup, user invites, or tenant isolation testing. Can't onboard customer #2. |
| **Auth hardening** | P0 | Hand-rolled JWT cookie; **no forgot/reset-password flow, no email verification, no SSO/2FA actually wired** (only modeled). Session revocation absent. Blueprint promised SSO/2FA — unbuilt. |
| **Notifications delivery** | P0 | `emit()` writes events but **nothing is actually sent** — no email/SMS/WhatsApp dispatch, no in-app notification center. The whole "workflow alerts / SLA escalation / payment reminders" promise is inert. |
| **Data import / export** | P0 | SMBs arrive with data in Tally/Excel/SangamCRM. **No CSV/Excel import**, no migration tooling, no export. Onboarding is impossible without this. |
| **Background jobs / scheduler** | P0 | Payroll runs, scheduled reports, SLA ageing, compliance reminders, recurring invoices — **all need a queue/cron; none exists.** Blueprint's "Scheduler" is unbuilt. |
| **File / document storage** | P0 | No uploads anywhere — employee docs, KYC, invoice/quote PDFs, ticket attachments. Core to HR & Finance. |
| **Admin / settings UI** | P1 | RBAC exists in code but **no UI to manage users, roles, teams, or the low-code Studio/workflow builder** from the blueprint. Admins can't self-configure. |
| **Global search** | P1 | SangamCRM has it; Orbit has none. Table-stakes for daily use. |
| **List UX: filter / sort / paginate / bulk actions** | P1 | Current lists are simple `findMany` renders. Breaks past a few hundred rows. |
| **Automated tests + CI/CD + error tracking** | P1 | Zero tests; build ignores TS errors; no Sentry/logging/uptime. Quality & regression risk as the team grows. |
| **DB migrations (not `db push`) + schema-drift guard** | P1 | Push-based schema is unsafe for prod evolution; the two Prisma schemas can silently diverge (no CI check). |

---

## 2. Money & compliance depth (the trust layer — mostly P0/P1)

This is the differentiation moat *and* the biggest hole. Right now it looks compliant but isn't wired to reality.

| Gap | Sev | Detail |
|---|---|---|
| **Real e-Invoicing / e-Way** | P0 | `lib/irp.ts` builds correct NIC v1.1 JSON but **IRN/e-Way are mocks** — not filed. Needs live GSP/IRP integration + token caching + error/retry. |
| **Payments & collections** | P0 | **No payment capture at all** — no Razorpay/UPI, no receipts, no payment links, no reconcile-payment-to-invoice. "Cash collected" is only ever set manually. |
| **Actual GST filing** | P1 | GSTR-1 is a *draft view only*; **no GSTR-3B, no GSTR-2B reconciliation** (both promised in spec), no filing submission. |
| **Double-entry GL / accounting** | P1 | No chart of accounts, ledgers, journals, bank reconciliation, or **P&L / Balance Sheet**. Finance is invoicing-only; can't replace Tally yet. |
| **Vendor bills / AP / expenses / credit notes** | P1 | AR exists thinly; AP, expense claims, vendor bills, credit/debit notes, TDS/TCS on transactions — absent. |
| **Payroll statutory depth** | P0 | **TDS is "very simplified"** (flagged in code); no ECR/ESI-return/challan files, **no Form-16, no payslip PDF/email, no NEFT bank file, no loans/arrears/reimbursements/FnF, no investment-declaration workflow.** PT slabs only Maharashtra. This is penalty-sensitive — thin here is dangerous. |
| **Quotation → PDF / e-sign** | P1 | SangamCRM exports branded quote PDFs; **Orbit quotations have no PDF/print output.** |
| **Compliance calendar** | P2 | Blueprint promised due-date reminders (PF 15th, TDS 7th, GSTR 11th…) as a feature — not built beyond a static cockpit alert. |

---

## 3. Module-by-module depth gaps

**CRM (P1):** no 2-way email sync / shared inbox, no per-record **activity timeline**, no web-to-lead form builder, no assignment-rule UI, campaigns are entities with **no execution/send**, no lead→customer conversion audit, no e-sign on quotes.

**Telephony (P1 — competitive):** **entirely absent.** SangamCRM's core moat (Enjay Synapse) — click-to-call, call popups, IVR routing, call logging/recording — has no counterpart. AI call-summary exists but there are no calls to summarize.

**Service Desk (P1):** no customer/self-service portal, no knowledge base, no CSAT capture, no canned replies, no ticket merge/child tickets.

**HR (P1):** ESS portal is thin, no recruitment/ATS, no onboarding-checklist execution, **no performance/appraisal cycles, no expense claims, no shift scheduling, no document mgmt, no exit management, no org-chart visualization.**

**Inventory (P2):** batch/serial modeled but not enforced in flows, no barcode/scanning, no delivery challan / sales-order→dispatch, no auto-PO on reorder, no landed cost, no stock/valuation reports.

**AI (P1 — this is the brand promise):** only 3 features + a 13-intent copilot. **Missing the Tier-1 winners from the blueprint:** invoice/document **OCR** (highest back-office ROI, not built), **demand forecasting**, **anomaly/fraud detection**, and the Tier-3 **agentic workflows** (AI SDR, AI compliance clerk). Copilot is reactive-only (no proactive insights), no RAG over documents, **no eval/guardrail harness, no AI cost/observability, no PII/data-residency handling.**

---

## 4. Mobile & India-specific (P1 — where SMB adoption is won or lost)

| Gap | Sev | Detail |
|---|---|---|
| **Native mobile app** | P1 | SangamCRM's field-force app (geofenced attendance, on-the-go) is a real strength. Orbit is **desktop-web only**; attendance/geofence exist in schema but no mobile client. |
| **WhatsApp Business API (real)** | P1 | Indian SMBs live on WhatsApp. Gallabox integration is named, not built — no real send/receive, templates, or payment reminders via WhatsApp. |
| **Regional languages (Hindi+)** | P2 | No i18n. A huge share of the target SMB staff aren't English-first. |
| **UPI / QR payments** | P1 | The default Indian payment rail — absent (see Payments above). |

---

## 5. Commercial & product-ops (P0/P1 — a SaaS with no business model yet)

| Gap | Sev | Detail |
|---|---|---|
| **Billing / subscription / metering** | P0 | **No monetization** — no plans, no paywall, no Stripe/Razorpay subscriptions, no seat/usage metering. It's a product with no way to charge. |
| **Onboarding / activation** | P1 | No signup→setup wizard, no empty states, no sample-data toggle, no guided tour or in-app help. First-run experience is undefined. |
| **Product analytics / telemetry** | P1 | Ironic for a "business OS" — **no usage tracking**, so you'd fly blind on adoption/retention. (A tracking-plan skill is available to bootstrap this.) |
| **Data governance / DPDP** | P0 | India's **DPDP Act** — no consent, data-deletion, export-my-data, retention, or backup/restore. Storing payroll + PII without this is a legal risk. |
| **Security posture** | P1 | No rate limiting, public-API key model is one shared secret, no pen-test/SOC2 path, no secrets management beyond `.env`. |

---

## 6. Prioritized roadmap — path to first paying customer

**Phase A — "A second customer can sign up and trust it" (P0 foundation, ~6–8 wks)**
1. Real tenancy + signup + user invites + isolation tests.
2. Auth hardening (reset/verify/SSO/2FA) + audit-log viewer.
3. Notifications delivery (email + WhatsApp) + background job queue.
4. Data import (CSV/Tally/Excel) + document storage.
5. Billing (Razorpay subscriptions) + basic onboarding wizard.
6. DPDP basics (consent, export, delete) + backups.

**Phase B — "It replaces the tools they pay for today" (P1 depth, ~8–12 wks)**
7. Payments/collections (UPI/Razorpay) + receipts + reconciliation.
8. Payroll statutory depth (Form-16, ECR/ESI files, NEFT, payslip PDF, real TDS).
9. Live e-Invoice/e-Way (GSP) + GSTR-2B recon + GSTR-3B.
10. Global search, list filtering/bulk, quotation PDF, activity timelines.
11. WhatsApp Business API + native/mobile-web attendance.
12. Admin/Studio UI (roles, workflow builder).

**Phase C — "The AI-native wedge widens" (P1/P2 differentiation, ongoing)**
13. Invoice/document OCR + demand forecasting + payroll anomaly detection.
14. Proactive cockpit copilot (pushed insights) + agentic compliance clerk.
15. Double-entry GL + financial statements (full Tally replacement).
16. Product analytics, eval/guardrails for AI, regional languages.

---

## 7. Top 10 "build next" (my ranked call)
1. **Real multi-tenant signup + auth hardening** (nothing else matters without it).
2. **Billing/subscriptions** — no revenue path today.
3. **Notifications + background jobs** — unlocks half the promised automation.
4. **Data import** — onboarding is impossible without it.
5. **Payments/collections (UPI/Razorpay)** — the CEO's #1 daily pain.
6. **Payroll statutory depth** — penalty-sensitive; thin = liability.
7. **Live e-Invoice/e-Way (GSP)** — turns the mock moat into a real one.
8. **Document storage + quotation/payslip/invoice PDFs.**
9. **Invoice OCR** — highest-ROI AI feature, still unbuilt.
10. **DPDP compliance + backups** — legal table-stakes for PII/payroll.

## 8. Risks to name now
- **Compliance correctness** (payroll TDS/PT, GST) is unverified by a CA — a wrong number here loses trust permanently.
- **No tests + TS errors ignored** — velocity will stall on regressions as depth grows.
- **AI trust** — no eval/guardrails means a bad LLM answer in the cockpit could mislead a CEO decision.
- **Scope** — the temptation is more breadth; the win is depth on money + trust.

*Cross-refs: current state `docs/ai/STATE.md`; original scope `product-spec-prd.md`; strategy `product-blueprint.md`.*
