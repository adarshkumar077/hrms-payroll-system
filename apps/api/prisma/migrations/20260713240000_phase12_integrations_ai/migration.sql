-- Phase 12: Integrations & AI
CREATE TYPE "IntegrationProvider" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'BIOMETRIC_ESSL', 'GOOGLE_CALENDAR', 'ACCOUNTING');

CREATE TABLE "integration_configs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_configs_company_id_provider_key" ON "integration_configs"("company_id", "provider");

ALTER TABLE "integration_configs" ADD CONSTRAINT "integration_configs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "integration_event_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'STUB_SENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "integration_event_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "integration_event_logs_company_id_created_at_idx" ON "integration_event_logs"("company_id", "created_at");

ALTER TABLE "integration_event_logs" ADD CONSTRAINT "integration_event_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_chat_messages" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_chat_messages_company_id_user_id_created_at_idx" ON "ai_chat_messages"("company_id", "user_id", "created_at");

ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "resume_screenings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "candidate_name" TEXT NOT NULL,
    "role_target" TEXT NOT NULL,
    "resume_text" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "strengths_json" JSONB NOT NULL,
    "gaps_json" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "screened_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resume_screenings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "resume_screenings_company_id_created_at_idx" ON "resume_screenings"("company_id", "created_at");

ALTER TABLE "resume_screenings" ADD CONSTRAINT "resume_screenings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
