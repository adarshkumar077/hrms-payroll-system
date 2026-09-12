# One-Stop Business OS — Product Blueprint

**Goal:** A single "CEO cockpit" for India-focused SMB / mid-market unifying **Leads/CRM + HR + Payroll + Inventory + Finance**, with a real **AI automation layer** — built to *exceed* SangamCRM, not clone it.

**Two evidence bases behind this doc:**
1. **Portal audit** of the live SangamCRM tenant (`eitf.sangamcrm.com`, v123.1.12) — see [sangamcrm-portal-audit.md](sangamcrm-portal-audit.md).
2. **Deep-research** across 28 sources / 25 adversarially-verified claims (19 confirmed, 6 refuted). Citations inline.

---

## 1. The strategic thesis

SangamCRM is a **sales-and-service CRM with a strong telephony + field-force spine**, bridged to money via **Tally**. Its documented modules are CRM-centric (sales, helpdesk/AMC+SLA, marketing, workflow, mobile) — **verified: no native HR, payroll, inventory, or ERP; ERP/accounting exists only via Tally/SAP integration.** [confirmed 3-0]

Its real moats (attack these last, or partner around them):
- **Telephony via Enjay Synapse** — IVR routing, caller popups, click-to-call, auto call logging/recording. [confirmed 3-0]
- Indian lead-source capture (JustDial / IndiaMART / TradeIndia), WhatsApp, field-force mobile w/ geofencing.

**The negative space = your product.** The market is actively converging: by 2026 ERP/CRM vendors are collapsing sales + finance + ops + HR + service into one ecosystem with **real-time CEO dashboards** replacing monthly reports. [confirmed trend] That is exactly the "one-stop shop" the user wants — and exactly what SangamCRM is *not*.

**Positioning:** *"The AI business operating system for Indian SMBs — CRM, People, Inventory & Money in one screen. Compliance built-in, not bolted-on."*

---

## 2. Competitive landscape (verified)

| Suite | Model & price (INR) | Strength | Weakness / opening |
|---|---|---|---|
| **Zoho One** | Per-user, ~40+ bundled apps | Native OOB India GST/e-invoice/e-way; fast SaaS; best for trading/services [confirmed] | Breadth over depth; many apps = shallow; UX sprawl |
| **Odoo** | Per-user **and** per-app (cost scales both ways) [confirmed] | Deep modular ERP + MRP/manufacturing | Cost balloons with apps; implementation-heavy |
| **ERPNext / Frappe** | Open-source, low license cost | Manufacturing, low TCO, customizable | Needs dev skill; thin India-payroll & AI |
| **Freshworks** | Per-user | Polished CRM + helpdesk | No HR/payroll/inventory/finance |
| **Keka** | Payroll from **₹150/emp/mo** [confirmed] | Strong HR+payroll UX | HR-only; no CRM/inventory |
| **greytHR** | **₹40–100/emp/mo** [confirmed] | Payroll compliance depth | HR/payroll-only |
| **Zoho Payroll** | **₹99/emp/mo** [confirmed] | Tight India statutory | Locked to Zoho |
| **Kredily** | **Free** payroll tier [confirmed] | Free wedge | Monetization thin; shallow |
| **Vyapar / myBillBook** | Low-cost | GST invoicing for micro-biz | Generates GST reports but **requires separate portal filing** [confirmed] |
| **Zoho Books / TallyPrime** | — | **Strongest end-to-end GST**: direct GSTR-1/3B filing, e-invoice/IRN, e-way [confirmed 3-0] | Tally = desktop-first; Books = Zoho lock-in |

**Underserved segment (your wedge):** the 10–200 employee Indian SMB that today **stitches together** a CRM (SangamCRM/Zoho) + a payroll tool (Keka/greytHR) + Tally + spreadsheets. Nobody owns the *unified, AI-native, India-compliant* middle for that buyer at an SMB price. Zoho is broad-but-shallow; Odoo is deep-but-expensive/heavy; the HR players are point solutions.

> ⚠️ **SangamCRM pricing is genuinely unclear** — "free for up to 10 users (lifetime)" is well-corroborated, but the paid tier is contradictory across aggregators (₹750/user/mo vs a misread ₹12,000 IndiaMART "per piece/year" figure). All three specific paid-price claims were **refuted 0-3 / 1-2** in verification. Treat paid pricing as *unconfirmed*; do primary diligence before pricing against it.

---

## 3. Recommended module architecture

A shared **platform core** with modules on top — this is what lets you deliver the "one screen" CEO view competitors can't, because their modules were bolted together.

```
┌─────────────────────────────────────────────────────────────┐
│                    CEO COCKPIT (cross-module)                │
│   Revenue · Cash · Pipeline · Headcount · Stock · Alerts     │
├─────────────────────────────────────────────────────────────┤
│  AI AUTOMATION LAYER (copilot, agents, NL-reporting, OCR)    │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  CRM /   │   HR     │ PAYROLL  │ INVENTORY│   FINANCE       │
│  LEADS   │          │          │ / ORDERS │  (GST-native)   │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│  PLATFORM CORE:                                              │
│  Identity/RBAC · Workflow engine · Approvals · Notifications │
│  Audit log · Low-code Studio (fields/layouts) · Reports/BI   │
│  Channels: Email/SMS/WhatsApp · Telephony/IVR · Mobile+GPS   │
│  Single data model + event bus (every module emits events)   │
└─────────────────────────────────────────────────────────────┘
```

**Module scope (v1 targets):**

- **CRM / Leads** — match SangamCRM: leads, accounts, contacts, opportunities, quotations (tax/PDF), tickets w/ SLA/TAT, campaigns, WhatsApp, JustDial/IndiaMART/TradeIndia capture, mobile field-force + geofencing. *Add:* AI lead scoring, AI follow-up drafting, call summarization.
- **HR** (the gap) — employee lifecycle: onboarding/offboarding, org chart, documents, attendance (reuse geofencing spine), leave, shifts, appraisals/goals, expense claims, employee self-service (ESS) portal + mobile.
- **Payroll** (the gap) — India statutory engine (see §4). Salary structures, runs, payslips, Form-16, direct-deposit files, full-and-final.
- **Inventory / Orders** (the gap) — items (batch/serial), warehouses, stock ledger, purchase orders → GRN, sales orders, reorder points. Feeds Finance & Quotations.
- **Finance (GST-native)** (the gap) — invoicing, e-invoice/IRN, e-way bills, GSTR-1/3B, GSTR-2B reconciliation, payments, outstanding. *This is where you beat the Tally-dependency.*

---

## 4. India compliance — non-negotiable requirements (verified)

### Payroll statutory engine
- **EPF/PF:** 12% employee + 12% employer; 8.33% of employer share to EPS; wage ceiling ₹15,000 basic+DA. ECR filing due **15th** monthly. [confirmed]
- **ESIC:** 0.75% employee + 3.25% employer; applies ≤ ₹21,000 wages; due **15th**. [confirmed]
- **TDS on salary:** deposit by **7th**; Form-16 annually. [confirmed]
- **Professional Tax:** state-varying; typically due **21st**. [confirmed]
- **Gratuity, Labour Welfare Fund, statutory bonus.**
- **⚠️ NEW — Labour Codes (enforced 21 Nov 2025) + uniform wage definition (~Dec 2025):** basic wages for PF/ESI/gratuity must be **≥50% of gross** (excluded allowances capped at 50% of gross). This *raises the contribution base* and breaks old "low-basic, high-allowance" salary structures. [confirmed 3-0] **Your payroll engine must model this from day one** — it's a live migration pain competitors are scrambling on.

### GST / Finance
- **e-invoicing** mandatory for AATO **> ₹5 crore** (B2B/exports); IRN = 64-char hash (GSTIN+FY+doc); **auto-populates GSTR-1 and Part-A of e-way bill.** [confirmed 3-0]
- **e-Way bill:** requires a base document (invoice/bill/challan). [confirmed]
- **QRMP** for turnover ≤ ₹5 crore — quarterly GSTR-1/3B, monthly tax. [confirmed]
- **GSTR-2B:** static auto-drafted ITC statement, generated **14th** monthly — build reconciliation against purchases. [confirmed]
- **GSTR-3B:** monthly/quarterly summary; mandatory even for nil months. [confirmed]
- **HSN codes:** 6-digit (AATO >5cr) / 4-digit (≤5cr) in GSTR-1; **manual HSN entry replaced by dropdown** — validate against master. [confirmed 3-0]
- **MFA mandatory** on GST portal since 1 Apr 2025. [confirmed]

**Beat-the-incumbent move:** SangamCRM *syncs to* Tally for money. You make GST filing **native** (like Zoho Books/TallyPrime, the verified gold standard) so the CEO never leaves the cockpit. That single decision is your biggest differentiator vs. SangamCRM.

---

## 5. The AI automation layer — where the real leverage is

**Reality check (build accordingly):** MIT's NANDA study found **~95% of enterprise GenAI pilots delivered zero measurable P&L impact** — and failures were driven by **workflow/organizational integration, not model quality.** [confirmed] The lesson: **don't ship a chatbot bolted on the side. Embed AI inside the workflow where the data and the action already live.** Back-office automation shows the **strongest, most reliable ROI.** [confirmed]

Prioritized by ROI-certainty (ship top-down):

**Tier 1 — proven back-office wins (build first):**
1. **Invoice/document OCR extraction** — vendor bills, POs, receipts → structured entries + GSTR-2B match. High, measurable ROI.
2. **AI follow-up / email & WhatsApp drafting** — context-aware from CRM record. Immediate rep time savings.
3. **Call transcription & summarization** — leverage the telephony data SangamCRM already captures but doesn't understand; auto-log outcomes + next steps.
4. **Payroll/attendance anomaly detection** — flag outliers before the run.

**Tier 2 — high value, needs data maturity:**
5. **Lead scoring & enrichment** — rank pipeline; route via existing auto-distribution logic.
6. **Inventory demand forecasting** — reorder suggestions from sales history + seasonality.
7. **NL reporting / "chat with your data" copilot** — CEO asks "show Q3 pipeline by rep vs cash position"; the cockpit answers. This *is* the cockpit's headline feature — but ground it in real queries, not a freeform LLM.

**Tier 3 — differentiators, later:**
8. **Agentic workflows** — "AI SDR" that drafts + schedules follow-ups; "AI compliance clerk" that preps GSTR/ECR files for one-click human approval. (Human-in-the-loop; never auto-file.)

**Design rule:** every AI action is a **suggestion into an existing approval/workflow step**, logged and reversible — this is what makes it land where 95% fail.

---

## 6. Phased build roadmap

You answered **"all of the above"** for lead module — so the sequencing below builds the unifying spine first, then layers modules so you don't drown.

**Phase 0 — Platform core (months 0–3):** identity/RBAC, single data model + event bus, workflow/approval engine, notifications, audit log, low-code Studio, reporting/BI, channels (email/SMS/WhatsApp). *Everything else rides on this.*

**Phase 1 — CRM + a thin CEO cockpit (months 3–6):** reach SangamCRM parity on sales/service + lead capture + mobile. Ship the cockpit with just CRM+cash tiles. **Land first customers here.**

**Phase 2 — Finance (GST-native) + Inventory (months 6–10):** native invoicing, e-invoice/IRN, e-way, GSTR-1/3B, GSTR-2B recon; items/warehouses/stock/PO→GRN/SO. *This is the Tally-killer and the biggest wedge vs. SangamCRM.*

**Phase 3 — HR + Payroll (months 9–14):** lifecycle, ESS, attendance/leave, then the statutory payroll engine (§4) incl. the new Labour-Code wage rules. Now the cockpit shows headcount + payroll cost.

**Phase 4 — AI layer, deepened (continuous, seeded from Phase 1):** Tier 1 AI from the start (OCR, drafting, call summary), Tier 2/3 as data accrues. NL cockpit copilot as the flagship.

**Sequencing logic:** Finance+Inventory before HR+Payroll because (a) it's the sharpest differentiator vs. SangamCRM, (b) GST is a daily pain with clear willingness-to-pay, (c) payroll is the most compliance-fragile module and benefits from a mature platform core first.

---

## 7. Where to BEAT vs. MATCH the incumbent

| Area | Strategy |
|---|---|
| Sales CRM, tickets/SLA, quotations | **Match** — table stakes; don't over-invest |
| Telephony / IVR | **Match via integration** (don't rebuild Synapse; use IVR-connector pattern) |
| Lead-source capture (JustDial/IndiaMART) | **Match** — required for India credibility |
| Native GST finance (no Tally dependency) | **BEAT** — biggest wedge |
| HR + Payroll (esp. new Labour Codes) | **BEAT** — SangamCRM has none |
| Inventory/orders | **BEAT** — SangamCRM has none |
| AI (scoring, OCR, call summary, NL cockpit) | **BEAT decisively** — SangamCRM is rule-based only |
| Unified CEO cockpit across all modules | **BEAT** — the whole reason to exist |

---

## 8. Recommended connectors to enable

For the *research + build-planning* work (not for scraping anyone's portal):

| Connector | Use | Priority |
|---|---|---|
| **Notion** or **Atlassian/Confluence** | House this blueprint + PRDs + module specs | High |
| **Linear** (or Jira/Asana/ClickUp) | Turn the roadmap into an epic/ticket backlog | High |
| **Figma** | CEO-cockpit + module UI mockups | Medium |
| **Web search/fetch** | Ongoing competitor + compliance monitoring | On |
| Chrome browser | *Only* your own tenants/sandboxes — not competitor systems | Situational |

> All plugin connectors (Notion, Linear, Atlassian, Figma, etc.) currently need authorization from your **claude.ai connector settings** before use — they aren't authenticated in this session.

---

## 9. Open decisions for you

1. **Native accounting vs. deep Tally/Zoho-Books integration for v1?** Native = bigger moat but heavier build. (Recommend: native GST invoicing in Phase 2, keep a Tally *import* bridge for migration.)
2. **Build vs. buy the base?** ERPNext/Frappe is open-source and covers inventory+HR+accounting scaffolding — forking it could cut 6–9 months, at the cost of architectural freedom and the "AI-native" clean-sheet advantage.
3. **Telephony:** integrate (fast) vs. own (moat). Recommend integrate first.
4. **Target sub-segment for the beachhead** — which vertical (e.g., distribution/trading, services, light manufacturing) do you sell into first? The cockpit KPIs differ by vertical.

---

*Sources span primary (sangamcrm.com, EY labour-code alert, ClearTax GST refs) and secondary aggregators; every load-bearing claim above was adversarially verified 2-of-3 or 3-of-3. Pricing figures for SangamCRM specifically failed verification and are flagged as uncertain.*
