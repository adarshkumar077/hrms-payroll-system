-- Phase 6 Lifecycle

CREATE TYPE "OnboardingStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "OnboardingTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED');
CREATE TYPE "AssetType" AS ENUM ('LAPTOP', 'DESKTOP', 'MOBILE', 'SIM', 'ID_CARD', 'ACCESSORIES', 'OTHER');
CREATE TYPE "AssetStatus" AS ENUM ('AVAILABLE', 'ALLOCATED', 'RETURNED', 'DAMAGED', 'RETIRED');
CREATE TYPE "DamageChargeStatus" AS ENUM ('PENDING', 'DEDUCTED', 'WAIVED');
CREATE TYPE "ResignationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "ClearanceItemStatus" AS ENUM ('PENDING', 'DONE');
CREATE TYPE "FnfStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID');

CREATE TABLE "onboarding_checklists" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboarding_checklists_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "onboarding_checklists_employee_id_key" ON "onboarding_checklists"("employee_id");
CREATE INDEX "onboarding_checklists_company_id_status_idx" ON "onboarding_checklists"("company_id", "status");
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_checklists" ADD CONSTRAINT "onboarding_checklists_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "onboarding_tasks" (
    "id" TEXT NOT NULL,
    "checklist_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "OnboardingTaskStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboarding_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "onboarding_tasks_checklist_id_code_key" ON "onboarding_tasks"("checklist_id", "code");
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "onboarding_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "asset_tag" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "name" TEXT NOT NULL,
    "serial_no" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "purchase_date" DATE,
    "purchase_cost" DOUBLE PRECISION,
    "status" "AssetStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "assets_company_id_asset_tag_key" ON "assets"("company_id", "asset_tag");
CREATE INDEX "assets_company_id_status_idx" ON "assets"("company_id", "status");
ALTER TABLE "assets" ADD CONSTRAINT "assets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "asset_allocations" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "allocated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocated_by" TEXT,
    "expected_return_at" DATE,
    "returned_at" TIMESTAMP(3),
    "return_condition" TEXT,
    "return_note" TEXT,
    "returned_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_allocations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_allocations_employee_id_idx" ON "asset_allocations"("employee_id");
CREATE INDEX "asset_allocations_asset_id_idx" ON "asset_allocations"("asset_id");
ALTER TABLE "asset_allocations" ADD CONSTRAINT "asset_allocations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_allocations" ADD CONSTRAINT "asset_allocations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "asset_damage_charges" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "status" "DamageChargeStatus" NOT NULL DEFAULT 'PENDING',
    "payroll_run_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_damage_charges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_damage_charges_company_id_status_idx" ON "asset_damage_charges"("company_id", "status");
CREATE INDEX "asset_damage_charges_employee_id_idx" ON "asset_damage_charges"("employee_id");
ALTER TABLE "asset_damage_charges" ADD CONSTRAINT "asset_damage_charges_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_damage_charges" ADD CONSTRAINT "asset_damage_charges_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_damage_charges" ADD CONSTRAINT "asset_damage_charges_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "resignations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "resigned_at" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_working_day" DATE NOT NULL,
    "notice_days" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "status" "ResignationStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "exit_interview" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "resignations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resignations_company_id_status_idx" ON "resignations"("company_id", "status");
CREATE INDEX "resignations_employee_id_idx" ON "resignations"("employee_id");
ALTER TABLE "resignations" ADD CONSTRAINT "resignations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resignations" ADD CONSTRAINT "resignations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "exit_clearance_items" (
    "id" TEXT NOT NULL,
    "resignation_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "status" "ClearanceItemStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exit_clearance_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "exit_clearance_items_resignation_id_code_key" ON "exit_clearance_items"("resignation_id", "code");
ALTER TABLE "exit_clearance_items" ADD CONSTRAINT "exit_clearance_items_resignation_id_fkey" FOREIGN KEY ("resignation_id") REFERENCES "resignations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "fnf_settlements" (
    "id" TEXT NOT NULL,
    "resignation_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "status" "FnfStatus" NOT NULL DEFAULT 'DRAFT',
    "lines_json" JSONB NOT NULL,
    "gross_credits" DOUBLE PRECISION NOT NULL,
    "gross_debits" DOUBLE PRECISION NOT NULL,
    "net_payable" DOUBLE PRECISION NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),
    "finalized_by" TEXT,
    "experience_letter" TEXT,
    "relieving_letter" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fnf_settlements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fnf_settlements_resignation_id_key" ON "fnf_settlements"("resignation_id");
CREATE INDEX "fnf_settlements_company_id_idx" ON "fnf_settlements"("company_id");
ALTER TABLE "fnf_settlements" ADD CONSTRAINT "fnf_settlements_resignation_id_fkey" FOREIGN KEY ("resignation_id") REFERENCES "resignations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fnf_settlements" ADD CONSTRAINT "fnf_settlements_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
