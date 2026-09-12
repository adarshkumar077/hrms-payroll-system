# Orbit — Complete Product & Test Guide (UAT Playbook)

Use this to test **every module** end-to-end. Each test has **Steps** and **Expected result**. Tick the box as you verify.

---

## 0. Start the app (once)

```bash
cd "E:\Final Projects Repo\SangamCRM"
npm run dev
```
Open **http://localhost:3000**

**Logins (demo tenant: Acme Distributors Pvt Ltd)**
| User | Password | Role |
|---|---|---|
| `ceo@demo.orbit` | `orbit123` | **CEO** — sees everything |
| `sales@demo.orbit` | `orbit123` | **Sales** — restricted (used for the RBAC test) |

**AI status:** top-right header badge should read **"AI Groq · llama-3.3-70b-versatile"** (green). If it says "AI Local", the LLM key isn't loaded — AI features still work via local fallback.

**Reset demo data anytime:** `npm run db:reset`

---

## 1. Login & Security
- [ ] **1.1** Go to `/` while logged out → redirected to `/login`.
- [ ] **1.2** Wrong password → "Invalid credentials" error.
- [ ] **1.3** Correct login (`ceo@demo.orbit`) → lands on CEO Cockpit.
- [ ] **1.4** Click **Sign out** (top-right) → back to `/login`; visiting `/dashboard` redirects to login.

---

## 2. CEO Cockpit  (`/dashboard`)
- [ ] **2.1** Money line shows 4 cards: **Revenue (Won)**, **Cash Collected**, **Receivables**, **Weighted Pipeline** — all in ₹ Lakh/Cr.
- [ ] **2.2** Operations row: **Open Leads**, **Open Tickets**, **Headcount**, **Stock Value**.
- [ ] **2.3** Click any card → drills into that module (e.g. Revenue → Opportunities).
- [ ] **2.4** **Needs your attention** panel lists alerts (e.g. cash vs payroll, receivables, GSTR-1 due).
- [ ] **2.5** **Pipeline by stage** bar chart renders with amounts per stage.
- [ ] **2.6** **Live activity** feed shows recent events (invoice finalized, payroll locked, lead created…).
- **Expected:** every number is real (computed from seed data), tiles are clickable, no blanks.

---

## 3. CRM — Leads  (`/leads`)
- [ ] **3.1** List shows ~24 leads with **source** and **status** badges.
- [ ] **3.2** Stat cards: open leads, top source, converted count.
- [ ] **3.3** Click **"Score with AI"** on a row → a score (0–100) + reason appears within a few seconds.
- [ ] **3.4** Click **"Score all unscored"** → all leads get scores.
- [ ] **3.5** Change a lead's **status** via the dropdown → persists on refresh.
- [ ] **3.6** Open a lead (click name) → detail page with a **"Draft follow-up"** panel; pick channel (email/WhatsApp) → generates a message into an editable box. *(It does NOT send — human-in-the-loop.)*
- **Expected:** AI reasons read naturally (e.g. "high-intent marketplace source"); scores persist.

## 4. CRM — Opportunities  (`/opportunities`)
- [ ] **4.1** Pipeline board: 5 columns (Qualification → Proposal → Negotiation → ClosedWon → ClosedLost) with deal cards (account + amount + probability).
- [ ] **4.2** Stat cards: gross pipeline, weighted, won this month.
- [ ] **4.3** Click **"Advance →"** on an open deal → it moves to the next stage, probability bumps.

## 5. CRM — Accounts  (`/accounts`)
- [ ] **5.1** List of ~8 accounts with contact count, city/state, GSTIN.
- [ ] **5.2** Click **"+ New Account"** → fill form → new account appears in list.

## 6. CRM — Quotations  (`/quotations`)
- [ ] **6.1** List shows quote number, status, subtotal, tax, grand total (₹).
- [ ] **6.2** Stat cards by status + total value.

## 7. CRM — Tickets  (`/tickets`)
- [ ] **7.1** List: subject, account, **priority** badge, **status** badge, SLA due (red if past).
- [ ] **7.2** Stat cards: open, urgent, breached.
- [ ] **7.3** Change a ticket's **status** → persists.

---

## 8. HR — Employees  (`/hr/employees`)
- [ ] **8.1** List of ~14 employees: code, name, department, designation, DOJ, CTC, monthly gross.
- [ ] **8.2** Stat cards: headcount, dept breakdown, total monthly payroll cost.
- [ ] **8.3** Click **"+ Add Employee"** → fill (name, dept, designation, CTC) → appears in list, and a **compliant salary structure** is auto-created (basic = 50% of gross).
- [ ] **8.4** Open an employee → detail shows salary breakdown (gross/basic/HRA/allowances) + green **"Labour-Code compliant: basic ≥ 50% gross"** badge, plus recent attendance & leaves.

## 9. HR — Leave & Attendance  (`/hr/leave`)
- [ ] **9.1** Stat cards: pending leaves, on-leave-today, present-today.
- [ ] **9.2** Leave table with employee, type, dates, days, status.
- [ ] **9.3** **Approve** / **Reject** a pending leave → status updates.
- [ ] **9.4** Attendance section shows check-in + **geofence distance**; distance > 100m flagged red.

---

## 10. Payroll  (`/payroll`)  ← compliance-critical
- [ ] **10.1** Runs list: month/year, status, gross, net, PF, ESI, TDS totals.
- [ ] **10.2** Stat cards: latest gross, net, statutory total.
- [ ] **10.3** Click **"Run payroll for {next month}"** → a new Draft run is created with payslips for all employees; totals aggregate.
- [ ] **10.4** **Lock** the run → status Locked; then **Mark paid** → Paid.
- [ ] **10.5** Open a run → **payslip register**: per-employee gross, basic, PF (EE+ER), ESI, PT, TDS, net + totals row.
- [ ] **10.6** Expand a payslip → clean earnings-vs-deductions-vs-net card.
- **Expected:** PF = 12% of basic (capped ₹15k), ESI = 0.75% if gross ≤ ₹21k, statutory maths correct.

*(RBAC check for payslips is Test 15.)*

---

## 11. Inventory  (`/inventory`)
- [ ] **11.1** Items list: name, SKU, HSN, UOM, on-hand, reorder, cost, stock value; rows **below reorder highlighted amber**.
- [ ] **11.2** Stat cards: total SKUs, stock value, items below reorder.
- [ ] **11.3** **Adjust stock** (+In / −Out, qty, reason) → on-hand updates, a stock move is logged.
- [ ] **11.4** Open an item → **stock-move ledger** (date, type, +/− qty, ref).

## 12. Inventory — Purchase Orders  (`/inventory/purchase-orders`)
- [ ] **12.1** PO list: number, vendor, status, total, created date.
- [ ] **12.2** **Create PO** (vendor, total) → appears in list.
- [ ] **12.3** **Receive** a Draft/Sent PO → status → Received.

---

## 13. Finance — GST Invoices  (`/finance/invoices`)  ← biggest differentiator
- [ ] **13.1** List: number, account, place of supply, subtotal, tax, grand total, status, **e-invoice indicator** (green "IRN ✓" or "—").
- [ ] **13.2** Stat cards: total invoiced, tax collected, receivables, e-invoiced count.
- [ ] **13.3** **GSTR-1 Draft** card groups finalized invoices by tax rate ("auto-prepared from finalized invoices").
- [ ] **13.4** **Compliance** card shows GSTIN, AATO, and whether e-invoicing is mandatory.
- [ ] **13.5** **+ New GST Invoice** → pick account + product + qty → live CGST/SGST-vs-IGST preview (intra-state Maharashtra = CGST+SGST, else IGST) → create.
- [ ] **13.6** **Finalize** a Draft invoice → status Finalized; since AATO > ₹5cr an **IRN + Ack No** are generated; grand total > ₹50k also gets an **e-way bill no**.
- [ ] **13.7** **Mark paid** → status Paid (moves from receivables to cash on the cockpit).
- [ ] **13.8** Open an invoice → renders as a **real GST tax invoice**: seller/buyer GSTINs, HSN per line, CGST/SGST/IGST split, and an **"e-Invoice (IRP)"** box with IRN/Ack/e-way + a **Sandbox/Mock** badge (flips to **Live (IRP)** once real IRP creds are set in `.env`).

---

## 14. AI Console  (`/ai`)
- [ ] **14.1** Banner shows **"Connected to Groq …"** (or Local).
- [ ] **14.2** **Re-score all** → all 24 leads scored; hot (≥70)/cold (<40) counts update; reasons read naturally.
- [ ] **14.3** **Follow-up drafting** → pick a lead + channel → editable draft returned ("Review before sending — never auto-sends").
- [ ] **14.4** **Call summarizer** → paste a transcript → 2-bullet + "Next step:" summary → **Save as Activity** creates an activity.

## 15. Ask Orbit — Copilot  (`/copilot`)
Type or tap a chip; verify the answer matches the cockpit numbers:
- [ ] **15.1** "What's my cash position?" → ₹ figure (paid invoices).
- [ ] **15.2** "Show pipeline by stage" → answer + a per-stage table.
- [ ] **15.3** "How many open leads?" → count.
- [ ] **15.4** "What's the payroll liability?" → ₹ figure.
- [ ] **15.5** "Which items are low on stock?" → names the item(s) below reorder.
- [ ] **15.6** "How much GST have we collected?" → ₹ tax figure.
- **Expected:** each answer is correct vs the module data; a grey **intent** tag shows under each answer.

## 16. Integrations — Lead Capture  (`/integrations`)
- [ ] **16.1** A card per source (IndiaMART, JustDial, TradeIndia, Website) with its webhook URL + setup notes.
- [ ] **16.2** Click **"Simulate incoming lead"** on IndiaMART → returns a new lead id; open `/leads` → the new lead is there, **auto-scored**.
- [ ] **16.3** (Optional) POST your own payload:
  ```bash
  curl -X POST http://localhost:3000/api/marketplace/IndiaMART \
    -H "Content-Type: application/json" \
    -d '{"SENDER_NAME":"Test","SENDER_MOBILE":"9999999999","SENDER_COMPANY":"Test Co","QUERY_PRODUCT_NAME":"Router"}'
  ```
  → `{ok:true, leadId:...}`.

---

## 17. RBAC / field security  (login as Sales)
- [ ] **17.1** Sign out → log in as `sales@demo.orbit` / `orbit123`.
- [ ] **17.2** Open **Payroll → a run** → **Net Pay is masked as "•••"** (field-level restriction), while the CEO sees the real figure.
- [ ] **17.3** Confirm the Sales user still uses CRM normally.
- **Expected:** the same page shows different data by role — proves module + field-level RBAC.

## 18. Platform / health
- [ ] **18.1** `http://localhost:3000/api/health` → `{"status":"ok","db":true}`.
- [ ] **18.2** Every sidebar link opens without error (Cockpit, all CRM, HR, Payroll, Inventory, Finance, Copilot, AI Console, Integrations).

---

## Module coverage map (what proves what)

| Module | Route | Key test |
|---|---|---|
| CEO Cockpit | `/dashboard` | 2.1–2.6 |
| CRM Leads + AI | `/leads` | 3.3, 3.6 |
| Opportunities | `/opportunities` | 4.3 |
| Accounts / Quotes / Tickets | `/accounts` `/quotations` `/tickets` | 5–7 |
| HR | `/hr/employees` `/hr/leave` | 8.3, 8.4, 9.3 |
| Payroll (statutory) | `/payroll` | 10.3–10.6 |
| Inventory | `/inventory` `/inventory/purchase-orders` | 11.3, 12.2 |
| GST Finance + e-invoice | `/finance/invoices` | 13.5–13.8 |
| AI layer | `/ai` | 14.2–14.4 |
| NL Copilot | `/copilot` | 15.1–15.6 |
| Marketplace capture | `/integrations` | 16.2 |
| RBAC | (Sales login) | 17.2 |
| Deploy/health | `/api/health` | 18.1 |

---

## Known boundaries (by design, not bugs)
- **IRN / e-way** numbers are realistic **mocks** until you add real GSP/IRP sandbox creds (`.env.irp.example`) — the JSON schema sent is the real NIC v1.1 format.
- **Marketplace** uses a demo tenant + dev-mode webhook auth until `MARKETPLACE_WEBHOOK_KEY` is set (`.env.marketplace.example`).
- **Telephony, double-entry GL, mobile app** are modelled/stubbed, not built.
- **AI** runs on Groq (free); swap providers in `.env` anytime.

---

*Full feature spec: [product-spec-prd.md](product-spec-prd.md) · architecture: [product-blueprint.md](product-blueprint.md) · incumbent audit: [sangamcrm-portal-audit.md](sangamcrm-portal-audit.md) · deploy: [DEPLOY.md](DEPLOY.md)*
