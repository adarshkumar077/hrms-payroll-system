# Money fields: Float vs Decimal classification

Task T7 (audit finding C4). Before this change `apps/api/prisma/schema.prisma` had 55 `Float`
(double precision) columns and no `Decimal` columns. Every **money** column is now
`Decimal @db.Decimal(14,2)`, which holds INR with 2-decimal paise, up to ₹999,999,999,999.99.
**Non-money** columns stay `Float`.

- Converted to `Decimal(14,2)`: **26**
- Left as `Float`: **29**
- Migration: `apps/api/prisma/migrations/20261114180000_money_decimal/migration.sql`
  (`ALTER COLUMN … TYPE DECIMAL(14,2) USING ROUND(col::numeric, 2)`)

## Rounding rule

There is one rule, implemented in `apps/api/src/common/money.ts` (built on `Prisma.Decimal`, which is decimal.js):

> Compute in full decimal precision. Round **HALF_UP** (half away from zero) to **2dp** at each
> stored or displayed line item. Totals are exact sums of the already-rounded lines, so
> `gross − deductions = net` holds exactly, to the paisa.

- Ratios such as the per-day rate are not rounded before they are multiplied. For example, LOP is
  `basic × lopDays ÷ calendarDays`, rounded once (see `calcProratedAmount`).
- API responses: a global `MoneySerializeInterceptor` converts every `Prisma.Decimal` to a JSON
  number with 2dp, so the web client still receives numbers. Report and export rows
  (`resolveReport`, `resolveBalance`, `buildExport`) and attendance audit snapshots are serialized
  the same way.
- JSON columns such as `payroll_lines.earnings_json`, `deductions_json` and `fnf_settlements.lines_json`
  keep their 2dp JS numbers. Each number is produced by `M.toNumber` from a Decimal.

## MONEY: converted to `Decimal(14,2)`

| # | Model (table) | Field (column) | Nullable | Meaning |
|---|---|---|---|---|
| 1 | AttendanceRecord (`attendance_records`) | todaysEarnings (`todays_earnings`) | yes | Day's earning from daily salary |
| 2 | SalaryTemplateLine (`salary_template_lines`) | amount (`amount`) | no, default 0 | Template component amount |
| 3 | EmployeeSalaryStructure (`employee_salary_structures`) | ctcAnnual (`ctc_annual`) | no | Annual CTC |
| 4 | EmployeeSalaryLine (`employee_salary_lines`) | amount (`amount`) | no | Structure component amount |
| 5 | EmployeePayrollConfig (`employee_payroll_configs`) | grossMonthly (`gross_monthly`) | no | Monthly gross |
| 6 | EmployeePayrollConfig | dailySalary (`daily_salary`) | yes | Stored per-day salary (display) |
| 7 | EmployeePayrollConfig | hourlySalary (`hourly_salary`) | yes | Hourly salary (₹/hour) |
| 8 | SalaryRevision (`salary_revisions`) | previousCtc (`previous_ctc`) | yes | CTC before revision |
| 9 | SalaryRevision | newCtc (`new_ctc`) | no | CTC after revision |
| 10 | PayrollLine (`payroll_lines`) | grossEarnings (`gross_earnings`) | no | Payslip gross |
| 11 | PayrollLine | totalDeductions (`total_deductions`) | no | Payslip deductions |
| 12 | PayrollLine | netPay (`net_pay`) | no | Payslip net |
| 13 | PayrollLine | paidAmount (`paid_amount`) | yes | Amount marked paid |
| 14 | EsdLedgerEntry (`esd_ledger`) | amount (`amount`) | no | Security-deposit movement |
| 15 | EsdLedgerEntry | balanceAfter (`balance_after`) | no | Running deposit balance |
| 16 | LoanAdvance (`loan_advances`) | amount (`amount`) | no | Principal |
| 17 | LoanAdvance | emiAmount (`emi_amount`) | no | EMI |
| 18 | LoanAdvance | outstanding (`outstanding`) | no | Outstanding balance |
| 19 | LoanEmiSchedule (`loan_emi_schedules`) | amount (`amount`) | no | Installment |
| 20 | LoanRecoveryEntry (`loan_recovery_entries`) | amount (`amount`) | no | Amount recovered via payroll |
| 21 | ReimbursementClaim (`reimbursement_claims`) | amount (`amount`) | no | Claim amount |
| 22 | Asset (`assets`) | purchaseCost (`purchase_cost`) | yes | Purchase cost |
| 23 | AssetDamageCharge (`asset_damage_charges`) | amount (`amount`) | no | Damage charge |
| 24 | FnfSettlement (`fnf_settlements`) | grossCredits (`gross_credits`) | no | F&F credits |
| 25 | FnfSettlement | grossDebits (`gross_debits`) | no | F&F debits |
| 26 | FnfSettlement | netPayable (`net_payable`) | no | F&F net |

## NON-MONEY: left as `Float`

| # | Model | Field | Kind | Why it stays Float |
|---|---|---|---|---|
| 1 | AttendanceRecord | latitude | GPS | Coordinate |
| 2 | AttendanceRecord | longitude | GPS | Coordinate |
| 3 | AttendanceRecord | checkInLatitude | GPS | Coordinate |
| 4 | AttendanceRecord | checkInLongitude | GPS | Coordinate |
| 5 | AttendanceRecord | checkOutLatitude | GPS | Coordinate |
| 6 | AttendanceRecord | checkOutLongitude | GPS | Coordinate |
| 7 | AttendancePunch | latitude | GPS | Coordinate |
| 8 | AttendancePunch | longitude | GPS | Coordinate |
| 9 | AttendancePunch | accuracyM | Distance (m) | GPS accuracy radius |
| 10 | LeaveBalance | opening | Days | Leave day count (halves) |
| 11 | LeaveBalance | accrued | Days | Leave day count |
| 12 | LeaveBalance | used | Days | Leave day count |
| 13 | LeaveBalance | encashed | Days | Encashed *days* (money is computed in F&F) |
| 14 | LeaveBalance | carriedForward | Days | Leave day count |
| 15 | LeaveBalance | adjusted | Days | Leave day count |
| 16 | LeaveApplication | days | Days | Leave day count |
| 17 | LeaveLedgerEntry | days | Days | Leave day count |
| 18 | LeaveLedgerEntry | balanceAfter | Days | Leave balance in days (not ₹) |
| 19 | SalaryTemplateLine | percentOfBasic | Percentage | Rate, not an amount |
| 20 | PayrollLine | attendanceDays | Days | Day count |
| 21 | PayrollLine | lopDays | Days | Day count |
| 22 | LoanAdvance | interestRate | Percentage | Annual interest rate |
| 23 | PerformanceGoal | targetValue | Score/target | Generic KPI target, not currency |
| 24 | PerformanceGoal | weight | Multiplier | Goal weight |
| 25 | SelfAssessment | selfRating | Score | Rating |
| 26 | ManagerReview | rating | Score | Rating |
| 27 | Training | durationHrs | Hours | Duration |
| 28 | TrainingAssignment | score | Score | Test score |
| 29 | ResumeScreening | score | Score | Screening score |

Day counts are whole or half days, which binary floating point represents exactly. Percentages and
rates are inputs to Decimal math (`M.percentOf`) and are never stored as money, so moving them to
`Decimal(7,4)` would not change any result.
