# PRD — "Orbit" Business Operating System

> **Working codename:** Orbit (placeholder — final brand TBD).
> **Author:** Acting CEO / Product Owner.
> **Version:** 1.0 (draft) · **Date:** 2026-07-03.
> **Evidence base:** [sangamcrm-portal-audit.md](sangamcrm-portal-audit.md) (incumbent teardown), [product-blueprint.md](product-blueprint.md) (market research, 19 verified claims).
> **Scope of this doc:** the *complete* product — full SangamCRM feature parity **plus** HR, Payroll, Inventory, native GST Finance, the CEO Cockpit, and the AI automation layer.

---

## 0. Executive summary (the CEO's bet)

Indian SMBs (10–200 employees) run their business on 4–6 disconnected tools: a CRM (SangamCRM/Zoho), a payroll app (Keka/greytHR), Tally for accounting, spreadsheets for inventory, and WhatsApp for everything else. **Orbit collapses all of it into one AI-native operating system with a single CEO cockpit.** We reach CRM parity with the incumbent, then win decisively on the three things it does not have — **HR+Payroll, Inventory, and native GST finance** — and wrap the whole thing in an **AI layer embedded inside the workflow, not bolted on the side.**

**The wedge:** be the unified, India-compliant, AI-native middle that Zoho (broad-but-shallow) and Odoo (deep-but-heavy) leave open at an SMB price point.

**The moat sequence:** Platform core → CRM + thin cockpit (land customers) → Finance + Inventory (kill the Tally dependency) → HR + Payroll → deepen AI throughout.

---

## 1. Problem statement

A growing Indian SMB CEO has **no single source of truth**. Sales lives in a CRM, money lives in Tally, people live in a payroll tool, stock lives in a spreadsheet — and none of them talk. The CEO cannot answer "what's my cash position vs. pipeline vs. payroll liability this month?" without three exports and a weekend. Meanwhile compliance (GST e-invoicing, the new 2025 Labour Codes, PF/ESI/TDS) is a monthly fire drill across disconnected systems. The cost of not solving this: wasted admin hours, compliance penalties, blind decision-making, and per-tool subscription sprawl.

---

## 2. Goals

| # | Goal (outcome, measurable) |
|---|---|
| G1 | **Unify the stack:** a CEO can see revenue, cash, pipeline, headcount, and stock on one screen in real time — replacing ≥3 separate tools. |
| G2 | **Reach CRM parity** with SangamCRM within Phase 1 so we can displace it head-to-head (feature-match on sales/service/telephony/lead-capture/mobile). |
| G3 | **Win on the gaps:** ship native HR, Payroll, Inventory, and GST-native Finance — modules the incumbent lacks entirely. |
| G4 | **Compliance built-in:** file GSTR-1/3B, generate e-invoices/IRN + e-way bills, and run PF/ESI/PT/TDS-correct payroll natively — zero external portals for the common case. |
| G5 | **AI that lands:** every AI feature sits inside an existing approval/workflow step, is logged and reversible — measured by adoption + task-time reduction, not novelty. |
| G6 | **SMB economics:** priced and onboarded so a 25-person company is live in <2 weeks without an implementation consultant. |

---

## 3. Non-goals (v1)

| Non-goal | Why out of scope now |
|---|---|
| Rebuilding a telephony/IVR stack from scratch | Integrate (SangamCRM's Synapse-style connector pattern) — owning a carrier-grade dialer is a separate company. |
| Full manufacturing / MRP (BOM, work orders, shop floor) | Odoo/ERPNext territory; our beachhead is trading/services, not discrete manufacturing. P2. |
| Multi-country payroll & tax | India-first. Global localization is a later market. |
| A freeform "ask-anything" AI chatbot | The 95%-failure trap. AI must be workflow-embedded, not a side panel. |
| Marketplace/app-store for 3rd-party devs | Platform extensibility matters, but a public app store is post-PMF. |
| Native accounting *general ledger* depth rivaling Tally/Zoho Books on day one | We ship GST-invoicing + core AR/AP native; deep double-entry GL is phased (keep a Tally import bridge for migration). |

---

## 4. Target users & personas

- **Ravi — SMB CEO/Founder (primary buyer).** Wants one screen, fewer tools, no surprises. Judges us on the cockpit.
- **Priya — Sales Manager.** Lives in leads/opportunities/quotations; cares about pipeline hygiene and rep productivity.
- **Anil — Field Sales/Service Rep (mobile-first).** Check-in/geofence, calls, tickets, on-the-go quotes.
- **Sunita — HR/Admin.** Onboarding, attendance, leave, and the monthly payroll run without compliance panic.
- **Mahesh — Accountant/Finance.** GST invoicing, e-way bills, filing, outstanding follow-ups, reconciliation.
- **Deepak — Ops/Store Manager.** Stock, purchase orders, GRN, reorder levels.
- **System Admin.** Roles, workflows, studio customization, security.

---

## 5. Feature scope overview

Orbit = **Platform Core** + **7 functional modules** + **AI layer** + **CEO Cockpit**. Modules 1–4/parts are SangamCRM parity; the rest is net-new differentiation.

```
CEO COCKPIT  ── cross-module real-time command center
AI LAYER     ── OCR · drafting · call-summary · scoring · forecasting · NL copilot
─────────────────────────────────────────────────────────────
1 CRM/Sales  2 Service Desk  3 HR  4 Payroll  5 Inventory/Orders  6 Finance(GST)  7 Marketing/Channels
─────────────────────────────────────────────────────────────
PLATFORM CORE ── identity/RBAC · workflow · approvals · Studio · reports/BI · telephony · mobile · integrations
```

---

## 6. Requirements — Platform Core

*(All P0 unless marked. This is the spine every module rides on; SangamCRM parity items are noted.)*

### 6.1 Identity, Users & Access `[parity+]`
- **P0** User management: create/activate/deactivate/reassign users; bulk import.
- **P0** Role management with **module-level and field-level** permissions (parity: SangamCRM Role Mgmt).
- **P0** Team management: custom teams by region/department for visibility & analytics.
- **P0** Employee-cost config: per-hour cost per user → effort-based cost analysis on activities (parity).
- **P1** Delegation / "login as" for admins (audited).

**Acceptance (roles):** Given an admin sets a field to "hidden" for role R, when a user in R opens the record, then that field is neither visible nor returned by API/export.

### 6.2 Security `[parity+]`
- **P0** IP-restriction management (allow-listed IPs).
- **P0** Password policy (pattern, reset/forgot, auto-disable on inactivity).
- **P0** Phone/email **masking** per role.
- **P0** **SSO** (SAML/OAuth) and **2FA** (TOTP + per-user recovery codes, admin QR reset).
- **P0** Working-hours restriction (block usage outside designated hours).
- **P1** Screen-capture prevention on mobile app.
- **P0 (compliance)** Full **audit log** on every record mutation.

### 6.3 Low-code Studio `[parity]`
- **P0** Rename modules & field labels; enable/disable modules per web/mobile.
- **P0** Manage create/detail/list layouts, field properties, field dependencies.
- **P0** Dropdown editor (add/remove/reorder options); Label editor.
- **P1** Custom modules & custom objects (differentiator vs. SangamCRM's fixed set).

### 6.4 Workflow & Automation engine `[parity+]`
- **P0** **Workflow**: condition → action/alert (e.g., email on lead create, set close date on ticket close).
- **P0** **Scheduler**: recurring jobs, scheduled reports, record ageing.
- **P0** **Approval management**: block record progression on criteria (e.g., discount needs manager approval).
- **P0** **Auto-distribution**: assign records by round-robin, least-busy, business-hours, holiday, **attendance-aware** routing.
- **P0** **Auto number generation** (custom formats per module).
- **P0** **Find-duplicate / de-dup** rules per module & field.
- **P0** **TAT** (turnaround-time KPI) and **SLA** (response/resolution + email escalation matrix) config.
- **P0** **Lock records** (rule-based edit locking, e.g., freeze leads post-conversion).
- **P1** **OTP authentication** on sensitive field-status changes (SMS-gated).
- **P1** **Celebration wishes** (auto birthday/anniversary messages).
- **P1** **Break management** (agent breaks, limits, options) + **live dashboard** (agent/call/queue status).

### 6.5 Channels `[parity]`
- **P0** Outgoing **Email** config (workflow alerts, scheduled reports, password resets); templates; email **suppression** (bounce/unsub/spam handling).
- **P0** **SMS** gateway integration.
- **P0** **WhatsApp** integration (Gallabox-style API) — conversations as first-class records.
- **P0** **Inbound email → Lead/Ticket** conversion with auto-distribution.

### 6.6 Telephony / Contact Center `[parity, via integration]`
- **P0** Telephony connector (Synapse/IVR-style): IVR routing, **caller-detail popup**, click-to-call, **auto call logging**, call recording linked to records.
- **P0** Call pop-up field config & module priority ordering.
- **P1** Live call dashboard, queue management, real-time call summary.

### 6.7 Reporting & BI `[parity+]`
- **P0** Report builder (list/summary/matrix), scheduled report delivery.
- **P0** **OPR dashboard** framework (Open / Periodic / Result), status mapping, date-field config.
- **P0** **Scorecard** on any dropdown field.
- **P1** **Power BI** connector (real-time sync).
- **P2** Embedded native BI to reduce Power BI dependency.

### 6.8 Mobile app `[parity+]`
- **P0** Full CRM on mobile; offline-tolerant.
- **P0** **Attendance**: check-in/out, full/half-day rules, week-offs.
- **P0** **Geofencing** (radius-based check-in against client's registered address) + **check-in/out distance calculation** with breach alerts.
- **P0** Auto call logging (in/out) for CRM-known numbers.
- **P0** Mobile layout config (field limits on edit/detail/list); app statistics (version, permissions).

### 6.9 Integrations & platform APIs `[parity+]`
- **P0** Public REST API + webhooks (parity: "Sangam API" website lead capture).
- **P0** **Marketplace lead capture**: JustDial, IndiaMART, TradeIndia (+ extensible).
- **P0** **Tally connector** (migration/bridge): import ledgers as Firms/Branches, sync item masters, sales orders, outstanding — *as a migration path, since we go native on finance.*
- **P1** Power BI, Autodesk, distance/ETA API.
- **P2** Open connector framework for arbitrary marketplaces/IVRs.

---

## 7. Requirements — Module 1: CRM / Sales `[parity]`

- **P0** Core objects: **Accounts, Contacts, Leads, Opportunities** with full lifecycle, custom fields via Studio.
- **P0** **Opportunity pipeline** with amounts, stages, Closed Won/Lost, weighted forecast.
- **P0** **Quotations engine**: line items, **tax & tax groups**, discounts, payment terms, T&C, bank details, **branch-wise PDF** with headers/footers, custom quote-number formats.
- **P0** **Auto product creation** from quotation/opportunity.
- **P0** **Activities/Tasks**, **Calls**, **Messages**, **Notes/Attachments**, **Tags**.
- **P0** **Contracts** with **contract automation**: auto-renewal on opportunity closure, auto feedback tickets, **auto-schedule PMS/maintenance visits**.
- **P0** **Campaigns** (marketing), **Checklists** (process checklists on records).
- **P0** **Products / Product Masters** catalog (shared with Inventory & Finance).
- **P1** Announcements/notices; user-activity tracking.

**Acceptance (quotation):** Given a quote with mixed tax-group items, when the rep generates the PDF, then per-line tax, group subtotals, discount, payment terms, T&C and bank details render on the branch-correct template, and (if enabled) missing products are auto-created in the catalog.

---

## 8. Requirements — Module 2: Service Desk `[parity]`

- **P0** **Tickets** with priority, category, assignment, **SLA (response/resolution)** + **TAT** tracking, escalation matrix.
- **P0** Inbound email/WhatsApp → ticket; auto-distribution.
- **P0** AMC/contract-linked service; feedback tickets.
- **P1** Customer/self-service portal.
- **P1** CSAT capture on ticket close.

---

## 9. Requirements — Module 3: HR `[NEW — differentiator]`

- **P0** **Employee master**: full profile, documents, org chart / reporting lines.
- **P0** **Onboarding / offboarding** workflows (checklists, doc collection, asset assignment).
- **P0** **Attendance** (reuse Core geofencing/check-in spine) + **shift management**.
- **P0** **Leave management**: policies, balances, applications, approvals (parity: SangamCRM "Leave Applications" — but full engine).
- **P0** **Employee Self-Service (ESS)** portal + mobile: payslips, leave, docs, requests.
- **P1** **Performance/appraisals**: goals/OKRs, review cycles.
- **P1** **Expense claims** & reimbursements (feeds Finance).
- **P2** Recruitment/ATS, learning/training.

**Acceptance (leave→payroll link):** Given an approved unpaid leave in a pay period, when payroll runs, then the loss-of-pay is auto-computed and reflected on the payslip without manual entry.

---

## 10. Requirements — Module 4: Payroll `[NEW — differentiator, compliance-critical]`

- **P0** **Salary structures** (earnings/deductions, CTC modeling) compliant with the **2025 Labour Codes uniform wage definition** — basic wages **≥50% of gross** (excluded allowances capped at 50%). *Must be modeled from day one.*
- **P0** **Statutory engine:**
  - **EPF/PF** 12% + 12% (8.33% to EPS), ₹15,000 basic+DA ceiling; **ECR file** generation.
  - **ESIC** 0.75% employee + 3.25% employer, ≤₹21,000 wage applicability.
  - **Professional Tax** (state-wise slabs).
  - **TDS on salary** (with declarations/proofs), **Form-16**.
  - **Gratuity**, **Labour Welfare Fund**, statutory bonus.
- **P0** **Payroll run**: preview → lock → payslips → bank-transfer/NEFT file; full-and-final settlement.
- **P0** **Compliance calendar & filings cadence**: PF/ECR + ESI by 15th, TDS deposit by 7th, PT by 21st — with reminders and pre-filled challans/returns.
- **P1** Loans/advances, arrears, reimbursements integration.
- **P2** Direct statutory e-filing where APIs permit; investment-proof workflow automation.

**Acceptance (statutory correctness):** Given an employee with gross ₹40,000 structured with basic <50%, when the structure is saved, then the system flags non-compliance with the uniform wage definition and blocks/auto-corrects per policy; PF/ESI are computed on the compliant base.

> ⚠️ Payroll is the most penalty-sensitive module. **P0 = statutory correctness + payslip + ECR/challan generation.** Direct auto-filing is P2. Never auto-file without human approval.

---

## 11. Requirements — Module 5: Inventory / Orders `[NEW — differentiator]`

- **P0** **Item master** (shared w/ Products): SKU, **HSN code**, UOM, tax mapping, **batch/serial** tracking.
- **P0** **Warehouses / locations**; **stock ledger** (real-time on-hand).
- **P0** **Purchase orders → GRN** (goods receipt); **Sales orders** (from quotations/opportunities).
- **P0** **Reorder levels** + low-stock alerts.
- **P0** Stock adjustments, transfers, valuation (FIFO/weighted-avg).
- **P1** Vendor management; landed cost.
- **P2** Manufacturing/BOM, multi-echelon.

**Acceptance (order→stock→invoice):** Given a confirmed sales order, when it's fulfilled, then stock decrements at the correct warehouse, a GST invoice is generated in Finance, and the CEO cockpit stock + revenue tiles update in real time.

---

## 12. Requirements — Module 6: Finance (GST-native) `[NEW — biggest wedge]`

- **P0** **GST invoicing** with correct **HSN** (6-digit for AATO >₹5cr, 4-digit ≤₹5cr), CGST/SGST/IGST logic, place-of-supply.
- **P0** **e-Invoicing / IRN**: generate IRN + QR via IRP for AATO >₹5cr (B2B/exports); auto-populate GSTR-1 & e-way Part-A.
- **P0** **e-Way bill** generation (base-document-linked).
- **P0** **GSTR-1 & GSTR-3B** preparation/filing (GSP-style); **QRMP** support for ≤₹5cr (quarterly returns, monthly tax).
- **P0** **GSTR-2B reconciliation** (static ITC statement, 14th) against purchases/GRN.
- **P0** **AR/AP**: customer/vendor ledgers, payments, **outstanding follow-ups** (feeds CRM tasks/WhatsApp reminders).
- **P1** Core double-entry GL, bank reconciliation, financial statements.
- **P1** **Tally import bridge** for migration (one-way, historical).
- **P2** Full accounting parity with Zoho Books/TallyPrime; multi-GSTIN consolidation.

**Acceptance (e-invoice flow):** Given a B2B invoice for a >₹5cr-turnover tenant, when it's finalized, then the system obtains a valid 64-char IRN + QR from the IRP, blocks edits post-IRN, and the invoice appears in the draft GSTR-1 — all without leaving Orbit.

> This module is the single biggest differentiator vs. SangamCRM (which only *syncs to* Tally). Native GST is why the CEO never leaves the cockpit.

---

## 13. Requirements — Module 7: Marketing & Channels `[parity]`
- **P0** Campaigns (email/WhatsApp/SMS), templates, suppression compliance.
- **P0** Lead-source capture (JustDial/IndiaMART/TradeIndia/website API) → auto-distributed leads.
- **P1** Campaign attribution to opportunities/revenue in the cockpit.

---

## 14. Requirements — AI Automation Layer `[NEW — decisive differentiator]`

**Design law:** every AI action is a *suggestion into an existing approval/workflow step* — logged, reversible, human-confirmable. No side-panel chatbot. (Grounded in the verified finding that ~95% of enterprise GenAI pilots fail on workflow integration, not model quality; back-office automation shows the strongest ROI.)

**Tier 1 — ship first (proven ROI):**
- **AI-1 (P0) Invoice/document OCR** — vendor bills/POs/receipts → structured entries + **GSTR-2B auto-match**.
- **AI-2 (P0) AI follow-up/email/WhatsApp drafting** — context-aware from the CRM record, human sends.
- **AI-3 (P0) Call transcription & summarization** — turn the telephony data we already capture into auto-logged outcomes + next steps.
- **AI-4 (P1) Payroll/attendance anomaly detection** — flag outliers pre-run.

**Tier 2 — data-maturity dependent:**
- **AI-5 (P1) Lead scoring & enrichment** — rank pipeline; route via auto-distribution.
- **AI-6 (P1) Inventory demand forecasting** — reorder suggestions from sales history + seasonality.
- **AI-7 (P1) NL reporting / cockpit copilot** — "show Q3 pipeline by rep vs. cash position." Grounded on real queries over our unified data model — the cockpit's headline feature.

**Tier 3 — later moats:**
- **AI-8 (P2) Agentic workflows** — "AI SDR" (drafts + schedules follow-ups), "AI compliance clerk" (preps GSTR/ECR for one-click human approval). Human-in-the-loop; never auto-files.

**Acceptance (AI-1):** Given an uploaded vendor invoice PDF, when OCR runs, then vendor, GSTIN, line items, HSN, tax, and total are extracted into an editable draft; the accountant confirms; the entry posts and is matched against GSTR-2B — with a visible confidence score and one-click correction.

---

## 15. CEO Cockpit `[NEW — the reason to exist]`

- **P0** Single real-time screen: **Revenue, Cash position, Pipeline, Outstanding (AR/AP), Headcount, Payroll liability, Stock value, Compliance-due alerts.**
- **P0** Drill-down from any tile into the underlying module.
- **P0** Configurable per CEO/role; mobile.
- **P1** NL copilot (AI-7) embedded: ask the cockpit in plain language.
- **P1** Anomaly/attention feed ("cash < payroll due in 6 days", "GSTR-1 due in 3 days", "5 deals slipping").

**Acceptance:** Given data across all modules, when the CEO opens the cockpit, then every tile reflects state as of <5 min ago, and each tile drills into its source records.

---

## 16. Success metrics

**Leading (weeks):**
- Cockpit **DAU by CEOs/owners** ≥ 60% of tenant admins within 30 days.
- **Modules-activated-per-tenant** ≥ 3 within 60 days (proof of "one-stop" vs. CRM-only use).
- Time-to-first-value: tenant live (CRM + cockpit) in **<14 days**, no consultant.
- AI-1/AI-3 adoption: ≥ 40% of finance/sales users use monthly; **task-time reduction ≥ 30%** on invoice entry / call logging.

**Lagging (quarters):**
- **Displacement rate:** % of new tenants migrating *off* SangamCRM/Zoho + a separate payroll tool.
- **Net revenue retention** ≥ 120% (expansion via module attach).
- **Compliance reliability:** ≥ 99% of e-invoices/returns generated error-free; zero penalty-causing defects.
- Support-ticket reduction vs. multi-tool baseline; CSAT/NPS lift.

**Measurement:** product analytics on activation/usage; billing on module attach + NRR; compliance QA dashboard on filing success.

---

## 17. Timeline & phasing

| Phase | Window | Ships | Why |
|---|---|---|---|
| **0 — Platform core** | M0–3 | Identity/RBAC, data model + event bus, workflow/approvals, Studio, reporting, channels, mobile, audit | Everything rides on this |
| **1 — CRM + thin cockpit** | M3–6 | Full CRM/Sales + Service Desk parity, lead capture, telephony integ, mobile+geofence; cockpit w/ CRM+cash tiles | Reach parity, **land first customers** |
| **2 — Finance (GST) + Inventory** | M6–10 | Native GST invoicing/e-invoice/e-way, GSTR-1/3B, 2B recon; items/warehouses/PO→GRN/SO | **Tally-killer**, biggest wedge |
| **3 — HR + Payroll** | M9–14 | HR lifecycle + ESS; statutory payroll engine (Labour Codes, PF/ESI/PT/TDS, payslips, ECR) | Complete the suite; add headcount/payroll tiles |
| **4 — AI deepened** | continuous from M3 | Tier-1 AI seeded in P1; Tier-2/3 as data accrues; NL cockpit copilot | Differentiate throughout |

**Rationale for order:** Finance+Inventory *before* HR+Payroll because it's the sharpest differentiator vs. SangamCRM, GST is a daily pain with clear willingness-to-pay, and the payroll engine is the most compliance-fragile piece — it benefits from a mature platform core.

---

## 18. Open questions

| # | Question | Owner | Blocking? |
|---|---|---|---|
| Q1 | Native GL depth in v1 vs. GST-invoicing-only + Tally import bridge? | Product + Finance/Eng | Blocks Phase 2 scope |
| Q2 | **Build-vs-buy the base** — fork ERPNext/Frappe (saves 6–9 mo on inventory/HR/accounting scaffolding) vs. clean-sheet AI-native? | Eng + CEO | Blocks Phase 0 architecture |
| Q3 | Beachhead vertical — distribution/trading vs. services vs. light manufacturing? (Cockpit KPIs & inventory depth differ) | CEO + GTM | Blocks cockpit + inventory detail |
| Q4 | GST filing: become a GSP ourselves vs. integrate a GSP/ASP (ClearTax/Zoho)? | Legal + Eng | Blocks Phase 2 |
| Q5 | Telephony: which provider(s) for the integration-first approach? | Eng + Partnerships | Non-blocking (Phase 1) |
| Q6 | AI model/provider strategy & data-privacy posture (customer data + India data-residency)? | Eng + Legal | Non-blocking, needed by Phase 1 AI seed |
| Q7 | Pricing model — per-user (Zoho-style) vs. per-module vs. hybrid? SangamCRM's own paid pricing is unverified, so price on value, not their number. | CEO + GTM | Non-blocking, needed pre-GA |

---

## 19. Where we BEAT vs. MATCH (summary)

| Area | Play |
|---|---|
| Sales CRM, tickets/SLA, quotations, lead capture, telephony, mobile/geofence | **Match** (parity is table stakes; integrate telephony, don't rebuild) |
| Native GST Finance (no Tally dependency) | **Beat** — biggest wedge |
| HR + Payroll (incl. 2025 Labour Codes) | **Beat** — incumbent has none |
| Inventory/Orders | **Beat** — incumbent has none |
| AI (OCR, call-summary, scoring, forecasting, NL cockpit) | **Beat decisively** — incumbent is rule-based only |
| Unified CEO cockpit across all modules | **Beat** — the whole thesis |

---

*Every India-compliance and market claim in this spec traces to an adversarially-verified research finding (see [product-blueprint.md](product-blueprint.md)). SangamCRM feature parity items trace to the live-tenant audit (see [sangamcrm-portal-audit.md](sangamcrm-portal-audit.md)). SangamCRM pricing is deliberately not asserted — it failed verification.*
