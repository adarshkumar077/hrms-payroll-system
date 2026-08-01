# Phase 5 — Money (Payroll, CTC, ESD, Loans, Reimbursements)

## Status: COMPLETE

| Module | Item | Status |
|---|---|---|
| 10 | Salary components, templates, CTC assign, revisions | Done |
| 9 | Payroll generate → review → approve/lock | Done |
| 9 | LOP, incentive, ESD, loan EMI, reimbursements in run | Done |
| 11 | ESD ledger + balance sheet | Done |
| 12 | Loan/advance request, EMI schedule, payroll recovery | Done |
| 13 | Reimbursements (HR + CEO) → next payroll | Done |
| UI | Web payroll wizard, payslips, loans, expenses, ESD | Done |
| UI | Mobile payslips / loans / expenses | Done |

## Verified

- Migration `20260713120000_phase5_money` applied
- 10 salary components auto-seeded
- CTC assigned for EITF001 (Asha): annual 600000
- July 2026 payroll generated → REVIEW → **LOCKED**
- Sample line: gross 47000, deductions 3806, **netPay 43194**

## Try it

1. Add/ensure an employee exists (Directory), then **Payroll → Assign CTC**
2. (Optional) Employee: request loan + reimbursement; CEO/HR approve
3. **Payroll → Generate** for year/month → review lines → **Approve & lock**
4. Employee: **My Payslips**; Finance: **ESD Sheet**

- CEO: `ceo@eitf.local` / `ChangeMe@123`
- Employee (if seeded): `asha@eitf.local` / `Temp@1234`

## API highlights

- `POST /salary/structures` · `GET /salary/components`
- `POST /payroll/generate` · `POST /payroll/runs/:id/approve`
- `GET /payroll/my-payslips`
- `POST /loans` · `POST /loans/:id/review`
- `POST /reimbursements` · `POST /reimbursements/:id/review`
- `GET /esd/sheet`

## Next

**Phase 6 — Lifecycle:** Onboarding (15), Assets (16), Exit & F&F (21)
