# Project final status: EITF HRMS & Payroll

Date: 27 Nov 2026 · Branch `release/2026-11-production-hardening` (from GitHub `main` @ `6e506be`),
committed locally, **not pushed**.

## Verdict

**Software: ready for a controlled launch. Not live.** All Critical and High security findings are
fixed, and every automated suite passes on a production-identical test stack. Going live is blocked
only by items that need you: the server, the domain/IP, SMTP, the backup bucket, and payroll
decisions. Those are listed in the last section of this document.

## Done in this release

| Area | Change |
|---|---|
| Login | **MSG91 / SMS removed.** Mobile OTP is sent to the employee's registered email over SMTP: branded template, retries, rate limits, hashed single-use codes, no OTPs in logs, failure alerts (`EMAIL_OTP_SETUP.md`) |
| Employee data | Mobile and email **mandatory, validated and unique** per company (DB indexes + API checks). Only Super Admin / HR can change them; employees can't edit their profile |
| Import | **Secure employee Excel import** with preview, row-level error report, duplicate detection, safe re-import, SHA-256 file binding, backup confirmation, Super Admin approval and audit trail. The old unvalidated bulk import is disabled. **Nothing imported** (`EMPLOYEE_EXCEL_IMPORT_GUIDE.md`) |
| Backups | Real nightly backup (the old scheduler recorded fake successes). DB + uploads, verified, SHA-256, age-encrypted, off-site via rclone, status file, restore script with dry-run guard; restore tested (`DATABASE_BACKUP_AND_RESTORE.md`) |
| Monitoring | 15-minute health checks (DB, disk, memory, backups, mail, failed logins, TLS expiry) with email alerts |
| Payroll | ESD ledger now records the amount actually deducted |
| Hardening | Containers run non-root, Node 22 LTS, least-privilege DB role for the API, certbot pinned, nodemailer CVE fixed (0 prod vulnerabilities) |
| Rate limiting | Per-IP limits sized for an office behind one IP, plus a failed-login limit against password spraying |
| Docs | The 10 launch documents in `docs/` |

Commits on the branch: `e48ddfb`, `c7dacfd`, `c6ac468`, `9aa1540`, `5f8d2d4`, `e05fd15`, `28beb08`,
plus the final commit with rate limits and docs.

## Test evidence (details in `TESTING_RESULTS.md`)

273/273 unit + integration · 54/54 OTP e2e · pentest 0 findings · smoke 6/6 · load 10–50 users with
0 errors (p95 ≤ 840 ms) · backup + restore verified · DB least privilege verified.

## Risks and decisions needed (no live payroll until R1 and R2 are closed)

| # | Item | Severity | Decision needed from |
|---|---|---|---|
| **R1** | **Mid-year TDS.** The system has no record of salary paid and TDS deducted earlier this financial year (Apr–Nov 2026). The TDS for the remaining months would be wrong. Nothing has been invented. If your CA approves, an **opening-balance** screen (YTD gross, YTD TDS, previous-employer income per employee) can be built | **Blocker for live payroll** | CA + management |
| **R2** | Payroll rules that differ from your written policy: **PF** uses the statutory 12 % capped at ₹1,800 (policy says a fixed ₹3,600); **TDS** is slab-based only (no flat 1 % mode); **ESD** interest defaults to 0 % compounded monthly with no TDS on interest, and ESD is off per employee by default; **ULOB** "2 absent days" setting is unused, no warning at 3; **PL** probation is 7 months, no 1-per-month cap; **overtime 1.5×** not implemented; daily / hourly wages not used | High | HR + CA: confirm each rule; then they are configured or built and tested |
| R3 | Real OTP email not yet sent to a real inbox | High | You: SMTP credentials + test mailbox |
| R4 | This PC is a laptop and also runs another stack | High | You: dedicated server + UPS |
| R5 | Possible CGNAT (ISP hop `10.240.x.x`) | High | You: compare router WAN IP with public IP; ask the ISP for a real static IPv4 |
| R6 | No domain, so no publicly trusted certificate | High | You: domain / sub-domain + DNS A record |
| R7 | Off-site backup not configured | High | You: bucket + credentials, age key pair |
| R8 | No selfie retention period (DPDP) | Medium | Management / legal |
| R9 | No 30-minute attendance reminder; no self-service "forgot password" (HR resets it; OTP works once email is set up) | Medium | Product decision |
| R10 | Mobile app still has the old login screen | Medium | Update before distributing the app |
| R11 | No independent penetration test | Medium | Book within 3 months of go-live |

## What you need to provide (checklist)

1. **Server**: a dedicated machine (min. 4 cores / 16 GB / 500 GB SSD) with a UPS. Or confirm you
   accept this laptop for a short pilot.
2. **Router WAN IP** (from the router status page), so the CGNAT question can be settled.
3. **Domain or sub-domain** for the HRMS, and access to its DNS.
4. **SMTP**: host, port, username, password, From address and display name, plus one real test
   employee mailbox.
5. **Off-site bucket** (Cloudflare R2 / Backblaze B2 / S3) with access keys.
6. **`ALERT_EMAILS`**: who receives system alerts.
7. **CA decision on R1** (mid-year TDS opening balances) and **HR/CA answers on R2** (payroll rules).
8. **Approval to push** the release branch to GitHub, and later to deploy, to change the router, and
   to import the employee Excel file.
9. Optional: a VPN choice (WireGuard / Tailscale) for remote administration, a second ISP or 4G
   failover, an external uptime monitor account.
