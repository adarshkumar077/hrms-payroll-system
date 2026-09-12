-- Track whether checkout was employee selfie (MANUAL_OUT), HR, or automatic 10 PM SYSTEM_LOGOUT
ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "check_out_source" TEXT;
