CREATE TYPE "LeaveApplicationStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'WITHDRAWN');
CREATE TYPE "LeaveLedgerType" AS ENUM ('ACCRUAL', 'DEBIT', 'CREDIT', 'ENCASHMENT', 'CARRY_FORWARD', 'ADJUSTMENT', 'LAPSE');

CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
    "max_days_per_request" INTEGER,
    "allow_half_day" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leave_types_company_id_code_key" ON "leave_types"("company_id", "code");
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "opening" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "encashed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carried_forward" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjusted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leave_balances_employee_id_leave_type_id_year_key" ON "leave_balances"("employee_id", "leave_type_id", "year");
CREATE INDEX "leave_balances_company_id_year_idx" ON "leave_balances"("company_id", "year");
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "leave_applications" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "is_half_day" BOOLEAN NOT NULL DEFAULT false,
    "half_day_session" TEXT,
    "reason" TEXT,
    "other_type_note" TEXT,
    "attachment_url" TEXT,
    "status" "LeaveApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_applications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leave_applications_company_id_status_idx" ON "leave_applications"("company_id", "status");
CREATE INDEX "leave_applications_employee_id_from_date_to_date_idx" ON "leave_applications"("employee_id", "from_date", "to_date");
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "leave_approval_steps" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_role" TEXT,
    "approver_id" TEXT,
    "status" "LeaveApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_approval_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leave_approval_steps_application_id_step_order_key" ON "leave_approval_steps"("application_id", "step_order");
CREATE INDEX "leave_approval_steps_approver_id_status_idx" ON "leave_approval_steps"("approver_id", "status");
ALTER TABLE "leave_approval_steps" ADD CONSTRAINT "leave_approval_steps_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "leave_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_approval_steps" ADD CONSTRAINT "leave_approval_steps_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "leave_ledger" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "leave_type_id" TEXT NOT NULL,
    "application_id" TEXT,
    "entry_type" "LeaveLedgerType" NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "balance_after" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leave_ledger_employee_id_created_at_idx" ON "leave_ledger"("employee_id", "created_at");
CREATE INDEX "leave_ledger_company_id_leave_type_id_idx" ON "leave_ledger"("company_id", "leave_type_id");
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "leave_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "leave_approval_chains" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'default',
    "steps_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leave_approval_chains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leave_approval_chains_company_id_name_key" ON "leave_approval_chains"("company_id", "name");
