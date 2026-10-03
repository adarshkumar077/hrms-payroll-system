-- Additive: align attendance_records with Prisma schema (preserve existing rows)
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "overtime_minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "todays_earnings" DOUBLE PRECISION;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_in_latitude" DOUBLE PRECISION;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_in_longitude" DOUBLE PRECISION;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_in_address" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_in_selfie_url" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_in_maps_url" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_out_latitude" DOUBLE PRECISION;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_out_longitude" DOUBLE PRECISION;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_out_address" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_out_selfie_url" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_out_maps_url" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_out_source" TEXT;
