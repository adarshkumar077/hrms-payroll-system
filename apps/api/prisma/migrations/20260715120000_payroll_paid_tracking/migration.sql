-- AlterTable
ALTER TABLE "payroll_lines" ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "payroll_lines" ADD COLUMN "paid_amount" DOUBLE PRECISION;
ALTER TABLE "payroll_lines" ADD COLUMN "paid_by" TEXT;
