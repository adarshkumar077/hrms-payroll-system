-- Intelligence & Enterprise Setup
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'GMAIL';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'OUTLOOK';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'SLACK';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'TEAMS';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'GOOGLE_DRIVE';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'ONEDRIVE';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'REST_API';
ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'WEBHOOK';

CREATE TABLE "organization_settings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL DEFAULT 'Enhance IT Infrastructure (EITF)',
    "legal_name" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "gst" TEXT,
    "pan" TEXT,
    "logo_url" TEXT,
    "favicon_url" TEXT,
    "login_logo_url" TEXT,
    "email_logo_url" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#1d4ed8',
    "secondary_color" TEXT NOT NULL DEFAULT '#4f46e5',
    "accent_color" TEXT NOT NULL DEFAULT '#0ea5e9',
    "dark_mode_enabled" BOOLEAN NOT NULL DEFAULT true,
    "dashboard_widgets" JSONB NOT NULL DEFAULT '{}',
    "sidebar_config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_settings_company_id_key" ON "organization_settings"("company_id");
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_conversations_company_id_user_id_updated_at_idx" ON "ai_conversations"("company_id", "user_id", "updated_at");
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_prompts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_prompts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_prompts_company_id_category_idx" ON "ai_prompts"("company_id", "category");
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "conversation_id" TEXT,
    "model" TEXT,
    "latency_ms" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_logs_company_id_created_at_idx" ON "ai_logs"("company_id", "created_at");
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "avg_latency_ms" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_usage_company_id_day_key" ON "ai_usage"("company_id", "day");
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "encrypted_secret" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_keys_company_id_created_at_idx" ON "api_keys"("company_id", "created_at");
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "folder" TEXT NOT NULL DEFAULT 'COMPANY',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "employee_id" TEXT,
    "department" TEXT,
    "expires_at" TIMESTAMP(3),
    "uploaded_by" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "documents_company_id_folder_category_idx" ON "documents"("company_id", "folder", "category");
CREATE INDEX "documents_company_id_employee_id_idx" ON "documents"("company_id", "employee_id");
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "document_versions_document_id_version_key" ON "document_versions"("document_id", "version");
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dry_run" BOOLEAN NOT NULL DEFAULT false,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "success_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "mapping_json" JSONB NOT NULL DEFAULT '{}',
    "error_report" JSONB,
    "created_by" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "import_jobs_company_id_created_at_idx" ON "import_jobs"("company_id", "created_at");
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'CSV',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filters_json" JSONB NOT NULL DEFAULT '{}',
    "file_name" TEXT,
    "storage_key" TEXT,
    "created_by" TEXT,
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "export_jobs_company_id_created_at_idx" ON "export_jobs"("company_id", "created_at");
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "role_code" "RoleCode" NOT NULL,
    "module_key" TEXT NOT NULL,
    "access" TEXT NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "role_permissions_company_id_role_code_module_key_key" ON "role_permissions"("company_id", "role_code", "module_key");
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "login_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "event" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_logs_company_id_created_at_idx" ON "login_logs"("company_id", "created_at");
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "user_devices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device" TEXT,
    "browser" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_devices_company_id_user_id_idx" ON "user_devices"("company_id", "user_id");
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
