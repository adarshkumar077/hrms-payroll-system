# Testing results

Release branch `release/2026-11-production-hardening`. Every result below came from an actual run.
Anything not run is marked **NOT TESTED** with the reason.

## Environments

| Name | What it is |
|---|---|
| Unit / integration | `apps/api` tests on a separate test database `eitf_hrms_test` (embedded Postgres 18), synthetic data only |
| OTP e2e | Compiled API + throw-away database + a local mock SMTP receiver |
| Test stack `eitf-p2test` | Full production Docker Compose stack (nginx, web, API, Postgres 16, Redis, db-backup) on this PC, bound to `127.0.0.1:18080` only, fresh volumes, generated secrets, no employee data |

The development database and the other Docker stack (`eitf-hrms`) were not modified.

## Results: 27 Nov 2026

| Suite | Result | Notes |
|---|---|---|
| API typecheck (`tsc --noEmit`) | PASS | API and web |
| Unit + integration (`npm test`) | **273 / 273 pass** | Includes the import, ESD ledger, mail, monitoring and failed-login limiter specs |
| OTP email e2e (`test/otp-login.e2e.mjs`) | **54 / 54 pass** | Delivery, cooldown, per-mobile and per-IP limits, lockout, single use, privileged roles refused, employee without email, no OTPs or full emails in the logs |
| `npm audit --omit=dev` | **0 vulnerabilities** | |
| Container user | PASS | API and web run as `uid=1000(node)`, Node v22.23.5 |
| DB least privilege | PASS | API connected as `eitf_app` (not superuser); `CREATE`, `DROP`, `ALTER` and `TRUNCATE` refused, `SELECT` allowed, `_prisma_migrations` not readable |
| Forced password change | PASS | New Super Admin got `PASSWORD_CHANGE_REQUIRED` until the password was changed; reusing the password is refused |
| Security pentest script | **0 findings** | Health leak, auth on employees / leave / help docs, Swagger hidden, login rate limit, CORS |
| Smoke test | **6 / 6 pass** | `/me` routes skipped (the test admin has no employee record) |
| Backup (`backup.sh once`, age) | PASS | DB 264 KB verified, uploads archive verified, both encrypted, SHA-256 recorded |
| Restore into a scratch DB | PASS | Row counts identical (companies 1, users 1, audit logs 19, migrations 28) |
| Uploads restore | PASS | Byte-for-byte |
| Import routes | PASS | `template`, `preview`, `commit` and `jobs` return 401 without login; the page compiles |

### Load test (test stack, final run)

Each simulated user runs the admin request mix: health, HR dashboard, employee list, attendance
console, payroll runs, notifications, and two web pages.

| Users | Requests | Failed | avg | p95 | max |
|---|---|---|---|---|---|
| 10 | 80 | 0 | 82 ms | 173 ms | 184 ms |
| 15 | 120 | 0 | 101 ms | 243 ms | 264 ms |
| 20 | 160 | 0 | 125 ms | 295 ms | 376 ms |
| 40 | 320 | 0 | 218 ms | 688 ms | 767 ms |
| 50 | 400 | 0 | 279 ms | 840 ms | 936 ms |

Targets: avg < 500 ms, p95 < 2 s. **Met at every level.**

**Defect found and fixed during load testing:** the first run at 50 users returned 90 × HTTP 429. The
general limit was 120 requests/min per IP, login 10/min per IP and OTP 30/hour per IP, while an office
shares **one** public IP. As configured, a normal morning sign-in would have locked staff out. The
limits are now configurable and sized for an office. Brute force is still blocked by a new
failed-login limit (10 failures per IP in 10 minutes), which the pentest confirms.

Script fixes: `scripts/load-test.mjs` and `scripts/smoke-test.mjs` used an unsupported `take` query
parameter (HTTP 400) and called `/me` routes for an admin with no employee record. Both are corrected;
the earlier failures were script errors, not application errors.

### Earlier measurements (Phase 2 test stack, synthetic data)

| Test | Result |
|---|---|
| Payroll run, 452 employees | 5.6 s |
| Attendance Excel export, 50 employees | 4.2 s |
| 50 simultaneous password logins | 0 errors, p95 3.4 s (bcrypt is CPU-bound by design) |

## NOT TESTED (needs something only you can provide)

| Item | Blocked on |
|---|---|
| **Real OTP email to a real inbox** | SMTP credentials and a test employee mailbox. *Do not announce OTP login until this passes.* |
| Off-site backup upload and download | Bucket and rclone credentials |
| Public HTTPS with a trusted certificate | Domain name, static IP / CGNAT check, router port forwarding |
| Behaviour on the real production server | The server machine itself |
| Logged-in click-through of the new import page | Done only by the integration tests; needs a Super Admin session on the test or production stack |
| Self-service (`/me`) routes under load | A test employee login on the test stack |
| Payroll against real statutory rules for your company | The business decisions in `PROJECT_FINAL_STATUS.md` (R1–R2) |
| Mobile app | Out of scope for this release |

## How to re-run

```bash
cd apps/api
TEST_DATABASE_URL=postgresql://eitf:…@127.0.0.1:5435/eitf_hrms_test npm test
npm run build && TEST_DATABASE_URL=… npm run test:e2e:otp
cd ../..
node scripts/security-pentest.mjs https://<host>
LOAD_TEST_USER=… LOAD_TEST_PASS=… node scripts/smoke-test.mjs https://<host>
LOAD_TEST_USER=… LOAD_TEST_PASS=… node scripts/load-test.mjs https://<host> 50
```
