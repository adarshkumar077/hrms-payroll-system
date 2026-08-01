ALTER TABLE "users" ADD COLUMN "login_id" TEXT;

WITH ranked_admins AS (
  SELECT
    u.id,
    r.code,
    ROW_NUMBER() OVER (PARTITION BY r.code ORDER BY u."created_at", u.id) AS seq
  FROM "users" u
  JOIN "user_roles" ur ON ur."user_id" = u.id
  JOIN "roles" r ON r.id = ur."role_id"
  WHERE r.code IN ('CEO', 'HR')
),
employee_users AS (
  SELECT u.id, e."employee_code" AS employee_code
  FROM "users" u
  JOIN "employees" e ON e.id = u."employee_id"
)
UPDATE "users" u
SET "login_id" = CASE
  WHEN eu.employee_code IS NOT NULL THEN eu.employee_code
  WHEN ra.code = 'CEO' THEN 'SA' || LPAD(ra.seq::text, 3, '0')
  WHEN ra.code = 'HR' THEN 'HR' || LPAD(ra.seq::text, 3, '0')
  ELSE NULL
END
FROM employee_users eu
FULL OUTER JOIN ranked_admins ra ON ra.id = eu.id
WHERE u.id = COALESCE(eu.id, ra.id)
  AND u."login_id" IS NULL;

CREATE UNIQUE INDEX "users_company_id_login_id_key" ON "users"("company_id", "login_id");
