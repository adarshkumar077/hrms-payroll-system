-- Schema drift fix (T14): make the database match schema.prisma exactly.

-- 1) import_jobs.error_report -> "errorReport".
--    The Prisma model field is `errorReport` with no @map, and the code reads/writes
--    `errorReport`, so the schema is the source of truth. RENAME (not drop/add) preserves data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs' AND column_name = 'error_report'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'import_jobs' AND column_name = 'errorReport'
  ) THEN
    ALTER TABLE "import_jobs" RENAME COLUMN "error_report" TO "errorReport";
  END IF;
END $$;

-- 2) Unique index on roles(company_id, code). The original index was lost when the enterprise
--    roles migration rebuilt the "code" column. De-duplicate first: repoint user_roles at the
--    oldest role per (company, code) where that will not collide with an existing assignment;
--    any remaining user_roles on a duplicate role are removed by the ON DELETE CASCADE below.
UPDATE "user_roles" ur
SET "role_id" = canon.id
FROM "roles" r
JOIN (
  SELECT "company_id", "code", MIN(id) AS id FROM "roles" GROUP BY "company_id", "code"
) canon ON canon."company_id" = r."company_id" AND canon."code" = r."code"
WHERE ur."role_id" = r.id AND r.id <> canon.id
  AND NOT EXISTS (
    SELECT 1 FROM "user_roles" x WHERE x."user_id" = ur."user_id" AND x."role_id" = canon.id
  );

DELETE FROM "roles" a
USING "roles" b
WHERE a."company_id" = b."company_id" AND a."code" = b."code" AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS "roles_company_id_code_key" ON "roles"("company_id", "code");
