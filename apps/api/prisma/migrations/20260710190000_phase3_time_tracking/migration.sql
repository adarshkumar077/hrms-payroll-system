-- Phase 3 enums
CREATE TYPE "HolidayType" AS ENUM ('NATIONAL', 'FESTIVAL', 'OPTIONAL', 'COMPANY');
CREATE TYPE "HolidayScope" AS ENUM ('ALL', 'DEPARTMENT', 'EMPLOYEES');
CREATE TYPE "AttendanceDayStatus" AS ENUM ('P', 'A', 'L', 'HD', 'PL', 'ULOB', 'WO', 'H', 'WFH', 'OD');
CREATE TYPE "AttendanceMethod" AS ENUM ('MANUAL', 'QR', 'GPS', 'GEOFENCE', 'SELFIE', 'WEB', 'BIOMETRIC');
CREATE TYPE "ShiftChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'COMPANY',
    "scope" "HolidayScope" NOT NULL DEFAULT 'ALL',
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "is_paid" BOOLEAN NOT NULL DEFAULT true,
    "departments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "employee_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "holidays_company_id_date_name_key" ON "holidays"("company_id", "date", "name");
CREATE INDEX "holidays_company_id_date_idx" ON "holidays"("company_id", "date");
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "grace_minutes" INTEGER,
    "is_overnight" BOOLEAN NOT NULL DEFAULT false,
    "overtime_after_minutes" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shifts_company_id_code_key" ON "shifts"("company_id", "code");
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shift_assignments_employee_id_date_key" ON "shift_assignments"("employee_id", "date");
CREATE INDEX "shift_assignments_company_id_date_idx" ON "shift_assignments"("company_id", "date");
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "shift_change_requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "from_shift_id" TEXT,
    "to_shift_id" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ShiftChangeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_change_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shift_change_requests_company_id_status_idx" ON "shift_change_requests"("company_id", "status");
CREATE INDEX "shift_change_requests_employee_id_date_idx" ON "shift_change_requests"("employee_id", "date");
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_from_shift_id_fkey" FOREIGN KEY ("from_shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_to_shift_id_fkey" FOREIGN KEY ("to_shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shift_change_requests" ADD CONSTRAINT "shift_change_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceDayStatus" NOT NULL DEFAULT 'A',
    "check_in_at" TIMESTAMP(3),
    "check_out_at" TIMESTAMP(3),
    "work_minutes" INTEGER,
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "method" "AttendanceMethod",
    "source_note" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "selfie_url" TEXT,
    "corrected_by" TEXT,
    "correction_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_records_employee_id_date_key" ON "attendance_records"("employee_id", "date");
CREATE INDEX "attendance_records_company_id_date_idx" ON "attendance_records"("company_id", "date");
CREATE INDEX "attendance_records_company_id_employee_id_date_idx" ON "attendance_records"("company_id", "employee_id", "date");
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "attendance_punches" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "record_id" TEXT,
    "punched_at" TIMESTAMP(3) NOT NULL,
    "punch_type" TEXT NOT NULL,
    "method" "AttendanceMethod" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "qr_payload" TEXT,
    "selfie_url" TEXT,
    "device_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "attendance_punches_employee_id_punched_at_idx" ON "attendance_punches"("employee_id", "punched_at");
CREATE INDEX "attendance_punches_company_id_punched_at_idx" ON "attendance_punches"("company_id", "punched_at");
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "employee_attendance_counters" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "late_mark_count" INTEGER NOT NULL DEFAULT 0,
    "ulob_count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "last_reset_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_attendance_counters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "employee_attendance_counters_employee_id_key" ON "employee_attendance_counters"("employee_id");
CREATE INDEX "employee_attendance_counters_company_id_idx" ON "employee_attendance_counters"("company_id");
ALTER TABLE "employee_attendance_counters" ADD CONSTRAINT "employee_attendance_counters_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "biometric_devices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "device_code" TEXT NOT NULL,
    "location" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "biometric_devices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "biometric_devices_company_id_device_code_key" ON "biometric_devices"("company_id", "device_code");
