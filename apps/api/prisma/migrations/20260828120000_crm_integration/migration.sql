-- AlterEnum
ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'SALES';

-- CreateEnum
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'LOST', 'CONVERTED');
CREATE TYPE "CrmDealStage" AS ENUM ('PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');
CREATE TYPE "CrmFollowUpType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'TASK', 'OTHER');

-- CreateTable
CREATE TABLE "crm_customers" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company_name" TEXT,
    "address" TEXT,
    "owner_employee_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_leads" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT,
    "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW',
    "expected_value" DOUBLE PRECISION,
    "owner_employee_id" TEXT,
    "customer_id" TEXT,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_deals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "stage" "CrmDealStage" NOT NULL DEFAULT 'PROSPECTING',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "owner_employee_id" TEXT,
    "customer_id" TEXT,
    "lead_id" TEXT,
    "expected_close_date" DATE,
    "closed_at" TIMESTAMP(3),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_deals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_follow_ups" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "CrmFollowUpType" NOT NULL DEFAULT 'CALL',
    "due_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "owner_employee_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "deal_id" TEXT,
    "customer_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crm_notes" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author_employee_id" TEXT,
    "lead_id" TEXT,
    "deal_id" TEXT,
    "customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_customers_company_id_owner_employee_id_idx" ON "crm_customers"("company_id", "owner_employee_id");
CREATE INDEX "crm_leads_company_id_status_idx" ON "crm_leads"("company_id", "status");
CREATE INDEX "crm_leads_company_id_owner_employee_id_idx" ON "crm_leads"("company_id", "owner_employee_id");
CREATE INDEX "crm_deals_company_id_stage_idx" ON "crm_deals"("company_id", "stage");
CREATE INDEX "crm_deals_company_id_owner_employee_id_idx" ON "crm_deals"("company_id", "owner_employee_id");
CREATE INDEX "crm_follow_ups_company_id_due_at_idx" ON "crm_follow_ups"("company_id", "due_at");
CREATE INDEX "crm_follow_ups_company_id_owner_employee_id_idx" ON "crm_follow_ups"("company_id", "owner_employee_id");
CREATE INDEX "crm_notes_company_id_created_at_idx" ON "crm_notes"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "crm_customers" ADD CONSTRAINT "crm_customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_customers" ADD CONSTRAINT "crm_customers_owner_employee_id_fkey" FOREIGN KEY ("owner_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_owner_employee_id_fkey" FOREIGN KEY ("owner_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_owner_employee_id_fkey" FOREIGN KEY ("owner_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_owner_employee_id_fkey" FOREIGN KEY ("owner_employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_follow_ups" ADD CONSTRAINT "crm_follow_ups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_author_employee_id_fkey" FOREIGN KEY ("author_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "crm_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
