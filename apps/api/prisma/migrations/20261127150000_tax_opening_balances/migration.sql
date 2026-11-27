-- Tax opening balances for a mid-year go-live (additive: new table only; no existing data changed).
CREATE TABLE "employee_tax_opening_balances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "taxable_gross" DECIMAL(14,2) NOT NULL,
    "tds_deducted" DECIMAL(14,2) NOT NULL,
    "professional_tax" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "entered_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_tax_opening_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_tax_opening_balances_employee_id_financial_year_key" ON "employee_tax_opening_balances"("employee_id", "financial_year");
CREATE INDEX "employee_tax_opening_balances_company_id_financial_year_idx" ON "employee_tax_opening_balances"("company_id", "financial_year");

ALTER TABLE "employee_tax_opening_balances" ADD CONSTRAINT "employee_tax_opening_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
