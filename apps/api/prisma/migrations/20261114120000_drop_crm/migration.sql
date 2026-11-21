-- Remove the dormant CRM module (Orbit) tables and enums.
DROP TABLE IF EXISTS "crm_task_comments" CASCADE;
DROP TABLE IF EXISTS "crm_activity_logs" CASCADE;
DROP TABLE IF EXISTS "crm_tasks" CASCADE;
DROP TABLE IF EXISTS "crm_notes" CASCADE;
DROP TABLE IF EXISTS "crm_follow_ups" CASCADE;
DROP TABLE IF EXISTS "crm_deals" CASCADE;
DROP TABLE IF EXISTS "crm_leads" CASCADE;
DROP TABLE IF EXISTS "crm_customers" CASCADE;

DROP TYPE IF EXISTS "CrmLeadStatus";
DROP TYPE IF EXISTS "CrmTaskPriority";
DROP TYPE IF EXISTS "CrmTaskStatus";
DROP TYPE IF EXISTS "CrmDealStage";
DROP TYPE IF EXISTS "CrmFollowUpType";
