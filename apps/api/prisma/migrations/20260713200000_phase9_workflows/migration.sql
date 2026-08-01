-- Phase 9 Workflow & Approval Engine

CREATE TYPE "WorkflowType" AS ENUM ('LEAVE', 'LOAN', 'ADVANCE', 'EXPENSE', 'SALARY', 'RESIGNATION');
CREATE TYPE "ApprovalInstanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "ApprovalActionType" AS ENUM ('APPROVE', 'REJECT', 'COMMENT');

CREATE TABLE "approval_workflows" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "type" "WorkflowType" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "approval_workflows_company_id_type_key" ON "approval_workflows"("company_id", "type");
ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "approval_chain_steps" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "approver_role" TEXT NOT NULL,
    "label" TEXT,
    CONSTRAINT "approval_chain_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "approval_chain_steps_workflow_id_step_order_key" ON "approval_chain_steps"("workflow_id", "step_order");
ALTER TABLE "approval_chain_steps" ADD CONSTRAINT "approval_chain_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "approval_instances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "type" "WorkflowType" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "requester_id" TEXT,
    "status" "ApprovalInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "current_step_order" INTEGER NOT NULL DEFAULT 1,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "approval_instances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_instances_company_id_status_idx" ON "approval_instances"("company_id", "status");
CREATE INDEX "approval_instances_entity_type_entity_id_idx" ON "approval_instances"("entity_type", "entity_id");
CREATE INDEX "approval_instances_type_status_idx" ON "approval_instances"("type", "status");
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "approval_actions" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "action" "ApprovalActionType" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_actions_instance_id_idx" ON "approval_actions"("instance_id");
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "approval_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
