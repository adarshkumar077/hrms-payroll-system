# Orbit — UI Flow & Verification Guide

Complete, click-through verification guide for **every screen and flow** in Orbit. Supersedes the older `product-test-guide.md` (predates Vendor Bills, OCR, Bank Reconciliation, Ledger, Financial Reports, Admin, Billing, Notifications, Settings/2FA, Import/Export, Documents, Search, SSO).

Use checkboxes to track progress. All route paths are real; all button/label text is copied verbatim from source.

---

## 1. How to start & log in

```bash
cd "E:\Final Projects Repo\SangamCRM"
npm run setup   # first time only — prisma generate + db push + seed
npm run dev
```

Open **http://localhost:3000** (redirects to `/login` if logged out, `/dashboard` if logged in).

**Demo logins** (tenant: Acme Distributors Pvt Ltd):

| Email | Password | Role | Notes |
|---|---|---|---|
| `ceo@demo.orbit` | `orbit123` | **CEO** | Sees everything, no field masking |
| `sales@demo.orbit` | `orbit123` | **Sales** (restricted) | Payroll `Net Pay` shown as `•••` — see RBAC flow |

Reset demo data any time: `npm run db:reset` (destructive).

**Header controls** (`app/(app)/layout.tsx`, present on every authed page):
- Tenant name + GSTIN (top-left).
- **Global search box** — `<input name="q">` inside a form posting to `/search`. Type ≥2 chars + Enter.
- **✨ AI badge** — green `✨ AI {provider}` (e.g. "Groq") when `aiEnabled`, grey `✨ AI Local` otherwise (local heuristic fallback, hover shows tooltip).
- **🔔 Notifications bell** — links to `/notifications`; red badge with unread count (9+ caps).
- **⚙️ Settings gear** — links to `/settings`.
- User name + role (CEO/Member).
- **Sign out** button — `POST /api/auth/logout`.

---

## 2. Sitemap / route map

### Public (unauthenticated) pages

| Path | What it is |
|---|---|
| `/` (`app/page.tsx`) | Redirects to `/dashboard` (if session) or `/login`. |
| `/login` | Email/password sign-in + "Sign in with Google" (SSO, pluggable). |
| `/login/2fa` | TOTP/recovery-code prompt — only reachable mid-login when a pending-2FA cookie exists. |
| `/signup` | Create a brand-new tenant + CEO user. |
| `/reset-password` | Forgot-password request + token-based reset (no email provider — link shown on screen). |
| `/accept-invite` | Set a password from an admin-issued invite token. |

### Authed pages — `app/(app)/**` (the `(app)` folder is a route group, **not** part of the URL)

| Path | Page file | Module |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | CEO Cockpit |
| `/leads` | `leads/page.tsx` | Leads list |
| `/leads/[id]` | `leads/[id]/page.tsx` | Lead detail + AI follow-up |
| `/opportunities` | `opportunities/page.tsx` | Pipeline board |
| `/accounts` | `accounts/page.tsx` | Accounts |
| `/quotations` | `quotations/page.tsx` | Quotations (read-only list) |
| `/tickets` | `tickets/page.tsx` | Support tickets |
| `/hr/employees` | `hr/employees/page.tsx` | Employee roster |
| `/hr/employees/[id]` | `hr/employees/[id]/page.tsx` | Employee detail |
| `/hr/leave` | `hr/leave/page.tsx` | Leave & attendance |
| `/payroll` | `payroll/page.tsx` | Payroll runs |
| `/payroll/[id]` | `payroll/[id]/page.tsx` | Payslip register |
| `/inventory` | `inventory/page.tsx` | Items & stock |
| `/inventory/[id]` | `inventory/[id]/page.tsx` | Item detail + stock ledger |
| `/inventory/purchase-orders` | `inventory/purchase-orders/page.tsx` | Purchase orders |
| `/finance/invoices` | `finance/invoices/page.tsx` | GST invoices |
| `/finance/invoices/[id]` | `finance/invoices/[id]/page.tsx` | Invoice detail (tax invoice view) |
| `/finance/bills` | `finance/bills/page.tsx` | Vendor Bills (AP) |
| `/finance/ocr` | `finance/ocr/page.tsx` | Scan Bill (OCR) |
| `/finance/bank` | `finance/bank/page.tsx` | Bank Reconciliation |
| `/finance/ledger` | `finance/ledger/page.tsx` | Chart of accounts + recent journals |
| `/finance/ledger/new` | `finance/ledger/new/page.tsx` | Manual journal entry form |
| `/finance/ledger/[id]` | `finance/ledger/[id]/page.tsx` | Journal entry detail |
| `/finance/ledger/account/[code]` | `finance/ledger/account/[code]/page.tsx` | Single-account general ledger |
| `/finance/reports` | `finance/reports/page.tsx` | Trial Balance / P&L / Balance Sheet |
| `/ai` | `ai/page.tsx` | AI Console |
| `/copilot` | `copilot/page.tsx` | Ask Orbit (NL copilot) |
| `/integrations` | `integrations/page.tsx` | Marketplace lead capture |
| `/documents` | `documents/page.tsx` | File upload/download |
| `/import` | `import/page.tsx` | CSV import/export |
| `/admin` | `admin/page.tsx` | Users, roles, audit, DPDP, SSO status |
| `/billing` | `billing/page.tsx` | Plans & seats |
| `/notifications` | `notifications/page.tsx` | Notification inbox |
| `/settings` | `settings/page.tsx` | Profile, password, 2FA |
| `/search` | `search/page.tsx` | Global search results (reads `?q=`) |

### Print / PDF routes — `app/print/**` (standalone, no sidebar/header; reachable only by direct URL)

| Path | Renders |
|---|---|
| `/print/invoice/[id]` | GST tax invoice, Ctrl-P → PDF |
| `/print/payslip/[id]` | Payslip, Ctrl-P → PDF |
| `/print/quotation/[id]` | Sales quotation, Ctrl-P → PDF |

Each has a floating **"Print / Save PDF"** button (`PrintButton.tsx`, `window.print()`) hidden in the print stylesheet.

### API routes — `app/api/**`

| Route | Method | Purpose | Auth |
|---|---|---|---|
| `/api/auth/logout` | POST | Clears session cookie, redirects to `/login`. | session |
| `/api/auth/sso/google` | GET | Redirects to Google OAuth consent (or `/login?sso=unconfigured` if `GOOGLE_CLIENT_ID`/`SECRET` unset). | public |
| `/api/auth/sso/google/callback` | GET | Exchanges code, signs in an **existing** user matched by email (no auto-provisioning); honors 2FA. | public (redirect flow) |
| `/api/health` | GET | `{ status: "ok", db: true }` (503 if DB unreachable). | public |
| `/api/marketplace/[source]` | POST | Inbound lead-capture webhook for `IndiaMART`/`JustDial`/`TradeIndia`/`Website`. | webhook key (`x-orbit-key` vs `MARKETPLACE_WEBHOOK_KEY`; open if unset — dev mode) |
| `/api/cron` | GET, POST | Runs due `Job` rows (payroll reminder, SLA ageing, compliance reminder). | webhook key (`x-cron-secret` vs `CRON_SECRET`; open if unset) |
| `/api/export/[model]` | GET | Streams a tenant-scoped CSV for `leads`\|`employees`\|`items`\|`invoices`. | session |
| `/api/upload` | POST | Multipart file upload → `Attachment` row, saved under `data/uploads/<tenantId>/`. | session |
| `/api/file/[id]` | GET | Streams an uploaded file back (tenant-scoped). | session |

**Route count documented: 35 authed `(app)` pages (incl. dynamic segments) + 1 root redirect (`/`) + 5 public auth pages (`/login`, `/login/2fa`, `/signup`, `/reset-password`, `/accept-invite`) + 3 print routes + 9 API routes = 53 routes** (44 `page.tsx` files + 9 `route.ts` files).

---

## 3. Navigation map (from `lib/nav.ts`)

| Group | Item | Route |
|---|---|---|
| **Command** | 🛰️ CEO Cockpit | `/dashboard` |
| **CRM** | 🎯 Leads | `/leads` |
| | 💼 Opportunities | `/opportunities` |
| | 🏢 Accounts | `/accounts` |
| | 🧾 Quotations | `/quotations` |
| | 🎫 Tickets | `/tickets` |
| **People** | 👥 Employees | `/hr/employees` |
| | 🌴 Leave & Attendance | `/hr/leave` |
| | 💰 Payroll | `/payroll` |
| **Operations** | 📦 Inventory | `/inventory` |
| | 🛒 Purchase Orders | `/inventory/purchase-orders` |
| **Money** | 🇮🇳 GST Invoices | `/finance/invoices` |
| | 🧾 Vendor Bills (AP) | `/finance/bills` |
| | 📸 Scan Bill (OCR) | `/finance/ocr` |
| | 🏦 Bank Reconciliation | `/finance/bank` |
| | 📒 Ledger & Journals | `/finance/ledger` |
| | 📊 Financial Reports | `/finance/reports` |
| **Intelligence** | 💬 Ask Orbit (Copilot) | `/copilot` |
| | ✨ AI Console | `/ai` |
| **Setup** | 🔌 Integrations | `/integrations` |
| | 📎 Documents | `/documents` |
| | 📥 Import / Export | `/import` |
| | 🛡️ Admin & Users | `/admin` |
| | 💳 Billing | `/billing` |

(`/notifications`, `/settings`, `/search` are header-only, not in the sidebar.)

- [ ] Every sidebar link above opens without error for the CEO login.

---

## 4. Per-screen verification

### 4.1 CEO Cockpit — `/dashboard`
Purpose: cross-module, read-only executive summary; every tile links out (no in-page mutations).

- [ ] Header greeting "Good day, {FirstName} 👋" + AI badge.
- [ ] Money row (4 cards, clickable): **Revenue (Won)** → `/opportunities`; **Cash Collected** → `/finance/invoices`; **Receivables** → `/finance/invoices`; **Weighted Pipeline** → `/opportunities`.
- [ ] Ops row (4 cards, clickable): **Open Leads** → `/leads`; **Open Tickets** → `/tickets`; **Headcount** → `/hr/employees`; **Stock Value** → `/inventory`.
- [ ] **🔔 Needs your attention** panel — conditional alerts: red "cash below payroll liability", amber "items below reorder", amber "receivables outstanding", blue "GSTR-1 filing due on 11th" (always shown).
- [ ] **📊 Pipeline by stage** — bar per stage (Qualification/Proposal/Negotiation/ClosedWon/ClosedLost) with amount + count.
- [ ] **⚡ Live activity** — last 8 events (invoice finalized, payroll locked, lead created…).
- **Expected:** every figure is computed from live seed data; no blank tiles.

### 4.2 CRM — Leads — `/leads`, `/leads/[id]`
- [ ] List shows leads with source/status badges; stat cards Open Leads / Top Source / Converted.
- [ ] `FilterBar`: status dropdown (New/Contacted/Qualified/Converted/Dead) + search "Search name, company, email, phone…"; sortable Newest/Name/Score; paginated.
- [ ] Header button **"✨ Score all unscored"** (shows count, e.g. "(5)") → scores every unscored lead; disabled at 0.
- [ ] Row button **"✨ Score with AI"** → adds score (0–100) + reason within seconds.
- [ ] Row status `<select>` (New/Contacted/Qualified/Converted/Dead) → persists on refresh.
- [ ] Open a lead → detail page: Status/Source/AI Score stat cards, Details panel, **"✨ Draft follow-up"** panel — pick channel (Email/WhatsApp) → **"Draft with AI"** → editable textarea (never auto-sends; footer says so).
- **Expected:** AI reasons read naturally; scores persist; nothing is ever sent automatically.

### 4.3 CRM — Opportunities — `/opportunities`
- [ ] Kanban board: 5 columns (Qualification → Proposal → Negotiation → ClosedWon → ClosedLost); cards show account, amount, probability.
- [ ] Stat cards: Gross Pipeline, Weighted Pipeline, Won This Month.
- [ ] `FilterBar` (status + search "Search deal name…"), no pagination (whole board renders).
- [ ] **"Advance →"** button on open-stage cards → moves to next stage, probability bumps (20/50/75/100%). Not shown on Closed cards; no UI path to ClosedLost.

### 4.4 CRM — Accounts — `/accounts`
- [ ] Stat cards: Total Accounts, GST Registered, Cities.
- [ ] **"+ New Account"** expands inline form: Name* / Industry / GSTIN / City / State / Email → **"Create account"** / "Cancel".
- [ ] `FilterBar` search "Search by name, GSTIN, or city…"; paginated. Table: Name, Industry, Location, GSTIN, Contacts (no row actions/detail page).

### 4.5 CRM — Quotations — `/quotations`
- [ ] Read-only list. Stat cards: Total Quotes, Sent/Pending (+ draft hint), Accepted, Total Value.
- [ ] Table: Number, Account, Status badge (Draft/Sent/Accepted/Rejected), Subtotal, Tax, Grand Total.
- **Expected:** no create/edit/convert-to-invoice controls exist in this build — confirm this is the current (limited) behavior, not a bug.

### 4.6 CRM — Tickets — `/tickets`
- [ ] Stat cards: Open Tickets, Urgent, SLA Breached.
- [ ] `FilterBar` (status: Open/InProgress/Resolved/Closed + search "Search subject…"); sortable Newest/Priority/SLA Due; paginated.
- [ ] Priority badge (Low/Medium/High/Urgent), SLA-breached rows shown in red.
- [ ] Row status `<select>` (Open/InProgress/Resolved/Closed) → persists.

### 4.7 People — Employees — `/hr/employees`, `/hr/employees/[id]`
- [ ] Stat cards: Headcount, Departments (breakdown hint), Monthly Payroll Cost.
- [ ] **"+ Add employee"** toggle → form: Name*, Email, Department, Designation, Annual CTC (₹)* → **"Create + salary structure"** / "Cancel".
- [ ] `FilterBar` search "Search by name, code, email, or department…"; sortable name/ctc/DOJ; paginated.
- [ ] Open an employee → stat cards (Code/DOJ/CTC/Monthly Gross); Salary Structure card (Gross/Basic/HRA/Allowances) + green **"Labour-Code compliant: basic ≥ 50% gross"** badge; Recent Attendance (last 10, distance flagged red if >100m); Recent Leaves (last 10).
- **Expected:** new employee auto-gets a compliant salary structure (basic = 50% of gross).

### 4.8 People — Leave & Attendance — `/hr/leave`
- [ ] Stat cards: Pending Leaves, On Leave Today, Present Today.
- [ ] Leave table: Employee/Type/From–To/Days/Status; pending rows show **"Approve"** / **"Reject"** buttons → status updates immediately.
- [ ] Attendance table: Employee/Status/Check-in/Geofence Distance — >100m shown red with a dot indicator.

### 4.9 People — Payroll — `/payroll`, `/payroll/[id]` (compliance-critical)
- [ ] Stat cards: Latest Gross, Latest Net Payout, Statutory Total (PF+ESI+TDS), Salary Structures count.
- [ ] Header button **"▶ Run payroll for {NextMonth Year}"** → creates a Draft run with one payslip per salary structure; disabled/warned if 0 salary structures exist.
- [ ] Per-run action: Draft → **"🔒 Lock"** (posts a balanced GL journal: Dr Salaries Expense, Cr Salaries Payable + statutory dues — idempotency-guarded); Locked → **"✓ Mark paid"** (status only, no GL post); Paid → static "Paid".
- [ ] Open a run → "Payslip Register — {Month Year}": per-employee Gross/Basic/PF(EE+ER)/ESI/PT/TDS/Net Pay + **"View slip"/"Hide"** toggle expands earnings/deductions breakdown; totals row.
- **Expected:** PF = 12% of basic (capped ₹15k basis), ESI = 0.75% if gross ≤ ₹21k. *(RBAC net-pay masking is verified in flow (g) below.)*

### 4.10 Operations — Inventory — `/inventory`, `/inventory/[id]`
- [ ] Stat cards: Total SKUs, Stock Value, Below Reorder count; below-reorder rows highlighted amber.
- [ ] **Adjust stock** form: Item select, **"+ In"/"− Out"** toggle, Qty*, Reason → **"Record"** → on-hand updates, a `StockMove` is logged.
- [ ] Open an item → stat cards (On-hand/Reorder/Cost/Stock Value) + stock-move ledger (Date/Type/±Qty/Ref).

### 4.11 Operations — Purchase Orders — `/inventory/purchase-orders`
- [ ] Stat cards: Open POs (Draft/Sent), Total PO Value.
- [ ] **Create purchase order** form: Vendor*, Total (₹) → **"Raise PO"** → new `PO-0001`-style Draft row.
- [ ] Row button **"Receive"** (shown unless already Received) → status flips straight to **Received**.
- **Known boundary:** Receiving is a **mock** — it does NOT create inbound stock moves or bump item on-hand (no line items on this PO model). Confirm this is expected, not a bug.

### 4.12 Money — GST Invoices — `/finance/invoices`, `/finance/invoices/[id]` (biggest differentiator)
- [ ] Stat cards: Total Invoiced, Tax Collected, Receivables, e-Invoiced count.
- [ ] Side panels: **GSTR-1 Draft** (grouped by tax-rate slab, "Auto-prepared from finalized invoices") + **Compliance** (GSTIN, AATO, e-invoicing mandate badge).
- [ ] `FilterBar` (status: Draft/Finalized/Paid + search "Search invoice number…"), paginated.
- [ ] **"+ New GST Invoice"** → Bill to (account) + Product (GST rate/HSN auto-filled) + Qty → live CGST/SGST (intra-state) vs IGST (inter-state) preview → **"Create Invoice"**.
- [ ] Draft row → **"Finalize"** → status → Finalized; if AATO > ₹5cr (B2B) generates IRN + Ack No (mock unless `IRP_*` env set) + e-way bill no. if grand total > ₹50k; posts a GL journal.
- [ ] Finalized row → **"Mark paid"** (status only) or **"Record payment"** (Method + Reference → **"Save"**, creates a `Payment` + `RCPT-<year>-<n>` receipt, posts GL, flips to Paid).
- [ ] Open an invoice → tax-invoice layout: seller/buyer GSTIN blocks, e-Invoice(IRP) box with IRN/Ack/e-way + **Sandbox/Mock** or **Live (IRP)** badge, Payments table with **"View receipt"** link (→ `/print/invoice/[id]`), line items (HSN per line), CGST/SGST/IGST totals.

### 4.13 Money — Vendor Bills (AP) — `/finance/bills`
- [ ] Stat cards: Total Payables, Overdue, Paid This Month. `FilterBar` (Draft/Approved/Paid + vendor/bill-number search), paginated.
- [ ] **"+ New bill"** → Vendor*, Bill number*, GSTIN, Due date, Description/Qty/Unit price/Tax rate% → **"Create bill"** → Draft, source=manual.
- [ ] Draft row → **"Approve"** → status → Approved; posts Dr Operating Expense / Cr Accounts Payable (GL errors swallowed, never block the status change).
- [ ] Approved row → **"Pay"** → status → Paid; posts Dr Accounts Payable / Cr Bank.
- [ ] Paid row → static **"✓ Paid"**.
- **Expected:** overdue unpaid bills show due date in red/bold.

### 4.14 Money — Scan Bill (OCR) — `/finance/ocr`
- [ ] Banner: green **"Vision OCR: {model}"** if `OCR_MODEL`+`LLM_BASE_URL`+`LLM_API_KEY` all set, else amber **"Manual mode — set OCR_MODEL in .env for AI extraction"**.
- [ ] Upload an image (`accept="image/*"`) → "Extracting fields from the image…" → editable form pre-filled: Vendor*, GSTIN, Bill number*, Date, Subtotal, Tax, Total, line items (+ **"+ Add line"**/**"✕"** remove) + **"AI-extracted"**/**"Manual mode"** badge.
- [ ] **"Save as vendor bill"** → creates a Draft `VendorBill`, source=ocr, redirects to `/finance/bills` (does **not** post to GL — posting happens on Approve there).
- [ ] **"Scan another bill"** resets the form.
- **Expected:** if not configured, fields come back empty with a note to fill manually — this is by design, not an error.

### 4.15 Money — Bank Reconciliation — `/finance/bank`
- [ ] Stat cards: Total Transactions, Reconciled, Unreconciled.
- [ ] **"+ Import bank statement"** → paste-CSV textarea (columns `date, description, amount, direction`) → **"Import"** → "Imported {n} transaction(s)." (no dedup — re-importing duplicates rows).
- [ ] Unreconciled credit row with a same-amount Payment within ±7 days shows a suggested match ("Match: {receiptNo} · {amount}") + **"Reconcile"** button → marks reconciled, `matchedType="payment"`.
- [ ] Any unreconciled row → **"Mark reconciled"** (manual match, no suggestion needed).
- [ ] Reconciled row → **"Undo"** → clears reconciled state.

### 4.16 Money — Ledger & Journals — `/finance/ledger`, `/new`, `/[id]`, `/account/[code]`
- [ ] Chart of Accounts table (Code/Name/Type/Balance), each account links to its ledger.
- [ ] **"+ New account"** → Code/Type(select)/Name → **"Create account"** (duplicate code → inline error "Account code X already exists.").
- [ ] Recent journal entries (last 20): Date/Narration/Reference/Source/Amount, linking to detail.
- [ ] **"+ New journal entry"** → Narration*, Reference, ≥2 dynamic lines (Account select + Debit/Credit, mutually exclusive per row) + **"+ Add line"** → live Dr/Cr/Difference box; **"Post journal entry"** disabled unless balanced and non-zero.
- [ ] Try an unbalanced journal (bypass the disabled state is not possible client-side, but confirm the summary box shows the mismatch) — server-side `postJournal` throws `"Journal not balanced: Dr X ≠ Cr Y"` if it ever reaches the server unbalanced.
- [ ] Journal detail page (`[id]`) — read-only: narration/date/reference/source + line table + totals footer.
- [ ] Account ledger page (`account/[code]`) — read-only, oldest-first, running balance per line, links back to each journal entry.

### 4.17 Money — Financial Reports — `/finance/reports`
- [ ] Date-range filter: **"From"** / **"To"** date inputs → **"Apply"** (+ **"Clear"** link when active).
- [ ] Stat cards: Total Income, Total Expense, Net Profit/Loss, Total Assets.
- [ ] **Trial Balance** — Code/Account/Type/Debit/Credit + totals row + **"✓ In balance"**/**"✗ Out of balance"** badge.
- [ ] **Profit & Loss** — Income rows then Expense rows, "Net Profit"/"Net Loss" banner (green ≥0, red <0).
- [ ] **Balance Sheet** — Assets/Liabilities/Equity + net-profit-rolled-into-equity line + **"✓ Assets = Liabilities + Equity"**/**"✗ …"** badge.
- [ ] Zero-journal tenant → `Empty` hint linking to `/finance/ledger`.

### 4.18 Setup — Admin & Users — `/admin`
- [ ] Stat cards: Users (+ active hint), Roles, Plan (+ seats hint).
- [ ] **Invite user**: Name / Email / Role(select, default "No role (unrestricted)") → **"Invite user"** → green box "Invite created — no email provider configured yet." + on-screen accept-link (`/accept-invite?token=…`).
- [ ] Per-user row: role `<select>` (changes immediately, no save button; disabled for CEO's own row) + **"Deactivate"/"Activate"** toggle.
- [ ] **Roles** section: **"Edit permissions"** → JSON textarea → **"Save permissions"**; **"+ New role"** → Name → **"Create role"**.
- [ ] **Company settings**: Company name / GSTIN / Annual aggregate turnover (₹) → **"Save company settings"**.
- [ ] **Single Sign-On** card: Configured/Not-configured badge + callback URL to register in Google Cloud Console.
- [ ] **Audit log**: last 50 events (Type/Entity/Actor/Time).
- [ ] **DPDP — Export my data**: **"⬇ Export my data"** → downloads a JSON dump (users/CRM/HR/invoices).
- [ ] **DPDP — Delete organization** (CEO only): **"Delete organization"** → confirm panel requires typing the exact org name → **"Permanently delete"** → cascading delete, redirects to `/login`.

### 4.19 Setup — Billing — `/billing`
- [ ] Amber banner if Razorpay not configured: "running in manual mode."
- [ ] Stat cards: Current Plan, Seats Used ({used}/{seats}), Monthly Price, Payment Mode.
- [ ] Seat usage progress bar (green/amber/red by capacity).
- [ ] 3 plan cards (Free 5 seats / Growth 25 seats ₹2,499 / Scale 100 seats ₹7,999) — current plan ring-highlighted + "Active" badge; **"Upgrade to {plan}"** or **"Switch to {plan}"** buttons.
- **Expected:** manual mode applies the plan change immediately; Razorpay-configured mode creates an order and waits for a verified webhook (not built) before flipping the plan.

### 4.20 Setup — Notifications — `/notifications`
- [ ] **"Send test notification"** → creates a real "Test notification" entry.
- [ ] **"Mark all read"** → clears the unread bell badge.
- [ ] Type badges: info(slate)/alert(red)/reminder(amber); unread rows tinted; **"View →"** link when `link` is set.

### 4.21 Setup — Settings — `/settings` (profile, password, 2FA)
- [ ] Profile card: Name/Email/Role (read-only).
- [ ] Workspace card: Organization/Plan (read-only).
- [ ] **Change password**: Current password / New password → **"Change password"**.
- [ ] **Enable 2FA**:
  - [ ] Click **"Enable 2FA"** → inline **QR code SVG** + manual secret key shown.
  - [ ] Scan with an authenticator app (or copy the secret) → enter the 6-digit code → **"Verify & enable"**.
  - [ ] Success view shows **10 one-time recovery codes** — note them.
  - [ ] Badge flips to **Enabled** (green).
- [ ] **Disable 2FA** (once enabled): enter current password → **"Disable 2FA"**.
- **Expected:** after enabling 2FA, the *next* login for that user routes through `/login/2fa` (see flow (b) below).

### 4.22 Setup — Import / Export — `/import`
- [ ] Three import cards (Leads / Employees / Items): paste or upload CSV → **"Preview & Import"** (skips invalid rows, reports counts) + **"⬇ Sample CSV"** download per type.
- [ ] Export row: **"🎯 Export Leads"**, **"👥 Export Employees"**, **"📦 Export Items (Inventory)"**, **"🇮🇳 Export Invoices"** → each hits `GET /api/export/{model}`, downloads a CSV.

### 4.23 Setup — Documents — `/documents`
- [ ] Upload widget: Entity tag (default "General") + File → **"Upload"** → creates an `Attachment`, stored under `data/uploads/<tenantId>/`.
- [ ] Table: Filename/Entity/Size/Uploaded/**"Download"** (opens `/api/file/[id]` in a new tab; tenant-scoped, 404s across tenants).

### 4.24 Global Search — `/search`
- [ ] Type <2 chars → hint "Type at least 2 characters to search."
- [ ] Type a real query (e.g. an account name) → grouped results by module (Lead/Opportunity/Account/Contact/Invoice/Employee/Ticket/Item order), each a clickable row to its detail/list page.
- [ ] No matches → `Empty` "No results for "…"".

### 4.25 Intelligence — AI Console — `/ai`
- [ ] Banner: "Connected to {provider}" (green) or "No LLM configured… using deterministic local heuristics" (grey) — either way, features work.
- [ ] **Lead Scoring** section: **"✨ Re-score all"** (shows unscored count) → all leads scored; Hot(≥70)/Cold(<40)/Scored counts update.
- [ ] **Follow-up drafting** card: pick a lead + channel → **"Draft with AI"** → editable draft (never auto-sends).
- [ ] **Call summarizer** card: paste a transcript → **"Summarize call"** → 2-bullet + "Next step:" summary → **"Save as Activity"** creates an Activity record.

### 4.26 Intelligence — Ask Orbit (Copilot) — `/copilot`
- [ ] AI status banner (Live/Local, same pattern as AI Console); note text: "never touches the database directly… no raw SQL is ever generated."
- [ ] Click a suggestion chip or type a question (placeholder "Ask about revenue, cash, pipeline, leads, stock…") → **"Ask"** → answer + a grey **intent** tag underneath.
- [ ] Try each: "What's my cash position?", "Show pipeline by stage", "How many open leads?", "What revenue have we won?", "How much is outstanding in receivables?", "Show my top opportunities", "Leads by source?", "What's my headcount?", "What's the payroll liability?", "Which items are low on stock?", "How much GST have we collected?", "How many open tickets?"
- **Expected:** each answer matches the corresponding module's live numbers; chat history is client-only (lost on refresh).

### 4.27 Setup — Integrations — `/integrations`
- [ ] Stat cards: Connection Mode (Configured/Dev mode), Sources (4), Captured Leads.
- [ ] One card per source (IndiaMART/JustDial/TradeIndia/Website): webhook URL (`/api/marketplace/{source}`) + seller-panel setup notes.
- [ ] **"⚡ Simulate incoming lead"** on any card → creates + auto-scores a new lead; open `/leads` to confirm it landed there.
- [ ] "Recently captured" table lists the last 10 marketplace-sourced leads with score.
- [ ] Optional manual test:
  ```bash
  curl -X POST http://localhost:3000/api/marketplace/IndiaMART \
    -H "Content-Type: application/json" \
    -d '{"SENDER_NAME":"Test","SENDER_MOBILE":"9999999999","SENDER_COMPANY":"Test Co","QUERY_PRODUCT_NAME":"Router"}'
  ```
  → `{ok:true, leadId:...}`.

---

## 5. End-to-end flows

### (a) Onboarding — signup → new tenant → dashboard
1. [ ] Go to `/signup`. Fill Organization name, Your name, Email, Password (≥8 chars).
2. [ ] Click **"Create workspace →"** — creates a new `Tenant` + CEO `User` (`signup()` in `lib/auth.ts`).
3. [ ] Redirects straight to `/dashboard` — cockpit renders with all-zero stats (brand-new tenant, no seed data).
4. [ ] Confirm `/settings` shows the new org name and "CEO" role badge.

### (b) 2FA enrollment → sign out → login routes through `/login/2fa`
1. [ ] Log in as `ceo@demo.orbit`. Go to `/settings` → Two-factor authentication card.
2. [ ] Click **"Enable 2FA"** → QR code renders.
3. [ ] Scan the QR (or copy the secret manually) into an authenticator app; enter the live 6-digit code → **"Verify & enable"**.
4. [ ] Save the 10 recovery codes shown.
5. [ ] Sign out (header **"Sign out"** button).
6. [ ] Log back in with the same email/password on `/login` → redirected to `/login/2fa` instead of the dashboard.
7. [ ] Enter the current authenticator code (or a recovery code) → **"Verify →"** → lands on `/dashboard`.
8. [ ] (Cleanup) `/settings` → enter current password → **"Disable 2FA"** to restore normal login for later tests.

### (c) Order-to-cash — lead → AI score → opportunity → quotation → GST invoice → finalize (IRN) → payment → Financial Reports/GL
1. [ ] `/leads` → pick a New lead → **"✨ Score with AI"** → score + reason appear.
2. [ ] Advance its status via the dropdown to Qualified → Converted.
3. [ ] `/opportunities` → find/advance the linked deal through Qualification → Proposal → Negotiation → **ClosedWon** via repeated **"Advance →"** clicks.
4. [ ] `/quotations` → confirm a quotation tied to that opportunity/account is visible (read-only in this build — quotations here are seed/system-created, not user-created).
5. [ ] `/finance/invoices` → **"+ New GST Invoice"** → pick the account + a product + qty → **"Create Invoice"** (Draft).
6. [ ] Click **"Finalize"** on the Draft invoice → status → Finalized; if AATO > ₹5cr, an IRN/Ack No (and e-way bill if >₹50k) appear — check the **Sandbox/Mock** vs **Live (IRP)** badge on the detail page.
7. [ ] Click **"Record payment"** → choose Method + Reference → **"Save"** → status → Paid, a `RCPT-<year>-<n>` receipt appears; **"View receipt"** opens `/print/invoice/[id]`.
8. [ ] `/finance/reports` → confirm Trial Balance / P&L / Balance Sheet reflect the new revenue + tax + cash movement; `/finance/ledger` shows the posted journal entries (invoice finalize + payment).
9. [ ] `/dashboard` → Cash Collected / Receivables tiles updated; Live activity feed shows the new events (`lead.scored`, invoice/payment events).

### (d) Procure-to-pay — Scan Bill OCR → vendor bill → approve (posts GL) → pay
1. [ ] `/finance/ocr` → upload a bill image → review the extracted/blank fields → **"Save as vendor bill"** → redirects to `/finance/bills`, new row status **Draft**, source **ocr**.
2. [ ] On `/finance/bills`, click **"Approve"** on that bill → status → **Approved**; check `/finance/ledger` for a new journal (Dr Operating Expense / Cr Accounts Payable).
3. [ ] Click **"Pay"** → status → **Paid**; check `/finance/ledger` for a second journal (Dr Accounts Payable / Cr Bank).
4. [ ] `/finance/reports` → confirm the expense shows in P&L and payables/cash moved on the Balance Sheet.

### (e) Payroll — run → lock (posts GL) → payslip PDF
1. [ ] `/payroll` → click **"▶ Run payroll for {NextMonth Year}"** → new Draft run with a payslip per salary structure.
2. [ ] Click **"🔒 Lock"** on the Draft run → status → Locked; verify `/finance/ledger` shows a new journal (Dr Salaries Expense, Cr Salaries Payable + statutory dues) with reference `Payroll {month}/{year}`.
3. [ ] Click **"✓ Mark paid"** → status → Paid (no additional GL post).
4. [ ] Open the run → a payslip row → **"View slip"** → confirm breakdown; then visit `/print/payslip/[id]` (use the payslip's id) and click **"Print / Save PDF"**.

### (f) Bank reconciliation — import statement → reconcile against a payment
1. [ ] First record at least one invoice payment (flow (c) step 7) so a matching `Payment` row exists.
2. [ ] `/finance/bank` → **"+ Import bank statement"** → paste a CSV row with `date, description, amount, direction=credit` matching that payment's amount within ±7 days → **"Import"**.
3. [ ] Confirm the new unreconciled row shows a suggested match ("Match: {receiptNo} · {amount}") → click **"Reconcile"** → row flips to **Reconciled · payment**.
4. [ ] Import an unrelated transaction and click **"Mark reconciled"** instead → flips to **Reconciled · manual**.
5. [ ] Click **"Undo"** on either → returns to Unreconciled.

### (g) RBAC — field-level masking
1. [ ] Sign out; log in as `sales@demo.orbit` / `orbit123`.
2. [ ] Open `/payroll` → any run → confirm the **Net Pay** column/total shows **`•••`** instead of a rupee figure (CEO login shows the real number on the same page).
3. [ ] Confirm CRM modules (Leads/Opportunities/Accounts/Tickets) still work normally for the Sales user.

---

## 6. What proves what

| Module | Route(s) | Proven by |
|---|---|---|
| CEO Cockpit | `/dashboard` | §4.1, flow (c) step 9 |
| Leads + AI scoring | `/leads` | §4.2, flow (c) step 1 |
| Opportunities | `/opportunities` | §4.3, flow (c) step 3 |
| Accounts / Quotations / Tickets | `/accounts` `/quotations` `/tickets` | §4.4–4.6 |
| HR — Employees / Leave | `/hr/employees` `/hr/leave` | §4.7–4.8 |
| Payroll (statutory + GL) | `/payroll` | §4.9, flow (e) |
| Inventory / Purchase Orders | `/inventory` `/inventory/purchase-orders` | §4.10–4.11 |
| GST Invoices + e-invoice + GL | `/finance/invoices` | §4.12, flow (c) |
| Vendor Bills (AP) + GL | `/finance/bills` | §4.13, flow (d) |
| Scan Bill (OCR) | `/finance/ocr` | §4.14, flow (d) step 1 |
| Bank Reconciliation | `/finance/bank` | §4.15, flow (f) |
| Ledger & Journals | `/finance/ledger` | §4.16, flows (c)/(d)/(e) |
| Financial Reports | `/finance/reports` | §4.17, flows (c)/(d) |
| Admin & Users / DPDP | `/admin` | §4.18 |
| Billing | `/billing` | §4.19 |
| Notifications | `/notifications` | §4.20 |
| Settings + 2FA | `/settings` | §4.21, flow (b) |
| Import / Export | `/import` | §4.22 |
| Documents | `/documents` | §4.23 |
| Global Search | `/search` | §4.24 |
| AI Console | `/ai` | §4.25 |
| Ask Orbit Copilot | `/copilot` | §4.26 |
| Integrations (lead capture) | `/integrations` | §4.27 |
| Onboarding | `/signup` | flow (a) |
| RBAC (field masking) | `/payroll` (Sales login) | flow (g) |
| Platform health | `/api/health` | `GET /api/health` → `{status:"ok",db:true}` |

---

## 7. Known mock/manual boundaries (by design, not bugs)

- **e-Invoicing (IRN / e-way bill)** — real NIC v1.1 JSON schema built, but IRN/Ack/e-way numbers are a **deterministic sandbox mock** until `IRP_*` credentials are set (`.env.irp.example`). Invoice detail page badge flips **Sandbox/Mock → Live (IRP)** once configured.
- **Razorpay** — order creation hits the real Orders API once `RAZORPAY_KEY_ID`/`SECRET` are set; without them, `/billing` shows an amber "running in manual mode" banner and plan upgrades apply immediately (no payment collected). The verified-webhook path that would flip a plan automatically is documented but **not built**.
- **Email / SMS / WhatsApp send** — never actually sent. Invite links and password-reset links are shown directly on-screen instead of emailed. Follow-up drafts (Leads/AI Console) are always editable text, human-approved, never auto-sent.
- **SSO (Google)** — real OAuth code-exchange implemented, gated on `GOOGLE_CLIENT_ID`+`GOOGLE_CLIENT_SECRET`; when unset, `/login`'s "Sign in with Google" redirects to `/login?sso=unconfigured`. No JIT auto-provisioning — an unmatched Google email always fails with `?sso=nouser`.
- **OCR (Scan Bill)** — **live** vision extraction when `LLM_BASE_URL` + `LLM_API_KEY` + `OCR_MODEL` are all set (banner shows the model name); otherwise runs in **manual/stub mode** with empty fields and a "fill manually" note — this is the expected fallback, not an error.
- **Marketplace webhook auth** — open/unauthenticated ("dev mode") until `MARKETPLACE_WEBHOOK_KEY` is set; tenant resolution is a demo stub (always the first tenant in the DB), not per-key routing.
- **Purchase Order receipt** — `/inventory/purchase-orders` **"Receive"** flips status only; it does **not** create stock moves or change item on-hand (no line items on this PO model) — a known, intentional simplification.
- **Document storage** — local filesystem only (`data/uploads/<tenantId>/`); fine for this dev/VPS deployment, would need S3/object storage for a serverless host.
- **AI (scoring, drafting, copilot, OCR vision)** overall — everything **degrades to a local deterministic heuristic** when no LLM key is configured; check the **✨ AI badge** in the header (or the banner on `/ai` and `/copilot`) to know whether a given result came from a live model or the local fallback — both are fully functional, just different fidelity.
