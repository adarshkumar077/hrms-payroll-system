# Final project status: EITF HRMS & Payroll

Date: 28 Nov 2026 · Branch `release/2026-11-production-hardening` (pushed to GitHub, CI green) ·
Pull request into `main`: **not created yet** (needs your GitHub sign-in) · **Not deployed; not live.**

## Decision

**The software is complete and tested for launch. The launch itself is blocked** by items only you
can provide: the server OS decision, the domain, Google Workspace SMTP, the off-site bucket, the
CA-verified TDS figures and your approvals. The employee Excel file is **not** requested yet,
because the pre-Excel checklist below is not complete.

## Pre-Excel checklist

| # | Item | Status |
|---|---|---|
| 1 | All development complete (no dummy features) | ✅ Fake-success stubs removed or made honest; MSG91 fully removed |
| 2 | Mandatory security fixes | ✅ app (0 open Critical/High) · ⛔ server OS (Windows 10 EOL) |
| 3 | Email OTP with **real** delivery | ⛔ built and e2e-tested with a mock server; **needs Google Workspace credentials** |
| 4 | Super Admin created and tested | ✅ console procedure tested on the test stack · ⏳ production account is created by you at deployment (`FINAL_ADMIN_ACCESS_GUIDE.md`) |
| 5 | Admin and HR permissions verified | ✅ 77/77 role and isolation checks |
| 6 | Employee dashboard ready | ✅ own profile, payslips, attendance, leave (role-tested) |
| 7 | Attendance tested | ✅ unit/integration · ⛔ selfie + GPS on a real phone needs the HTTPS site |
| 8 | Payroll tested | ✅ calculator, statutory, ESD, TDS projection · ⛔ your company-specific rules (R2) |
| 9 | TDS opening balance resolved with an approved approach | ✅ mechanism built and tested (Payroll → TDS Opening Balances) · ⛔ **CA approval + the Apr–Nov figures** |
| 10 | Reports and exports | ✅ engine tested; report email now real (needs SMTP) |
| 11 | Server deployment verified | ⛔ not deployed (no access to your server) |
| 12 | Public HTTPS | ⛔ needs a domain |
| 13 | Database private | ✅ not published; least-privilege role verified |
| 14 | Backup and restore | ✅ encrypted backup + restore verified · ⛔ off-site needs a bucket |
| 15 | Monitoring | ✅ built and tested · ⛔ alert delivery needs SMTP + `ALERT_EMAILS` |
| 16 | Mobile and desktop access | ✅ responsive pages, local · ⛔ external/mobile check needs deployment |
| 17 | Employee Excel import ready | ✅ preview, validation, error report, backup check, Super Admin commit (`EMPLOYEE_EXCEL_IMPORT_GUIDE.md`) |
| 18 | No critical/high vulnerabilities | ✅ application · ⛔ OS |
| 19 | GitHub release and rollback prepared | ✅ branch pushed, CI green, rollback documented · ⛔ PR not created, merge needs your approval |

## Done in this release (highlights)

* Email OTP login (Google Workspace / any SMTP); MSG91 removed.
* Mandatory unique mobile and email.
* Secure employee import.
* Real encrypted backups of database and files, with restore tooling.
* Monitoring and alerts.
* Hardening:
  * non-root containers on Node 22;
  * DML-only database role;
  * office-sized rate limits plus a failed-login limiter.
* **Final round:**
  * secure Super Admin provisioning and recovery from the server console;
  * web setup disabled in production;
  * cryptographic initial passwords and a stronger password policy;
  * fake integrations removed;
  * real report and welcome emails;
  * TDS opening balances;
  * payroll menu aligned with permissions;
  * Windows server kit (read-only readiness check, firewall script, Google Workspace guide);
  * CI fixed.

## What I need from you

1. **Create the pull request** on GitHub (link in the final message), review it, and approve the merge.
2. **Server:** run `deploy\windows\server-check.ps1` and send me the output; **decide** Windows 11 upgrade / Ubuntu / commercial ESU.
3. **Router WAN IP** (CGNAT check) and a **domain name** with DNS access.
4. **Google Workspace:** an app password for a sending mailbox, or the SMTP relay for your static IP; one test employee inbox.
5. **Off-site backup bucket** + access key; generate an age key pair on an admin PC; `ALERT_EMAILS`.
6. **CA:** approve the opening-balance approach and provide Apr–Nov 2026 taxable gross / TDS / PT per employee.
7. **HR/CA payroll rules:** PF fixed ₹3,600 vs statutory 12 %, ESD interest/TDS, ULOB 2-day rule, PL cap and probation, overtime 1.5×, who runs payroll (now Super Admin only).
8. **Policy:** selfie retention period; whether to make the GitHub repository private.
9. **Access:** a way for me to work on the server (VPN or remote session), or run the deployment steps yourself with the guides.

Only after 2–6 are done and the deployed site passes the launch checks will I ask for the employee
master Excel file.
