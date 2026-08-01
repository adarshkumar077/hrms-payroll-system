# Phase 10 — Reporting (Reports & Balance Sheets)

## Status: COMPLETE

| Module | Item | Status |
|---|---|---|
| 22 | Reports (attendance, leave, payroll, employee, department, cost, compliance, audit) | Done |
| 22 | Balance sheets (leave, salary, deposit, loan, advance, overtime, incentive, fnf) | Done |
| 22 | Export CSV / Excel-as-CSV / print-HTML PDF / email stub | Done |
| UI | `/reports` hub + dashboard link | Done |

## API

- `GET /reports/{attendance|leave|payroll|employee|department|cost|compliance|audit}`
- `GET /balance-sheets/{leave|salary|deposit|loan|advance|overtime|incentive|fnf}`
- `GET …/export/{csv|excel|pdf}` · `POST …/export/email` (notification + dispatch log stub)

Query: optional `year`, `month` (and `limit` on audit).

No new Prisma entities — read-only aggregation over existing modules.

## Verified

- CEO login → `GET /reports/employee` (2 rows), `GET /balance-sheets/deposit` (EITF003), CSV export 200, `GET /reports/department`
- Routes registered under `ReportsController`

## Try it

1. Dashboard → **Reports**
2. Open a report or balance sheet → CSV / Print PDF / Email stub
3. Or Swagger `/api/docs` → **reports**

## Next

**Phase 11 — Hardening:** Security & Compliance (26) — see `docs/PHASE11.md` (COMPLETE)
