-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'PROBATION', 'NOTICE', 'INACTIVE', 'TERMINATED', 'RESIGNED');

-- CreateEnum
CREATE TYPE "DocumentTypeCode" AS ENUM ('AADHAAR', 'PAN', 'PASSPORT', 'RESUME', 'EDUCATIONAL', 'OFFER', 'APPOINTMENT', 'INCREMENT', 'EXPERIENCE', 'RELIEVING', 'BANK', 'CUSTOM');

-- AlterTable employees
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "middle_name" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "display_name" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "work_email" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "personal_email" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "date_of_birth" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "gender" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "marital_status" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "blood_group" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "photo_url" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "status" "EmploymentStatus" NOT NULL DEFAULT 'PROBATION';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "probation_end_at" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "confirmation_at" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "exit_at" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "designation" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "reporting_to_id" TEXT;

CREATE INDEX IF NOT EXISTS "employees_company_id_status_idx" ON "employees"("company_id", "status");
CREATE INDEX IF NOT EXISTS "employees_company_id_department_idx" ON "employees"("company_id", "department");

ALTER TABLE "employees" ADD CONSTRAINT "employees_reporting_to_id_fkey" FOREIGN KEY ("reporting_to_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "employee_personal" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "nationality" TEXT,
    "religion" TEXT,
    "father_name" TEXT,
    "mother_name" TEXT,
    "spouse_name" TEXT,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT DEFAULT 'India',
    "pincode" TEXT,
    "permanent_line1" TEXT,
    "permanent_line2" TEXT,
    "permanent_city" TEXT,
    "permanent_state" TEXT,
    "permanent_country" TEXT,
    "permanent_pincode" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_personal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_personal_employee_id_key" ON "employee_personal"("employee_id");
ALTER TABLE "employee_personal" ADD CONSTRAINT "employee_personal_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_employment" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "employment_type" TEXT,
    "work_location" TEXT,
    "grade" TEXT,
    "band" TEXT,
    "cost_center" TEXT,
    "shift_code" TEXT,
    "notice_period_days" INTEGER,
    "offer_date" TIMESTAMP(3),
    "contract_end_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_employment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_employment_employee_id_key" ON "employee_employment"("employee_id");
ALTER TABLE "employee_employment" ADD CONSTRAINT "employee_employment_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_bank" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "account_holder" TEXT,
    "bank_name" TEXT,
    "account_number" TEXT,
    "ifsc" TEXT,
    "branch" TEXT,
    "account_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_bank_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_bank_employee_id_key" ON "employee_bank"("employee_id");
ALTER TABLE "employee_bank" ADD CONSTRAINT "employee_bank_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_government" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "aadhaar_number" TEXT,
    "pan_number" TEXT,
    "passport_number" TEXT,
    "uan" TEXT,
    "pf_number" TEXT,
    "esic_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_government_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_government_employee_id_key" ON "employee_government"("employee_id");
ALTER TABLE "employee_government" ADD CONSTRAINT "employee_government_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_family_members" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3),
    "is_dependent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_family_members_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_family_members_employee_id_idx" ON "employee_family_members"("employee_id");
ALTER TABLE "employee_family_members" ADD CONSTRAINT "employee_family_members_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_emergency_contacts" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_emergency_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_emergency_contacts_employee_id_idx" ON "employee_emergency_contacts"("employee_id");
ALTER TABLE "employee_emergency_contacts" ADD CONSTRAINT "employee_emergency_contacts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_status_history" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "from_status" "EmploymentStatus",
    "to_status" "EmploymentStatus" NOT NULL,
    "reason" TEXT,
    "changed_by" TEXT,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_status_history_employee_id_effective_at_idx" ON "employee_status_history"("employee_id", "effective_at");
ALTER TABLE "employee_status_history" ADD CONSTRAINT "employee_status_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" "DocumentTypeCode" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_types_company_id_code_key" ON "document_types"("company_id", "code");
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "document_type_id" TEXT NOT NULL,
    "title" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "storage_provider" TEXT NOT NULL DEFAULT 'local',
    "uploaded_by" TEXT,
    "notes" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_documents_company_id_employee_id_idx" ON "employee_documents"("company_id", "employee_id");
CREATE INDEX "employee_documents_employee_id_document_type_id_idx" ON "employee_documents"("employee_id", "document_type_id");
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
