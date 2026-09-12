-- Enterprise role system: 4 roles only (safe dedupe before unique constraint)

-- Step 1: convert role codes via text column
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "code_new" TEXT;

UPDATE "roles" SET "code_new" = CASE "code"::text
  WHEN 'CEO' THEN 'SUPER_ADMIN'
  WHEN 'MANAGER' THEN 'ADMIN'
  WHEN 'FINANCE' THEN 'ADMIN'
  WHEN 'SALES' THEN 'ADMIN'
  WHEN 'EMPLOYEE_ADMIN' THEN 'ADMIN'
  WHEN 'ADMIN' THEN 'ADMIN'
  WHEN 'HR' THEN 'HR'
  WHEN 'EMPLOYEE' THEN 'EMPLOYEE'
  ELSE 'EMPLOYEE'
END;

-- Step 2: reassign user_roles to canonical role (lowest id per company+code_new)
UPDATE "user_roles" ur
SET "role_id" = canon.id
FROM "roles" r
JOIN (
  SELECT "company_id", "code_new", MIN(id) AS id
  FROM "roles"
  GROUP BY "company_id", "code_new"
) canon ON canon."company_id" = r."company_id" AND canon."code_new" = r."code_new"
WHERE ur."role_id" = r.id AND r.id <> canon.id;

-- Step 3: remove duplicate role rows
DELETE FROM "roles" a
USING "roles" b
WHERE a."company_id" = b."company_id"
  AND a."code_new" = b."code_new"
  AND a.id > b.id;

-- Step 4: swap enum
ALTER TYPE "RoleCode" RENAME TO "RoleCode_old";
CREATE TYPE "RoleCode" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE');

ALTER TABLE "roles" DROP COLUMN "code";
ALTER TABLE "roles" RENAME COLUMN "code_new" TO "code";
ALTER TABLE "roles" ALTER COLUMN "code" TYPE "RoleCode" USING ("code"::"RoleCode");
ALTER TABLE "roles" ALTER COLUMN "code" SET NOT NULL;

DROP TYPE "RoleCode_old";

-- CRM lead status pipeline
ALTER TYPE "CrmLeadStatus" RENAME TO "CrmLeadStatus_old";
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'FOLLOW_UP', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');
ALTER TABLE "crm_leads" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "crm_leads" ALTER COLUMN "status" TYPE "CrmLeadStatus" USING (
  CASE "status"::text
    WHEN 'CONVERTED' THEN 'WON'
    WHEN 'QUALIFIED' THEN 'QUALIFIED'
    WHEN 'CONTACTED' THEN 'CONTACTED'
    WHEN 'LOST' THEN 'LOST'
    ELSE 'NEW'
  END::"CrmLeadStatus"
);
ALTER TABLE "crm_leads" ALTER COLUMN "status" SET DEFAULT 'NEW';
DROP TYPE "CrmLeadStatus_old";

CREATE TYPE "CrmTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "CrmTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'REOPENED');

ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "priority" "CrmTaskPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "follow_up_at" TIMESTAMP(3);
ALTER TABLE "crm_leads" ADD COLUMN IF NOT EXISTS "next_action" TEXT;
CREATE INDEX IF NOT EXISTS "crm_leads_company_id_follow_up_at_idx" ON "crm_leads"("company_id", "follow_up_at");

CREATE TABLE IF NOT EXISTS "crm_tasks" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "priority" "CrmTaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "CrmTaskStatus" NOT NULL DEFAULT 'PENDING',
  "due_at" TIMESTAMP(3),
  "assigned_by_employee_id" TEXT,
  "assigned_to_employee_id" TEXT NOT NULL,
  "lead_id" TEXT,
  "attachment_urls" JSONB,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "crm_task_comments" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "author_employee_id" TEXT,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_task_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "crm_activity_logs" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "lead_id" TEXT,
  "actor_employee_id" TEXT,
  "action" TEXT NOT NULL,
  "detail" TEXT,
  "meta" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "login_sessions" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "logout_at" TIMESTAMP(3),
  "ip_address" TEXT,
  "user_agent" TEXT,
  "device" TEXT,
  "browser" TEXT,
  "is_online" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "login_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "crm_tasks_company_id_status_idx" ON "crm_tasks"("company_id", "status");
CREATE INDEX IF NOT EXISTS "crm_tasks_company_id_assigned_to_employee_id_idx" ON "crm_tasks"("company_id", "assigned_to_employee_id");
CREATE INDEX IF NOT EXISTS "crm_task_comments_task_id_created_at_idx" ON "crm_task_comments"("task_id", "created_at");
CREATE INDEX IF NOT EXISTS "crm_activity_logs_company_id_lead_id_created_at_idx" ON "crm_activity_logs"("company_id", "lead_id", "created_at");
CREATE INDEX IF NOT EXISTS "login_sessions_company_id_login_at_idx" ON "login_sessions"("company_id", "login_at");
CREATE INDEX IF NOT EXISTS "login_sessions_company_id_user_id_idx" ON "login_sessions"("company_id", "user_id");
CREATE INDEX IF NOT EXISTS "login_sessions_company_id_is_online_idx" ON "login_sessions"("company_id", "is_online");

DO $$ BEGIN
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_by_employee_id_fkey" FOREIGN KEY ("assigned_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assigned_to_employee_id_fkey" FOREIGN KEY ("assigned_to_employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_task_comments" ADD CONSTRAINT "crm_task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "crm_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_task_comments" ADD CONSTRAINT "crm_task_comments_author_employee_id_fkey" FOREIGN KEY ("author_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_activity_logs" ADD CONSTRAINT "crm_activity_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_activity_logs" ADD CONSTRAINT "crm_activity_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "crm_activity_logs" ADD CONSTRAINT "crm_activity_logs_actor_employee_id_fkey" FOREIGN KEY ("actor_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
