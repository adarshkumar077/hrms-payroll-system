# Final test results

Runs of 27–28 Nov 2026 on branch `release/2026-11-production-hardening`. Each result is from an
actual run. Anything not run is listed under **NOT TESTED**, with the reason.

**Where:**
* *Unit/integration*: API test suite on a separate test database (synthetic data).
* *Test stack*: the full production Docker setup (`eitf-p2test`: nginx, web, API, PostgreSQL 16,
  Redis, backup) on the build laptop, loopback-only, with generated secrets and no real employee
  data.
* *GitHub CI*: the repository's workflow on every push.

## Automated suites

| Suite | Result |
|---|---|
| Unit + integration (`apps/api`), fresh database with all 29 migrations | **279 / 279 pass** |
| Schema drift (schema vs migrations) | none |
| OTP email end-to-end (real API + mock SMTP) | **54 / 54 pass** |
| Lint | 0 errors (warnings only, pre-existing) |
| API + web production builds | pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| GitHub CI (lint, migrations, drift, tests, builds, audit) | **green** on the release branch (it was failing at lint before this release) |

## Test stack (production configuration)

| Area | Result |
|---|---|
| Migrations at container start, incl. the new TDS opening-balance table | applied |
| API runs as non-root `node`, connects as DML-only `eitf_app`; CREATE/DROP/ALTER/TRUNCATE refused | pass |
| **Four roles + data isolation** (`scripts/role-isolation-test.mjs`) | **77 / 77 pass** |
| Smoke test | 6 / 6 |
| Security pentest script | 0 findings |
| **Super Admin console tool**: list; create refused when one exists; dev script with a known password refused in production; reset → old password rejected, one-time password works, forced change enforced, sessions signed out, audit entry without the password | pass |
| Web setup page disabled in production (`webSetupAllowed: false`) | pass |
| Encrypted backup (`backup.sh once`, age) | OK, verified |
| Restore into a scratch database | identical counts: employees 2, users 5, audit 74, opening balances 0, migrations 29 |
| Restart of the whole stack | data intact (employees 2 → 2), smoke 6/6 after restart |

### Load test (admin request mix; final run 28 Nov)

| Users | Requests | Failed | avg | p95 | max |
|---|---|---|---|---|---|
| 10 | 80 | 0 | 70 ms | 125 ms | 154 ms |
| 15 | 120 | 0 | 86 ms | 192 ms | 208 ms |
| 20 | 160 | 0 | 99 ms | 214 ms | 232 ms |
| 40 | 320 | 0 | 166 ms | 463 ms | 811 ms |
| 50 | 400 | 0 | 157 ms | 544 ms | 1,012 ms |

Targets: avg < 500 ms and p95 < 2 s. **Met at every level.** Earlier: payroll for 452 synthetic
employees in 5.6 s; 50 simultaneous logins p95 3.4 s (bcrypt is CPU-bound by design).

### Role and isolation matrix (summary)

| Check | Super Admin | Admin | HR | Employee |
|---|---|---|---|---|
| List / read employees | ✅ | ✅ | ✅ | ⛔ 403 |
| Edit another employee's mobile/email | ✅ | ⛔ | ✅ | ⛔ |
| Edit own profile (self-service) | ⛔ | ⛔ | ⛔ | ⛔ (changes go through HR) |
| Own profile / payslips / attendance / leave | — | — | — | ✅ |
| Payroll runs | ✅ | ⛔ | ⛔ | ⛔ |
| Audit log, backups, users, system health, email settings | ✅ | ⛔ | ⛔ | ⛔ |
| Import history / preview | ✅ | ✅ | ✅ | ⛔ |
| Import **commit** | ✅ | ⛔ | ⛔ | ⛔ |
| Employee A reading B (id route, payslip/attendance with B's id, onboarding) | — | — | — | no B data returned |
| Anonymous requests | 401 everywhere | | | |

### Payroll / attendance calculations (unit + integration)

* Statutory payroll calculator, PF/ESI/PT/TDS, prorating, incentives, ESD ledger (deposit = amount
  deducted).
* **TDS with opening balance:** December run, opening ₹12,00,000 / TDS ₹90,000 → projected
  ₹18,00,000, monthly TDS = (annual tax − 90,000) ÷ 4. Without the opening balance: projected
  ₹6,00,000 (shows why it's needed).
* Attendance tally used by payroll and incentives.

## Bugs found by testing and fixed

| Found by | Bug |
|---|---|
| GitHub CI | Lint error stopped CI before any test ran |
| 50-user load test | Per-IP limits would lock out an office sharing one public IP |
| Role test | Payment Management menu shown to HR/Admin, but the API allows only Super Admin (broken page) |
| Code audit | Fake-success integrations, `Math.random` passwords, open web setup in production, known-password dev script |
| Scripts | Load/smoke scripts used an unsupported parameter; my full-run script had a typo that skipped one load run (re-run above) |

## NOT TESTED (and why)

| Item | Needs |
|---|---|
| **Real OTP email delivery to a real inbox** | Google Workspace app password / SMTP relay + a test mailbox |
| Report email / welcome email with real delivery | Same (logic tested with a mail stub) |
| External network login, public HTTPS, TLS grade | Domain, server deployment, router forwarding |
| Anything on **your** server (restart after power loss, firewall rules applied, Docker Desktop auto-start) | Server access / deployment |
| Off-site backup upload and download | Bucket + credentials |
| Mobile responsiveness by hand on phones | Manual pass on the deployed site (pages use responsive layouts; tables scroll horizontally) |
| Self-service (employee) endpoints under load | A load test with employee logins (admin mix only so far) |
| Attendance selfie + GPS with a real camera/phone | Manual test on the deployed HTTPS site (browsers allow camera/GPS only on HTTPS) |
| Excel/PDF/CSV exports by hand in the browser | Covered by unit tests of the export engine only |
| Payroll against your company's real rules | HR/CA decisions on PF, ESD, ULOB, PL, overtime (`FINAL_PROJECT_STATUS.md`) |
