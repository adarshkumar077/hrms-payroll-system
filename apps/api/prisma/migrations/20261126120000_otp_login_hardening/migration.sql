-- Mobile OTP login hardening (additive only: no data is changed or dropped).
ALTER TABLE "otp_challenges" ADD COLUMN "request_ip" TEXT;
ALTER TABLE "otp_challenges" ADD COLUMN "sms_status" TEXT;
ALTER TABLE "otp_challenges" ADD COLUMN "provider_message_id" TEXT;

CREATE INDEX "otp_challenges_company_id_mobile_created_at_idx" ON "otp_challenges"("company_id", "mobile", "created_at");
CREATE INDEX "otp_challenges_request_ip_created_at_idx" ON "otp_challenges"("request_ip", "created_at");
