-- Phase 7 Growth & ops

CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ReviewCycleStatus" AS ENUM ('OPEN', 'SUBMITTED', 'REVIEWED', 'CLOSED');
CREATE TYPE "TrainingStatus" AS ENUM ('PLANNED', 'OPEN', 'COMPLETED', 'CANCELLED');
CREATE TYPE "AssignmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');
CREATE TYPE "TicketCategory" AS ENUM ('HR', 'IT', 'FINANCE', 'ADMIN');
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'ESCALATED', 'RESOLVED', 'CLOSED');

CREATE TABLE "performance_goals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "cycle_year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kra" TEXT,
    "kpi" TEXT,
    "target_value" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "performance_goals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "performance_goals_company_id_cycle_year_idx" ON "performance_goals"("company_id", "cycle_year");
CREATE INDEX "performance_goals_employee_id_idx" ON "performance_goals"("employee_id");
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "self_assessments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "cycle_year" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "achievements" TEXT,
    "challenges" TEXT,
    "self_rating" DOUBLE PRECISION,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "self_assessments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "self_assessments_employee_id_cycle_year_key" ON "self_assessments"("employee_id", "cycle_year");
CREATE INDEX "self_assessments_company_id_cycle_year_idx" ON "self_assessments"("company_id", "cycle_year");
ALTER TABLE "self_assessments" ADD CONSTRAINT "self_assessments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "manager_reviews" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "manager_id" TEXT NOT NULL,
    "cycle_year" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "strengths" TEXT,
    "improvements" TEXT,
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'REVIEWED',
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "manager_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manager_reviews_employee_id_cycle_year_key" ON "manager_reviews"("employee_id", "cycle_year");
CREATE INDEX "manager_reviews_company_id_cycle_year_idx" ON "manager_reviews"("company_id", "cycle_year");
ALTER TABLE "manager_reviews" ADD CONSTRAINT "manager_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manager_reviews" ADD CONSTRAINT "manager_reviews_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "promotion_recommendations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "cycle_year" INTEGER NOT NULL,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "proposed_designation" TEXT,
    "rationale" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promotion_recommendations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotion_recommendations_employee_id_cycle_year_idx" ON "promotion_recommendations"("employee_id", "cycle_year");
ALTER TABLE "promotion_recommendations" ADD CONSTRAINT "promotion_recommendations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "trainings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT,
    "duration_hrs" DOUBLE PRECISION,
    "status" "TrainingStatus" NOT NULL DEFAULT 'OPEN',
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trainings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "trainings_company_id_code_key" ON "trainings"("company_id", "code");
CREATE INDEX "trainings_company_id_status_idx" ON "trainings"("company_id", "status");
ALTER TABLE "trainings" ADD CONSTRAINT "trainings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "training_assignments" (
    "id" TEXT NOT NULL,
    "training_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "score" DOUBLE PRECISION,
    "certificate_no" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "training_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "training_assignments_training_id_employee_id_key" ON "training_assignments"("training_id", "employee_id");
CREATE INDEX "training_assignments_employee_id_idx" ON "training_assignments"("employee_id");
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_training_id_fkey" FOREIGN KEY ("training_id") REFERENCES "trainings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "training_assignments" ADD CONSTRAINT "training_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "certifications" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "name" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "certificate_no" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "certifications_assignment_id_key" ON "certifications"("assignment_id");
CREATE INDEX "certifications_employee_id_idx" ON "certifications"("employee_id");
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "training_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ticket_sla_configs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL,
    "priority" "TicketPriority" NOT NULL,
    "response_mins" INTEGER NOT NULL,
    "resolve_mins" INTEGER NOT NULL,
    "escalate_after_mins" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ticket_sla_configs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ticket_sla_configs_company_id_category_priority_key" ON "ticket_sla_configs"("company_id", "category", "priority");
ALTER TABLE "ticket_sla_configs" ADD CONSTRAINT "ticket_sla_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "ticket_no" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "assignee_id" TEXT,
    "category" "TicketCategory" NOT NULL,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "escalated_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tickets_company_id_ticket_no_key" ON "tickets"("company_id", "ticket_no");
CREATE INDEX "tickets_company_id_status_idx" ON "tickets"("company_id", "status");
CREATE INDEX "tickets_requester_id_idx" ON "tickets"("requester_id");
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ticket_comments_ticket_id_idx" ON "ticket_comments"("ticket_id");
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
