# Route verification checklist — EITF HRMS + Orbit CRM

Mark after manual/smoke test against http://localhost:3000 (Orbit proxied from :3010).

## HRMS

| Route | Load | Auth | Notes |
|-------|------|------|-------|
| `/` login | | | |
| `/dashboard` | | | |
| `/employees` | | | |
| `/attendance` | | | |
| `/attendance/mark` | | | |
| `/leave/apply` | | | |
| `/payroll` | | | |
| `/reports` | | | |
| `/settings/company` | | | |
| `/billing` | | | HRMS billing page |
| `/crm` | | | Native HRMS CRM hub |
| `/tickets` | | | HRMS helpdesk (not Orbit) |

## Orbit CRM (via `/orbit/*` + SSO)

| Module | Route | Load |
|--------|-------|------|
| CEO Cockpit | `/orbit/dashboard` | |
| Leads | `/orbit/leads` | |
| Opportunities | `/orbit/opportunities` | |
| Accounts | `/orbit/accounts` | |
| Contacts | `/orbit/contacts` | |
| Quotations | `/orbit/quotations` | |
| Tickets | `/orbit/tickets` | |
| Contracts | `/orbit/contracts` | |
| Installed Base | `/orbit/installed` | |
| Calls | `/orbit/calls` | |
| Messages | `/orbit/messages` | |
| Products | `/orbit/products` | |
| Activities | `/orbit/activities` | |
| Inventory | `/orbit/inventory` | |
| Purchase Orders | `/orbit/inventory/purchase-orders` | |
| GST Invoices | `/orbit/finance/invoices` | |
| Vendor Bills | `/orbit/finance/bills` | |
| OCR | `/orbit/finance/ocr` | |
| Bank | `/orbit/finance/bank` | |
| Ledger | `/orbit/finance/ledger` | |
| Fin Reports | `/orbit/finance/reports` | |
| Copilot | `/orbit/copilot` | |
| AI Console | `/orbit/ai` | |
| Studio | `/orbit/studio` | |
| Integrations | `/orbit/integrations` | |
| Documents | `/orbit/documents` | |
| Import | `/orbit/import` | |
| Admin | `/orbit/admin` | |
| Billing | `/orbit/billing` | |

## SSO

| Step | OK |
|------|----|
| Login once on HRMS | |
| Click CRM → Leads | |
| `/sso/orbit` exchanges token | |
| Lands on Orbit without second password | |
