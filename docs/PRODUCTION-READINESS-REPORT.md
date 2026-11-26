# EITF HRMS & Payroll: Phase 2 production readiness report

**Date:** 26 Nov 2026 · **Environment:** isolated Docker test stack `eitf-p1test` on the development PC
(production images, HTTPS by IP with a test company CA, fresh test database). The development
database, the other EITF Docker stack (`C:\Users\Aadarsh\Projects\eitf-hrms`) and any server were
not touched. Nothing was deployed. Every test-database change was preceded by a backup (copies in
the session scratch folder).

## Verdict

**Ready for deployment to a staging / pilot server. Not yet ready for live payroll.**

The application, Docker images, HTTPS, backups and recovery behave correctly, and five bugs found in
this phase are fixed and re-verified. Before real payroll: complete the server-only checks (firewall,
reboot, other devices), configure SMS and an off-site bucket, and resolve the **mid-year TDS** issue
with your CA (risk R1).

## Task results

| # | Task | Status | Evidence (summary) |
|---|---|---|---|
| 1 | Admin security | **PASS** (after fix) | 41/41 checks: Super Admin, Admin, HR, Employee roles; Admin and HR now forced to change password, blocked (403 `PASSWORD_CHANGE_REQUIRED`) until they do; same and weak passwords refused; old password stops working |
| 2 | OTP integration preparation | **PASS** (audit) · real SMS **NOT TESTED** | Adapter matches MSG91's official docs exactly (endpoint, headers, body, success response); no credentials → clear 503 configuration error, never "sent"; password login unaffected |
| 3 | Off-site encrypted backup | **PASS** (S3-protocol stand-in) · real R2/B2/S3 **NOT TESTED** | Encrypted upload; unencrypted upload refused; private key never on the backup container; restore downloaded from the bucket matched the live DB exactly |
| 4 | Production firewall | Port audit **PASS** · rules **NOT TESTED** (need Linux server) | Only nginx publishes ports; rules written in `docs/PRODUCTION-FIREWALL.md`; IP-spoofing bypass fixed (B4) |
| 5 | Multi-device testing | **NOT TESTED** | No second computer or phone available. Covered here: HTTPS, sessions, OTP configuration, isolation (API); phone-width UI (browser emulation) |
| 6 | Payroll load testing | **PASS** (after fix) | 10/15/20/50 employees: all lines correct; payroll for 452 employees failed (HTTP 500) before fix B3, then passed in 5.6 s; no SQL query over 100 ms |
| 7 | Recovery testing | **PASS** · full server reboot **NOT TESTED** | Container restarts, a hard Postgres crash and a full stop/start all recovered automatically with identical data |
| 8 | Final security audit | **PASS** (after fixes) | 15/15 attack checks; CSV injection fixed (B5); no secrets in logs |

## Evidence

### 1. Admin security
- **Before:** Admin users (Admin → Users) and HR users created by the Super Admin had
  `forcePasswordChange=false`, so they kept a password someone else chose. A password "change" to
  the same password was accepted.
- **After (Docker, fresh DB):** for both HR and Admin:
  - first login returns `forcePasswordChange: true`
  - `GET /employees` returns 403 until the password is changed
  - same password → 400 "New password must be different…"
  - `short` → 400
  - the change works, access is granted, and the old password returns 401
- **Roles:**
  - `/auth/me` shows the correct role.
  - HR → `GET /admin/users` = 403.
  - Admin → `GET /security/audit` (Super Admin only) = 403.
  - An employee can't list employees or export payroll (403).
  - 10 ways for EMP001 to reach EMP002's records by ID were all refused; HR can still open them.
- Module smoke test: 109 GET endpoints called as Super Admin and as an employee, **0 server errors**.
- Unit tests: 212/212. OTP/login end-to-end tests: 52/52.

### 2. OTP integration (MSG91)
Checked against MSG91's official docs (docs.msg91.com/sms/send-sms, page updated 29 Oct 2026):

| Item | Official | Our adapter |
|---|---|---|
| Endpoint | `POST https://control.msg91.com/api/v5/flow` | same |
| Headers | `accept`, `authkey`, `content-type` | same |
| Body | `template_id`, `short_url`, `recipients[{ mobiles: "91XXXXXXXXXX", <VAR>: value }]` | same (variable name `MSG91_OTP_VAR`, default `otp`) |
| Success | `{"type":"success","message":"<request id>"}` | checks `type === "success"`, stores the id |

**Needed from you:**
1. MSG91 account and Authkey.
2. DLT registration: a Principal Entity ID, an approved sender ID, and an approved OTP content template.
3. An MSG91 template created with your **DLT Template ID**, the exact approved text, and a variable for the code.
4. These settings: `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_OTP_VAR`, `OTP_HASH_SECRET`.

If MSG91's API security / IP whitelisting is enabled on the key, add the **server's public outbound IP**.

### 3. Off-site backup
Tested with an S3-compatible server (`rclone serve s3`, from the existing backup image, so nothing was
downloaded). This is the same protocol and client used for Cloudflare R2, Backblaze B2 and AWS S3.
- The key pair was made outside the server; only the **public** key went to the backup container,
  and the private key file was never on it.
- **A.** Bucket set but no encryption key → "refusing to upload an unencrypted dump off-site". Nothing was uploaded.
- **B.** Encrypted backup uploaded: 275,425 bytes. The remote object starts with `age-encryption.org/v1`.
- **C.** Wrong bucket credentials → error logged, local copy kept, **but the job exits 0** (risk R4).
- **D. Disaster-recovery restore:**
  - downloaded from the bucket and decrypted with the admin key, which was piped into memory (`/dev/shm`) and deleted afterwards
  - restored into a separate database
  - **identical** to live: 98 tables, 5 users, 2 employees, 60 settings, login fingerprint `5bd072d9b419`, employee fingerprint `770c4024796f`
- A wrong key fails: "no identity matched any of the recipients".

### 4. Firewall / exposure
- **Published ports:** `docker port` on all 6 containers shows host ports only on nginx
  (`80→127.0.0.1:18080`, `443→127.0.0.1:18443` in the test). Postgres, Redis, API and web have none.
- **TLS:** TLS 1.3, verifies against the company CA; TLS 1.1 refused; HTTP → 301 to HTTPS.
- **Headers:** each security header sent exactly once. Swagger returns 404.
- **Rules:** `docs/PRODUCTION-FIREWALL.md` covers ufw, the `DOCKER-USER` chain (Docker bypasses ufw),
  boot persistence, and how to verify on the server.

### 5. Multi-device
Not possible from one PC. Already covered:
- HTTPS and the certificate chain
- the session cookie (HttpOnly, Secure, SameSite=Strict, CSRF header required, rotation, no replay)
- OTP configuration error
- employee isolation
- phone-width UI: earlier browser test at 375 px, no horizontal scroll, OTP → Employee Dashboard

**To do on the server:**
1. Install the company CA on one Windows PC and one Android/iOS phone.
2. Log in as each role from each device.
3. Log in as an employee on the phone and check the dashboard, attendance (camera + GPS), payslip and leave.
4. Confirm a device outside the office subnet can't connect.

### 6. Payroll load test
- **Setup:** employees and salary setups created through the API, paced under the 120-requests-per-minute limit.
- **Attendance:** October 2026 bulk-inserted into the **test** DB. Weekdays present, Sundays off, plus 1 absence, 1 half day and 1 late mark per employee.
- **Salary mix:** five salary levels (₹18k–₹95k configured), PF/ESI/PT/TDS on statutory mode, PT state MH.

| Employees | Generate payroll | Attendance sheet (JSON) | Attendance sheet → Excel | Payroll Excel / PDF / CSV | Lines correct |
|---|---|---|---|---|---|
| 10 | 349 ms | 153 ms (296 KB) | 1,288 ms | 40 / 21 / 44 ms | 10/10 ✓ |
| 15 | 312 ms | 181 ms (420 KB) | 827 ms | 45 / 23 / 62 ms | 15/15 ✓ |
| 20 | 416 ms | 137 ms (544 KB) | 792 ms | 32 / 19 / 58 ms | 20/20 ✓ |
| 50 | 802 ms | 482 ms (1.3 MB) | **4,155 ms** | 46 / 27 / 170 ms | 50/50 ✓ |
| 302 | 4,034 ms | — | — | — | 302 ✓ |
| 452 | **HTTP 500 at 5,094 ms** → after fix **5,574 ms ✓** | — | — | — | 452 ✓ |
| Approve (452) | 1,215 ms; regenerating afterwards is refused ✓ | | | | |

Other endpoints (reports, dashboards, ESD sheet, employee list) were 12–177 ms at 50 employees.
**No SQL statement exceeded 100 ms** (Postgres slow-query log), so the slow parts are application code.

**Calculation checks:**
- Gross − deductions = net on every line; no negative amounts.
- Loss of pay = Basic × LOP days ÷ calendar days (₹9,000 × 1.5 ÷ 31 = ₹435.48 ✓).
- PF capped at ₹1,800.
- PT ₹200 (MH).
- TDS engine checked separately (risk R1).
- Note: the configured "gross" is paid as a **Salary** line, and allowances are added **on top**,
  as the HR preview shows (risk R7).

### 7. Recovery
- **Restart policies:** `unless-stopped` on all 6 containers.
- **Every container restarted:** healthy in about 6 s; data identical (452 employees / 452 payroll lines /
  13,950 attendance rows / same login fingerprint).
- **Hard Postgres crash** (`pg_ctl stop -m immediate`, like a power cut):
  - Docker restarted it (restarts=1), and Postgres ran crash recovery
  - the API reported the database healthy again **within 3 s**
  - data identical
- **Full stack stop → start:** healthy in about 3 s, data identical.
- **Not tested:** a real server reboot. Restarting Docker here would also restart your other EITF stack.

### 8. Security audit (live attacks, all against the test stack)
| Check | Result |
|---|---|
| Authentication: wrong password, no token, forced change, lockout after 5 wrong passwords | PASS (403 "Account locked … about 30 minute(s)") |
| Authorization / IDOR: roles, 10 cross-employee routes, admin-only routes | PASS |
| CSRF: refresh cookie without `X-CSRF` | PASS (403); with header 201; replaying a rotated cookie 401 |
| JWT tampering: role changed to SUPER_ADMIN; `alg:none` | PASS (both 401); roles come from the DB, not the token |
| Mass assignment: unknown fields `isAdmin`, `companyId` | PASS (400, whitelist + forbidNonWhitelisted) |
| XSS: hostile employee name stored, returned as JSON + nosniff; web CSP `script-src 'self' 'nonce-…' 'strict-dynamic'`, no `unsafe-inline`; no `dangerouslySetInnerHTML` in the web app | PASS |
| CSV / formula injection | **FAIL → fixed (B5)** |
| Rate limiting: login 10/min/IP, OTP 5/min/IP + per-number DB limits, global 120/min/IP | PASS, **after fix B4** (spoofable before) |
| Security headers: HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy (camera/GPS self) | PASS, each sent exactly once |
| Secrets in logs (665 lines from all containers after the last recreate) | PASS: none of the real test passwords, DB password, JWT/OTP/integration secrets, S3 secret or age private key; 0 JWTs; 0 Authorization headers |
| SQL injection: raw SQL built from user input | PASS (none; only a constant `SET client_encoding`) |

## Bugs found and fixed in Phase 2

| ID | Severity | Bug | Fix | Verified |
|---|---|---|---|---|
| B1 | High | Admin users (Admin → Users) and HR users created by the Super Admin were not forced to change the password someone else set | `forcePasswordChange: true` in `apps/api/src/admin/admin.service.ts` and `apps/api/src/auth/auth.service.ts` | Docker: forced change + 403 until changed |
| B2 | Medium | A password "change" to the same password was accepted | Refused in `auth.service.ts` `changePassword` | Docker: 400 |
| B3 | **Critical at scale** | Payroll generate/approve ran in one transaction with Prisma's default **5 s timeout**: payroll for about 450+ employees (fewer on slower hardware) failed with HTTP 500 and rolled back | `PAYROLL_TX_OPTIONS` (10 min, 20 s wait) in `apps/api/src/payroll/payroll.service.ts` | 452 employees: 500 → 201 |
| B4 | High (LAN) | nginx appended `X-Forwarded-For`; LAN clients have private IPs that the API trusts, so any user could fake their IP and **bypass the login rate limit and IP allow-list** | `deploy/nginx/ip-https/eitf-hrms.conf` now replaces it with `$remote_addr` | 12 spoofed logins: 0 throttled → throttled after 10 |
| B5 | Medium | CSV exports wrote text starting with `=`/`+`/`-`/`@` as-is (**CSV/formula injection**: a hostile employee name runs as a formula in Excel) | `csvCell()` in `apps/api/src/common/export.engine.ts`, used by `security.controller.ts` too; new `export.engine.spec.ts` | Export now writes `'=HYPERLINK(…)` |

Also new: `docs/PRODUCTION-FIREWALL.md`, and this report.

## Remaining risks

| ID | Level | Risk | Recommended action |
|---|---|---|---|
| R1 | **Critical for payroll** | TDS uses only salary paid **inside this system** in the financial year. Going live mid-year without April–(go-live) salary/TDS figures gives far too little TDS. Example at ₹1.9L/month in October: **₹0 instead of ₹42,952/month** | With your CA: go live at the start of an FY, or add/import prior-period earnings & TDS before the first live run |
| R2 | High | Firewall, reboot recovery and multi-device access are untested (need the real server and devices) | Run the checks in `PRODUCTION-FIREWALL.md` and section 5 on the server |
| R3 | High | No real SMS sent; DLT approval pending | Configure MSG91 + DLT; send one OTP to a test number |
| R4 | Medium | A failed off-site upload is logged but the backup job still exits 0, so no alert | Monitor backup logs / bucket freshness daily (e.g. alert if the newest object is over 26 h old) |
| R5 | Medium | The backup container covers **only the database**, not uploaded documents/selfies (`eitf_uploads` volume) | Add the nightly uploads-volume archive from `docs/HOSTING-DEDICATED-SERVER.md` §6, encrypted, off-site |
| R6 | Medium | Attendance-sheet Excel export takes about 80 ms per employee (4.2 s at 50). nginx `proxy_read_timeout` is 120 s, so it fails at about 1,400 employees. The JSON sheet is 1.3 MB at 50 employees | Fine for the expected size; optimise before passing about 500 employees |
| R7 | Medium (training) | In salary setup, "gross" is paid as a Salary line and allowances are **added on top**. HR entering the gross and also splitting it into allowances doubles the pay | HR training / UI wording; verify every employee's first payslip preview |
| R8 | Medium | Rate limits are per IP (120 requests/min). Employees behind one NAT/VPN address share that budget, which could throttle at shift start | Keep users on distinct LAN IPs, or raise limits for that network |
| R9 | Low | Default password policy is 8 characters with no complexity; initial employee passwords need only 5 characters (forced change mitigates) | Turn on uppercase/number/special in Security settings; enable 2FA for Super Admin/Admin/HR |
| R10 | Low | Changing a password doesn't sign out other sessions | Accept, or add refresh-token revocation on change |
| R11 | Low | Public-domain option (conf.d nginx) still appends `X-Forwarded-For`; that's correct for internet clients, but office users reaching it from private IPs could spoof | Use the IP-HTTPS config on the LAN, or set `TRUST_PROXY` to the Docker subnet only |
| R12 | Info | An older copy of the app runs in Docker on this PC (`C:\Users\Aadarsh\Projects\eitf-hrms`, port 9080) | Deploy only from this folder |
| R13 | Info | Load tests went up to 452 employees; attendance marking throughput by many simultaneous users wasn't tested | Pilot with one department first |

## Exact server deployment requirements

| Item | Requirement |
|---|---|
| Hardware | 4 vCPU, 8 GB RAM, 100 GB SSD, mirrored (RAID 1) if possible (minimum 2 vCPU / 4 GB / 40 GB); UPS |
| OS | Ubuntu Server 24.04 LTS, all updates, `unattended-upgrades`, `chrony`, `fail2ban`, `ufw` |
| Docker | Docker Engine 27+ and Compose plugin **2.24 or newer** (needed for `!override`), from Docker's official apt repository; `systemctl enable docker` |
| Network | Static LAN IP; DNS/IP plan for users; outbound HTTPS to `control.msg91.com` and the backup bucket; inbound 80/443 from the office subnet only, 22 from the admin PC only (`docs/PRODUCTION-FIREWALL.md`) |
| Code | This folder copied to `/opt/eitf-hrms` (not the older copy) |
| Certificates | `bash deploy/ip-https/make-certs.sh <SERVER_IP>` **on the server** (never reuse `deploy/certs/` from this PC); move `ca-private/ca.key` offline; install `eitf-hrms-ca.crt` on user devices |
| `.env.production` (chmod 600) | New random `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INTEGRATION_SECRET_KEY`, `OTP_HASH_SECRET`; `PUBLIC_APP_URL`/`CORS_ORIGINS=https://<SERVER_IP>`; `COOKIE_SECURE=true`; `PUBLIC_HTTP_PORT=80`; `PUBLIC_HTTPS_PORT=443`; `COMPOSE_FILE=docker-compose.yml:docker-compose.ip-https.yml`; `NGINX_BIND_IP=<SERVER_IP>`; `BOOTSTRAP_ADMIN_EMAIL`/`PASSWORD`; MSG91 settings; `BACKUP_AGE_RECIPIENT` (public key only), `BACKUP_RCLONE_REMOTE` + rclone config (chmod 600) |
| Start + auto-start | `docker compose --env-file .env.production up -d --build`; install `deploy/systemd/eitf-hrms.service`; reboot test |
| Backups | Nightly encrypted DB backup + off-site upload; uploads-volume backup (R5); monitoring (R4); restore drill before go-live and monthly |
| Go-live gates | R1 decided with the CA; first admin login + 2FA; password policy (R9); pilot payroll reconciled against the current system |

## Files changed in Phase 2
- `apps/api/src/admin/admin.service.ts`: B1
- `apps/api/src/auth/auth.service.ts`: B1, B2
- `apps/api/src/payroll/payroll.service.ts`: B3
- `deploy/nginx/ip-https/eitf-hrms.conf`: B4
- `apps/api/src/common/export.engine.ts`, `apps/api/src/security/security.controller.ts`: B5
- `apps/api/src/common/export.engine.spec.ts` (new)
- `docs/PRODUCTION-FIREWALL.md` (new), `docs/PRODUCTION-READINESS-REPORT.md` (new)

The test stack `eitf-p1test` is stopped (images and test data kept). The temporary S3 server was removed.
