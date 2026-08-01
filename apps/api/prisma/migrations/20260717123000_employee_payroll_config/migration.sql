-- Employee payroll configuration (per-employee salary & deduction settings)
CREATE TABLE IF NOT EXISTS "employee_payroll_configs" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "gross_monthly" DOUBLE PRECISION NOT NULL,
  "daily_salary" DOUBLE PRECISION,
  "hourly_salary" DOUBLE PRECISION,
  "salary_type" TEXT NOT NULL DEFAULT 'MONTHLY',
  "effective_from" DATE NOT NULL,
  "working_days" INTEGER NOT NULL DEFAULT 30,
  "config_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "employee_payroll_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "employee_payroll_configs_employee_id_key"
  ON "employee_payroll_configs"("employee_id");
CREATE INDEX IF NOT EXISTS "employee_payroll_configs_company_id_idx"
  ON "employee_payroll_configs"("company_id");

DO $$ BEGIN
  ALTER TABLE "employee_payroll_configs"
    ADD CONSTRAINT "employee_payroll_configs_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
