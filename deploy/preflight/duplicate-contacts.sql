-- Pre-upgrade check for migration 20261127090000_employee_unique_mobile_email.
-- That migration adds UNIQUE (company, mobile) and UNIQUE (company, email) on employees. If two
-- employees share a mobile or an email it fails (inside a transaction, so nothing changes) and the
-- API will not start until the duplicates are fixed.
--
-- Run BEFORE upgrading an existing database (read-only, prints employee codes only):
--   docker compose exec -T postgres psql -U eitf -d eitf_hrms < deploy/preflight/duplicate-contacts.sql
-- Zero rows = safe to upgrade. Otherwise HR corrects those employees first.

SELECT 'mobile' AS clash, e.company_id, string_agg(e.employee_code, ', ' ORDER BY e.employee_code) AS employee_codes, count(*) AS employees
FROM employees e
WHERE e.mobile IS NOT NULL AND trim(e.mobile) <> ''
GROUP BY e.company_id, e.mobile
HAVING count(*) > 1
UNION ALL
SELECT 'email', e.company_id, string_agg(e.employee_code, ', ' ORDER BY e.employee_code), count(*)
FROM employees e
WHERE e.email IS NOT NULL AND trim(e.email) <> ''
GROUP BY e.company_id, lower(trim(e.email))
HAVING count(*) > 1;
