CREATE TYPE "SalaryComponentType" AS ENUM ('EARNING', 'DEDUCTION');
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'LOCKED');
CREATE TYPE "LoanAdvanceType" AS ENUM ('ADVANCE', 'LOAN');
CREATE TYPE "LoanAdvanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'CLOSED', 'CANCELLED');
CREATE TYPE "ReimbursementStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
CREATE TYPE "EsdEntryType" AS ENUM ('DEPOSIT', 'INTEREST', 'REFUND', 'ADJUSTMENT');

CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SalaryComponentType" NOT NULL,
    "is_taxable" BOOLEAN NOT NULL DEFAULT true,
    "is_statutory" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "salary_components_company_id_code_key" ON "salary_components"("company_id", "code");
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "salary_templates" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "grade" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "salary_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "salary_templates_company_id_code_key" ON "salary_templates"("company_id", "code");
ALTER TABLE "salary_templates" ADD CONSTRAINT "salary_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "salary_template_lines" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formula" TEXT,
    "percent_of_basic" DOUBLE PRECISION,
    CONSTRAINT "salary_template_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "salary_template_lines_template_id_component_id_key" ON "salary_template_lines"("template_id", "component_id");
ALTER TABLE "salary_template_lines" ADD CONSTRAINT "salary_template_lines_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "salary_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_template_lines" ADD CONSTRAINT "salary_template_lines_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "employee_salary_structures" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "ctc_annual" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_salary_structures_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employee_salary_structures_company_id_employee_id_idx" ON "employee_salary_structures"("company_id", "employee_id");
ALTER TABLE "employee_salary_structures" ADD CONSTRAINT "employee_salary_structures_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_salary_lines" (
    "id" TEXT NOT NULL,
    "structure_id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "employee_salary_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "employee_salary_lines_structure_id_component_id_key" ON "employee_salary_lines"("structure_id", "component_id");
ALTER TABLE "employee_salary_lines" ADD CONSTRAINT "employee_salary_lines_structure_id_fkey" FOREIGN KEY ("structure_id") REFERENCES "employee_salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_salary_lines" ADD CONSTRAINT "employee_salary_lines_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "salary_revisions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "effective_from" DATE NOT NULL,
    "previous_ctc" DOUBLE PRECISION,
    "new_ctc" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "created_by" TEXT,
    "snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "salary_revisions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "salary_revisions_employee_id_effective_from_idx" ON "salary_revisions"("employee_id", "effective_from");
ALTER TABLE "salary_revisions" ADD CONSTRAINT "salary_revisions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "generated_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_runs_company_id_year_month_key" ON "payroll_runs"("company_id", "year", "month");
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "earnings_json" JSONB NOT NULL,
    "deductions_json" JSONB NOT NULL,
    "gross_earnings" DOUBLE PRECISION NOT NULL,
    "total_deductions" DOUBLE PRECISION NOT NULL,
    "net_pay" DOUBLE PRECISION NOT NULL,
    "attendance_days" DOUBLE PRECISION,
    "lop_days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_lines_payroll_run_id_employee_id_key" ON "payroll_lines"("payroll_run_id", "employee_id");
CREATE INDEX "payroll_lines_company_id_employee_id_idx" ON "payroll_lines"("company_id", "employee_id");
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "esd_ledger" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "entry_type" "EsdEntryType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "balance_after" DOUBLE PRECISION NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "esd_ledger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "esd_ledger_employee_id_created_at_idx" ON "esd_ledger"("employee_id", "created_at");
CREATE INDEX "esd_ledger_company_id_idx" ON "esd_ledger"("company_id");
ALTER TABLE "esd_ledger" ADD CONSTRAINT "esd_ledger_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "loan_advances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type" "LoanAdvanceType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "interest_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tenure_months" INTEGER NOT NULL,
    "emi_amount" DOUBLE PRECISION NOT NULL,
    "outstanding" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "LoanAdvanceStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "loan_advances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "loan_advances_company_id_status_idx" ON "loan_advances"("company_id", "status");
CREATE INDEX "loan_advances_employee_id_idx" ON "loan_advances"("employee_id");
ALTER TABLE "loan_advances" ADD CONSTRAINT "loan_advances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_advances" ADD CONSTRAINT "loan_advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "loan_emi_schedules" (
    "id" TEXT NOT NULL,
    "loan_advance_id" TEXT NOT NULL,
    "installment_no" INTEGER NOT NULL,
    "due_year" INTEGER NOT NULL,
    "due_month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loan_emi_schedules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loan_emi_schedules_loan_advance_id_installment_no_key" ON "loan_emi_schedules"("loan_advance_id", "installment_no");
ALTER TABLE "loan_emi_schedules" ADD CONSTRAINT "loan_emi_schedules_loan_advance_id_fkey" FOREIGN KEY ("loan_advance_id") REFERENCES "loan_advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "loan_recovery_entries" (
    "id" TEXT NOT NULL,
    "loan_advance_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payroll_run_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loan_recovery_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "loan_recovery_entries_loan_advance_id_idx" ON "loan_recovery_entries"("loan_advance_id");
ALTER TABLE "loan_recovery_entries" ADD CONSTRAINT "loan_recovery_entries_loan_advance_id_fkey" FOREIGN KEY ("loan_advance_id") REFERENCES "loan_advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "reimbursement_claims" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "receipt_url" TEXT,
    "status" "ReimbursementStatus" NOT NULL DEFAULT 'PENDING',
    "hr_approved_by" TEXT,
    "ceo_approved_by" TEXT,
    "hr_approved_at" TIMESTAMP(3),
    "ceo_approved_at" TIMESTAMP(3),
    "reject_reason" TEXT,
    "paid_in_payroll_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "reimbursement_claims_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reimbursement_claims_company_id_status_idx" ON "reimbursement_claims"("company_id", "status");
CREATE INDEX "reimbursement_claims_employee_id_idx" ON "reimbursement_claims"("employee_id");
ALTER TABLE "reimbursement_claims" ADD CONSTRAINT "reimbursement_claims_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reimbursement_claims" ADD CONSTRAINT "reimbursement_claims_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
