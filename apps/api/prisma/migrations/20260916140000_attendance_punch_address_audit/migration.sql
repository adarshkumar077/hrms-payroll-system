-- Additive only: punch geo address/maps + attendance audit trail (preserve all rows)
ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "maps_url" TEXT;
ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "accuracy_m" DOUBLE PRECISION;
ALTER TABLE "attendance_punches" ADD COLUMN IF NOT EXISTS "selfie_url" TEXT;

CREATE TABLE IF NOT EXISTS "attendance_audit_logs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "record_id" TEXT,
    "employee_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "before_json" TEXT,
    "after_json" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "attendance_audit_logs_company_id_employee_id_created_at_idx"
  ON "attendance_audit_logs"("company_id", "employee_id", "created_at");
CREATE INDEX IF NOT EXISTS "attendance_audit_logs_record_id_idx"
  ON "attendance_audit_logs"("record_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_audit_logs_record_id_fkey'
  ) THEN
    ALTER TABLE "attendance_audit_logs"
      ADD CONSTRAINT "attendance_audit_logs_record_id_fkey"
      FOREIGN KEY ("record_id") REFERENCES "attendance_records"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
