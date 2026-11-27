# Security audit: release `release/2026-11-production-hardening`

Date: 27 Nov 2026. Scope: API (NestJS), web (Next.js), Docker production stack, backups, and the
login/OTP flow. The mobile app was out of scope apart from its API calls.

Method: code review, automated tests (unit, integration on a real test database, OTP e2e), the
repository's penetration script (`scripts/security-pentest.mjs`), and `npm audit`. **This is an
internal review, not an independent third-party penetration test.** Commission one before the system
holds payroll data for long.

## Summary

| Severity | Found | Fixed in this release | Open |
|---|---|---|---|
| Critical | 2 | 2 | 0 |
| High | 10 | 10 | 0 |
| Medium | 8 | 5 | 3 |
| Low / hygiene | 7 | 4 | 3 |

Every Critical and High finding is fixed and covered by a test. The open items are listed at the end,
each with the reason it is still open.

## Fixed: Critical

| # | Finding | Fix | Test |
|---|---|---|---|
| C1 | **Fake backups.** The scheduled "daily auto backup" recorded SUCCESS without writing a backup. | It now runs the real backup; a day counts as covered only by a SUCCESS with a non-zero size. | `security.service` specs |
| C2 | **Unvalidated employee bulk import.** `/import/employees` created employees directly in the database, with no mobile and no format or uniqueness checks, bypassing the mandatory-contact rules. | Only dry runs are allowed on that path; real imports go through the secure import (preview, checksum-bound Super Admin commit, backup confirmation). | `employee-import.*.spec.ts` |

## Fixed: High

| # | Finding | Fix |
|---|---|---|
| H1 | Six IDOR paths: employees could read other employees' records by changing an id | Ownership checks scoped by company and employee (earlier phase, regression-tested) |
| H2 | `X-Forwarded-For` spoofing could bypass the IP allowlist and rate limits | nginx overwrites XFF with `$remote_addr`; the guard trusts only the proxy (`ip-allowlist.guard.spec.ts`) |
| H3 | CSV / Excel formula injection in exports | `csvCell` neutralises `= + - @` prefixes; the new import error report does the same |
| H4 | Admin/HR accounts never forced to change the initial password | Forced change on first login; reusing the same password is refused |
| H5 | `nodemailer` 7 had a HIGH advisory (SMTP command injection) | Upgraded to 10.6.1; `npm audit --omit=dev`: 0 vulnerabilities |
| H6 | OTP flow: enumeration, brute force, replay | Generic responses; HMAC-hashed codes; single use under an advisory lock; 5-try lock; per-mobile and per-IP limits |
| H7 | Mobile and email not unique: two employees could share a number and receive each other's OTPs | Unique DB indexes `(companyId, mobile)` and `(companyId, email)` plus API checks with clear messages |
| H8 | Containers ran as root | API and web images run as the unprivileged `node` user |
| H9 | The API connected to Postgres as the superuser/owner | Optional least-privilege role: with `APP_DB_PASSWORD` set, the API runs as `eitf_app` (rows only, no DDL); migrations still use the owner |
| H10 | Per-IP rate limits (120 req/min, 10 logins/min, 30 OTP/hour) would lock out a whole office sharing one public IP; found by the 50-user load test (90 × 429) | Limits are configurable and sized for an office; a new **failed-login** limit (10 failures per IP in 10 min, successes not counted) keeps brute-force and spraying protection (pentest: 0 findings) |

## Fixed: Medium and Low

* M: ESD deposit ledger wrote the configured amount instead of the amount actually deducted on the
  payslip (`esd-ledger.integration.spec.ts`).
* M: The backup script did not verify archives and ignored off-site upload failures. It now checks
  with `pg_restore --list` / `tar -t`, records SHA-256 hashes, confirms the uploaded size, and exits
  non-zero on any failure.
* M: Uploads (documents, selfies) were not backed up. They are now archived, encrypted and sent
  off-site with the database.
* M: No alerting. A monitoring cron checks the database, disk, memory, backups, mail failures,
  failed-login spikes and the TLS certificate expiry, and emails `ALERT_EMAILS`.
* M: `Permissions-Policy` header missing; duplicate security headers.
* L: Node 20 (end of life) → Node 22 LTS base images.
* L: `certbot/certbot:latest` → pinned `v3.0.1`.
* L: SMS/MSG91 code and credentials removed entirely (less attack surface, no unused secrets).
* L: Notification channels that aren't configured no longer print personal data to the console.

## Controls verified

| Control | Evidence |
|---|---|
| Exactly 4 roles: Super Admin, Admin, HR, Employee | `RolesGuard` on every controller; employee self-service limited to own records |
| Employee data isolation | Company scope on every query; IDOR regression tests |
| Contact changes only by HR / Super Admin | `PUT /employees/:id` is limited to Super Admin and HR; `PUT /me/profile` refuses all employee self-edits |
| Passwords | bcrypt; lockout; forced change; 2FA (TOTP) available and enforceable for privileged roles |
| Sessions | Access token only in memory; refresh token in an httpOnly, `SameSite=Strict` cookie scoped to `/api/v1/auth`; CSRF header required |
| Transport | HTTPS only in production; HSTS; TLS 1.2+ |
| Exposure | Only nginx publishes ports; Postgres, Redis, API and web are on the internal Docker network |
| Files | Upload type/size checks; signed download URLs; private storage |
| Audit trail | Logins, OTP, imports, payroll approval, backups, email tests and settings changes are audit-logged |

## Open items (accepted for now, with the reason)

| # | Item | Why it is still open | Recommendation |
|---|---|---|---|
| O1 | No independent penetration test | Needs an external party | Book one within 3 months of go-live |
| O2 | Default QR / biometric device secrets come from the env template | Each site must generate its own | Generate them at install (see the deployment guide); a startup warning is planned |
| O3 | No retention policy for attendance selfies | Business/legal decision (DPDP Act 2023) | Decide a period (for example 90 days) and add a purge job |
| O4 | In-app JSON backups (Security → Backups) are not encrypted | The encrypted off-site backup is the `db-backup` container | Treat in-app backups as convenience snapshots and restrict that page to Super Admin |
| O5 | Login p95 is 3.4 s at 50 simultaneous logins | bcrypt is CPU-bound by design | Acceptable for an office morning rush; more CPU cores help |
| O6 | The mobile app still offers the old login screen | Out of scope for this release | Update before distributing the app |

## Re-running the checks

```bash
cd apps/api && TEST_DATABASE_URL=postgresql://…/eitf_hrms_test npm test   # unit + integration
npm run test:e2e:otp -w @eitf/api                                          # OTP email e2e
node scripts/security-pentest.mjs https://<host>                           # against a test stack only
npm audit --omit=dev
```
