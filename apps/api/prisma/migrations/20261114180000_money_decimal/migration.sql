-- T7 / audit C4: store all money as exact DECIMAL(14,2) (INR with 2-decimal paise).
-- Existing double precision values are rounded to 2dp during conversion.
-- ROUND(numeric, 2) rounds half away from zero, which matches the app's HALF_UP rule.
-- Column defaults (e.g. DEFAULT 0) and NULL/NOT NULL are preserved by ALTER ... TYPE.
-- Non-money Float columns (GPS, percentages, rates, day counts, scores) are unchanged.
-- See docs/MONEY-FIELDS.md for the full classification.

ALTER TABLE "attendance_records"
  ALTER COLUMN "todays_earnings" TYPE DECIMAL(14,2) USING ROUND("todays_earnings"::numeric, 2);

ALTER TABLE "salary_template_lines"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "employee_salary_structures"
  ALTER COLUMN "ctc_annual" TYPE DECIMAL(14,2) USING ROUND("ctc_annual"::numeric, 2);

ALTER TABLE "employee_salary_lines"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "employee_payroll_configs"
  ALTER COLUMN "gross_monthly" TYPE DECIMAL(14,2) USING ROUND("gross_monthly"::numeric, 2),
  ALTER COLUMN "daily_salary" TYPE DECIMAL(14,2) USING ROUND("daily_salary"::numeric, 2),
  ALTER COLUMN "hourly_salary" TYPE DECIMAL(14,2) USING ROUND("hourly_salary"::numeric, 2);

ALTER TABLE "salary_revisions"
  ALTER COLUMN "previous_ctc" TYPE DECIMAL(14,2) USING ROUND("previous_ctc"::numeric, 2),
  ALTER COLUMN "new_ctc" TYPE DECIMAL(14,2) USING ROUND("new_ctc"::numeric, 2);

ALTER TABLE "payroll_lines"
  ALTER COLUMN "gross_earnings" TYPE DECIMAL(14,2) USING ROUND("gross_earnings"::numeric, 2),
  ALTER COLUMN "total_deductions" TYPE DECIMAL(14,2) USING ROUND("total_deductions"::numeric, 2),
  ALTER COLUMN "net_pay" TYPE DECIMAL(14,2) USING ROUND("net_pay"::numeric, 2),
  ALTER COLUMN "paid_amount" TYPE DECIMAL(14,2) USING ROUND("paid_amount"::numeric, 2);

ALTER TABLE "esd_ledger"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2),
  ALTER COLUMN "balance_after" TYPE DECIMAL(14,2) USING ROUND("balance_after"::numeric, 2);

ALTER TABLE "loan_advances"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2),
  ALTER COLUMN "emi_amount" TYPE DECIMAL(14,2) USING ROUND("emi_amount"::numeric, 2),
  ALTER COLUMN "outstanding" TYPE DECIMAL(14,2) USING ROUND("outstanding"::numeric, 2);

ALTER TABLE "loan_emi_schedules"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "loan_recovery_entries"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "reimbursement_claims"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "assets"
  ALTER COLUMN "purchase_cost" TYPE DECIMAL(14,2) USING ROUND("purchase_cost"::numeric, 2);

ALTER TABLE "asset_damage_charges"
  ALTER COLUMN "amount" TYPE DECIMAL(14,2) USING ROUND("amount"::numeric, 2);

ALTER TABLE "fnf_settlements"
  ALTER COLUMN "gross_credits" TYPE DECIMAL(14,2) USING ROUND("gross_credits"::numeric, 2),
  ALTER COLUMN "gross_debits" TYPE DECIMAL(14,2) USING ROUND("gross_debits"::numeric, 2),
  ALTER COLUMN "net_payable" TYPE DECIMAL(14,2) USING ROUND("net_payable"::numeric, 2);
