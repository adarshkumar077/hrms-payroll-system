-- Registered mobile and email are unique per company (employee mobile-OTP login by email).
-- Emails are stored lower-case by the API; normalise any existing rows first so the unique
-- index is effectively case-insensitive. Fails (without changing anything) if duplicates exist:
-- resolve them in HR first, then re-run.
UPDATE "employees" SET "email" = lower(trim("email")) WHERE "email" IS NOT NULL AND "email" <> lower(trim("email"));
UPDATE "employees" SET "email" = NULL WHERE "email" = '';
UPDATE "employees" SET "mobile" = NULL WHERE trim("mobile") = '';

CREATE UNIQUE INDEX "employees_company_id_mobile_key" ON "employees"("company_id", "mobile");
CREATE UNIQUE INDEX "employees_company_id_email_key" ON "employees"("company_id", "email");
