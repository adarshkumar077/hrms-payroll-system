-- Additive only: PH status, OFFICE holiday type, holiday system_tag (preserve all rows)

DO $$ BEGIN
  ALTER TYPE "AttendanceDayStatus" ADD VALUE 'PH';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "HolidayType" ADD VALUE 'OFFICE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "system_tag" TEXT;
CREATE INDEX IF NOT EXISTS "holidays_company_id_system_tag_idx" ON "holidays"("company_id", "system_tag");
