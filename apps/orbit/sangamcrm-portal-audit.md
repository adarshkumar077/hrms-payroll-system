# SangamCRM — Portal Feature Audit

**Source:** Live tenant `eitf.sangamcrm.com` (admin: Kalpesh Jain), Admin Panel scan.
**Product:** Sangam CRM by **Enjay IT Solutions Ltd.** (enjayworld.com). Version observed: **v123.1.12**.
**Date of scan:** 2026-07-03.
**Purpose:** Baseline the incumbent's capabilities so the new product is designed to *exceed*, not clone. Functionality/ideas only — no proprietary code or design assets copied.

---

## 1. Core Modules (data model)

Sales & service CRM at its heart:

| Module | Notes |
|---|---|
| Accounts | Company records (tenant has ~2,755) |
| Contacts | People (~4,004) |
| Leads | Top-of-funnel |
| Opportunities | Deals/pipeline with amounts (₹ Cr-scale), Closed Won/Lost |
| Quotations | Full quote engine w/ tax, discount, PDF, payment terms, T&C, bank details |
| Tickets | Support/service desk (SLA, TAT) |
| Activities (Tasks) | Task management |
| Calls | Telephony logging (tenant showed ~2,802 calls/7 days) |
| Messages | In-app/SMS messaging |
| Contracts | AMC/renewal contracts with automation |
| Products / Product Masters | Product catalog (light — for quoting, not full inventory) |
| Checklists | Process checklists (very heavily used — 22k+) |
| WhatsApps | WhatsApp conversations |
| Campaigns | Marketing campaigns |
| Reports | Reporting engine |
| Leave Applications | **HR-lite** — leave only |
| Attendances | **HR-lite** — attendance (mobile check-in) |
| Emails / Templates / Tags / Attachments | Supporting objects |
| My Firms / Branches, Tally Ledgers, Tally Item Masters | Tally (accounting) sync objects |
| Announcements | Internal comms |

## 2. Admin / Platform Capabilities

**Users & Controls:** User Management, Role Management (module + field-level restrictions), Team Management (region/dept), Employee Cost (per-hour cost → effort-based costing).

**Channels:** Outgoing Email config, SMS gateway, Email Suppression (SendGrid bounce/unsub handling).

**General:** CRM name/logo branding, Currency (multi-currency), Date/Time & timezone, Business Hours.

**Security:** IP Restriction, Password policy, Phone/Email Masking, **SSO**, **2FA**, Working Hours Restriction, Screen Capture Prevention (mobile).

**Developer Space (low-code):** **Studio** (rename modules/fields, enable/disable modules per web/mobile, layouts, field properties, field dependencies), Dropdown Editor, Label Editor. → Meaningful low-code customization, but not a full app builder.

**Automation:**
- **Workflow** — condition → action/alert (e.g. email on lead create).
- **Scheduler** — recurring jobs, scheduled reports, ageing.
- **Contract Automation** — auto-renewal contracts, feedback tickets, PMS/maintenance visit scheduling.
- **TAT Configuration** — turnaround time KPIs.
- **SLA Configuration** — response/resolution SLA + email escalation matrix.
- **Auto Product Creation** — from quotation/opportunity.

**Features:** OPR Dashboard config (Open/Periodic/Result), Scorecard, Auto Number Generation, Find Duplicate/de-dup, OTP Authentication (on field change), **Inbound Email → Lead/Ticket**, **Approval Management** (e.g. discount approval), **Auto Distributions** (round-robin, least-busy, business-hours, attendance-aware lead routing), Break Management, Live Dashboard (agent/call/queue), Celebration Wishes (auto birthday/anniversary), Lock Records.

**Plugins / Integrations:**
- **Enjay Synapse** — their own call-center/telephony solution (connector + call pop-up). *Telephony is a core strength.*
- Market Place — **JustDial, IndiaMART, TradeIndia** lead capture.
- Sangam API — website lead capture.
- IVR Connector.
- **Tally Connector (Sugam Tally)** — sync Tally ledgers, auto Sales Orders from quotations, outstanding/payment follow-up, item master sync. *Accounting via Tally, not native.*
- **WhatsApp (Gallabox)**.
- Autodesk, ETA/Distance API, **Power BI** connector.

**Quotation Setting:** number format, PDF field selection, tax & tax groups, payment terms, T&C, bank details, branch-wise PDF.

**Mobile App:** Attendance config (full/half day, week-offs), check-in/out **distance calc**, **Geofencing** (radius-based check-in), app statistics, mobile layout config, auto call logging.

---

## 3. Assessment — What SangamCRM IS and ISN'T

**Strong at (hard to beat head-on):**
- Sales CRM + service desk (SLA/TAT/tickets)
- **Telephony / call-center** (Synapse) — deeply integrated, a real moat
- Indian lead-source integrations (JustDial/IndiaMART/TradeIndia)
- WhatsApp + SMS channels
- Field-force mobile (geofencing, attendance, distance)
- Tally-based accounting sync
- Quotation-to-order flow

**Gaps / the opening for the new product:**
- **No real HR** — only leave + attendance. No employee lifecycle, onboarding, org chart, documents, appraisals.
- **No payroll at all** — no PF/ESI/PT/TDS, no payslips, no salary processing.
- **No true inventory/ERP** — Products are for quoting; no stock, warehouses, purchase orders, GRN, batch/serial.
- **No native finance/accounting** — depends on Tally sync; no native GST invoicing/e-invoice/e-way bill.
- **AI: essentially absent** — automation is rule/workflow-based, not AI. No lead scoring, no copilot, no NL reporting, no call summarization, no forecasting.
- **CEO cockpit** — dashboards are operational (OPR), not a cross-module executive one-stop view.

> **Strategic read:** SangamCRM is a *sales-and-service CRM with field-force + telephony*, wrapped by a Tally bridge for money. The user's vision — one-stop CEO shop spanning **leads + HR + payroll + inventory + finance, unified by AI** — is precisely what it is NOT. That is the differentiation thesis.

---

*Public-market research (competitors, India HR/payroll compliance, GST, AI use cases) is being gathered via the deep-research workflow and will be merged into the full product blueprint.*
