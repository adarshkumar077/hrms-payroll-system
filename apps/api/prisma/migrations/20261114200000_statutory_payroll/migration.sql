-- T9: Indian statutory payroll engine (TDS, PF, ESI, PT rule tables).

-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('NEW', 'OLD');

-- AlterTable: employee tax regime, old-regime declared deductions, PT state
ALTER TABLE "employees"
  ADD COLUMN "tax_regime" "TaxRegime" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "old_regime_declared_deductions" DECIMAL(14,2),
  ADD COLUMN "pt_state" TEXT;

-- AlterTable: employer contributions + statutory breakdown on payroll lines
ALTER TABLE "payroll_lines"
  ADD COLUMN "employer_pf_eps" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "employer_pf_epf" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "employer_esi" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN "statutory_json" JSONB;

-- CreateTable
CREATE TABLE "statutory_rule_sets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "financial_year" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "verify_with_ca" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statutory_rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "statutory_rule_sets_company_id_financial_year_key" ON "statutory_rule_sets"("company_id", "financial_year");

-- AddForeignKey
ALTER TABLE "statutory_rule_sets" ADD CONSTRAINT "statutory_rule_sets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
