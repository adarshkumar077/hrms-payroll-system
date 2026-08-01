-- Phase 11: Security & Compliance — backup runs
CREATE TYPE "BackupRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

CREATE TABLE "backup_runs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "status" "BackupRunStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "storage_path" TEXT,
    "size_bytes" INTEGER,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "backup_runs_company_id_started_at_idx" ON "backup_runs"("company_id", "started_at");

ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
