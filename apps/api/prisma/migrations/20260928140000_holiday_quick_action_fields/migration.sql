-- Additive: Quick Attendance Action fields on holidays (preserve all rows)
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "day_status" TEXT;
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "repeat_yearly" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "holidays_company_id_repeat_yearly_idx" ON "holidays"("company_id", "repeat_yearly");
