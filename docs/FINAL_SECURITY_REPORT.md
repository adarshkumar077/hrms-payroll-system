# Final security report

Date: 27 Nov 2026 · Branch `release/2026-11-production-hardening` · Internal review (code review,
automated tests, scripted penetration checks, dependency audit). **Not** an independent third-party
penetration test.

## Result

**No open Critical or High findings in the application code.** Two High risks remain in the
**environment**, and both need your action: the server runs Windows 10, which no longer gets
security updates, and the system has not been deployed or tested on that server yet.

| Severity | Found (all rounds) | Fixed | Open |
|---|---|---|---|
| Critical | 3 | 3 | 0 |
| High | 12 | 12 | 0 (app) · 2 environment |
| Medium | 9 | 6 | 3 |
| Low | 8 | 5 | 3 |

## Fixed in this final round

| # | Sev | Finding | Fix |
|---|---|---|---|
| C3 | Critical | **Super Admin takeover on a fresh server**: the public setup page let whoever reached an empty production system first become Super Admin | Web setup is disabled in production; Super Admins are created on the server console (`prisma/super-admin.ts`) with a one-time password |
| H11 | High | Initial employee passwords used `Math.random()` (predictable) | `crypto.randomInt` / Web Crypto, 14 characters |
| H12 | High | Dev scripts in the production image create a Super Admin with the known password `Admin@123` (no forced change) or accept 5-character passwords | Both refuse to run in production |
| M | Medium | Weak default password policy (8 characters, no complexity) | 10+ characters, uppercase and a number by default (adjustable in Settings) |
| M | Medium | Fake-success integrations: report "email" stored the report contents in a log and claimed it was sent; SMS/WhatsApp "sent" and printed phone numbers and messages to the console; fake connection tests | Real SMTP delivery (requester's own address only, contents not logged); SMS/WhatsApp refuse honestly; tests report real status |
| M | Medium | HR "send email" would be able to email any address from the company mailbox (phishing risk) | Only to addresses registered in the company |
| L | Low | CI lint failure meant **no tests ran in GitHub CI** | Fixed; CI is green on every push |
| L | Low | `deploy/up.ps1` would start production with the example file's `CHANGE_ME` secrets | Refuses |

Earlier rounds (in `SECURITY_AUDIT.md`): fake backups, unvalidated employee bulk import, six IDOR
paths, X-Forwarded-For spoofing, CSV formula injection, no forced password change, nodemailer CVE,
OTP abuse protection, unique contacts, root containers, superuser DB role, per-IP limits that would
lock out an office.

## Checklist

| Area | Status | Evidence |
|---|---|---|
| Employee data leakage / IDOR | ✅ | 77-check role and isolation test: employee A cannot read B through `/employees/:id`, payslip, attendance or onboarding routes, even with B's id in the query |
| Unauthorized access | ✅ | Every role-restricted route returns 403; anonymous requests return 401 |
| Privilege escalation | ✅ | Only Super Admin can create users, change roles, commit imports, run payroll; Admin cannot edit contacts |
| Authentication bypass | ✅ | Global JWT guard; password-change guard blocks everything until a forced change is done; 2FA available |
| SQL injection | ✅ | Prisma parameterised queries; the few raw queries use tagged templates (parameterised) |
| XSS | ✅ | React escapes output; OTP email template escapes names; Content-Security-Policy from the API (helmet) and the web app (per-request nonce); other security headers via nginx |
| CSRF | ✅ | Refresh cookie `SameSite=Strict`, path-scoped; cookie auth endpoints require the `X-CSRF` header; API uses bearer tokens |
| OTP abuse | ✅ | Hashed single-use codes, 5-minute expiry, cooldown, per-mobile and per-IP limits, 5-attempt lock, no enumeration (54 e2e cases) |
| Weak passwords | ✅ | Stronger default policy, bcrypt cost 12, lockout, failed-login limit per IP |
| Session security | ✅ | Access token in memory only; httpOnly refresh cookie; admin force-logout; reset signs out all sessions |
| File upload | ✅ | Type checked by content (import), size limits, private storage, signed URLs |
| Database exposure | ✅ | Postgres/Redis not published; API uses a DML-only role (DDL refused, verified) |
| Public backup exposure | ✅ | Backups encrypted with age; private key never on the server; backup volume not served |
| Sensitive info leakage | ✅ | No OTPs, passwords or full emails in logs (e2e checked); report contents not logged; dependency audit 0 vulnerabilities |

## Open items

| Item | Severity | Owner |
|---|---|---|
| Server OS is Windows 10 (end of support) | **High (environment)** | You: upgrade or commercial ESU before going public (`FINAL_SERVER_CONFIGURATION.md`) |
| Production deployment not yet security-tested (TLS grade, external port scan) | **High (environment)** | Run `security-pentest.mjs` and an external port scan after deployment |
| No independent penetration test | Medium | Book within 3 months of go-live |
| Attendance selfie retention period not defined (DPDP Act) | Medium | Management decision |
| Repository is **public** on GitHub (code + docs visible, no secrets) | Medium | You: consider making it private |
| Default QR / biometric device secrets come from the env template | Low | Generate per site at install |
| In-app JSON backups unencrypted (the encrypted backup is `db-backup`) | Low | Restrict to Super Admin (already) |
| Mobile app still uses the old login screen | Low | Update before distributing the app |
