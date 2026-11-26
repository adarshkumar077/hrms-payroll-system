# EITF HRMS & Payroll: Daily Work Progress Report

**Date:** 26 November 2026
**Scope:** Local development PC and an isolated Docker test environment. No server was deployed, and the development database was not reset.

---

## 1. Today's Completed Work
- **Local setup:** built and ran the application locally (web, API and PostgreSQL database); both builds passed.
- **Deployment plan:** prepared the server deployment plan (static IP, HTTPS, firewall, backups, auto-restart).
- **Mobile Number + OTP login:** built end to end (server, login page, database change, MSG91 SMS integration), then code-reviewed and improved it.
- **Employee data protection:** fixed 6 places where an employee could see or change other employees' data. Admin-only menu items are now hidden from employees.
- **Deployment preparation:**
  - Stopped two scripts that deactivated an employee and reset HR policy settings on every restart.
  - Added the HTTPS-by-IP setup.
  - Fixed two problems that stopped the production Docker version from working.
- **Production readiness (Phase 2):**
  - Admin and HR must now change their password at first login.
  - Payroll no longer fails for large companies.
  - Fixed two security issues (fake IP addresses and spreadsheet formula injection).
  - Tested backups, recovery, payroll load and security.
- **Documentation:** wrote the deployment, firewall, SMS setup and readiness documents.

## 2. Working Features
- **Logins:** Password Login for Super Admin, Admin, HR and Employee, including forced password change, account lockout after 5 wrong attempts, and login rate limiting.
- **Mobile OTP login (employees only):**
  - 6-digit code, 5-minute expiry, single use, 30-second resend, maximum 5 wrong attempts, rate limits.
  - Without SMS settings, it shows a clear "SMS provider not configured" message.
- **Data protection:** employees see only their own data, and admin-only pages are blocked for them.
- **Payroll:** generation and approval tested up to 452 employees. The figures add up correctly (gross − deductions = net), and an approved month can't be regenerated.
- **Reports and exports:** reports and Excel/PDF/CSV exports work.
- **Production Docker version:** HTTPS, all 6 services healthy, and only the web gateway (nginx) is reachable from outside.
- **Backups:** encrypted backup, off-site upload (tested against a stand-in for cloud storage) and full restore, with the restored data matching exactly.
- **Recovery:** the system recovers automatically after a container restart or a database crash, with no data loss.

## 3. Pending Work
- MSG91 SMS credentials and DLT template approval (the settings are still empty).
- Server purchase or setup, and the actual deployment.
- Firewall setup and a reboot test on the real server.
- Testing logins from another computer and a mobile phone.
- An off-site backup bucket (Cloudflare R2, Backblaze B2 or AWS S3), and a backup of uploaded documents and selfies.
- A decision on mid-year TDS (see Issues).
- OTP login in the mobile app (it still uses password login).
- Saving the code changes in version control (this folder is not a git repository).

## 4. Issues/Bugs
| Issue | Impact | Status |
|---|---|---|
| TDS counts only salary paid inside this system. Going live mid-year without the earlier months' salary and TDS calculates far too little TDS (example: ₹0 instead of ₹42,952 a month) | **Critical for payroll** | Open: needs a decision with the CA |
| A failed off-site backup upload is logged but not reported as a failure | Medium | Open: monitoring needed |
| Uploaded documents and selfies are not included in the database backup | Medium | Open |
| The attendance-sheet Excel export is slow (4.2 seconds for 50 employees) | Medium at larger sizes | Open |
| In salary setup, allowances are added on top of the entered "gross"; entering the gross and also splitting it into allowances would double the pay | Medium (HR training) | Open |
| The default password rules are weak (8 characters, no complexity) | Low | Open: can be changed in Settings |

**Found and fixed today:** web container would not start; first-run database setup failed; payroll failed for 452 employees; IP spoofing allowed rate-limit bypass; CSV formula injection; Admin/HR not forced to change password; 6 employee data leaks.

## 5. Added/Removed
**Added:**
- Mobile OTP login (server, login screen, database migration `20261126120000_otp_login_hardening`).
- MSG91 SMS integration.
- HTTPS-by-IP configuration and a certificate script.
- Firewall guide, SMS setup guide, readiness report.
- New automated tests.

**Changed:**
- Login page: **Password Login** / **Mobile OTP Login** tabs.
- Payroll processing time limit.
- Both Dockerfiles.
- nginx configuration.
- Settings templates and Docker configuration.
- Admin and HR first-login rule.

**Removed or disabled:**
- The screen that displayed the OTP during development.
- The message "Mobile OTP login is not available yet".
- Employee access to company-wide data export.
- Import/Export and Approval Inbox from the employee menu.
- Automatic running of the employee-deactivation and policy-reset scripts (the scripts are kept for manual use).
- A server setting that would have blocked camera and GPS attendance.

## 6. Testing Results
| Test | Result |
|---|---|
| Automated unit tests | **212 / 212 passed** |
| OTP and login end-to-end tests | **52 / 52 passed** |
| Docker production readiness (10 steps) | **All passed** (23/23 checks) |
| Roles and password rules | **41 / 41 passed** |
| Security attack tests | **15 / 15 passed** (after fixes) |
| 109 system endpoints (Super Admin + Employee) | **0 server errors** |
| Payroll load: 10 / 15 / 20 / 50 / 452 employees | **Passed**; 452 failed before the fix and passed after it |
| Backup → off-site → restore | **Passed**; restored data identical |
| Recovery: restart, database crash, stop/start | **Passed**; no data loss |
| Real SMS, server firewall, server reboot, other devices | **Not tested** (need credentials, a server and devices) |

## 7. Next Steps
1. Get MSG91 credentials and DLT template approval, then send one test OTP.
2. Decide the mid-year TDS approach with the CA.
3. Arrange the server (Ubuntu 24.04, 4 CPU / 8 GB / 100 GB SSD, static IP).
4. Set up an off-site backup bucket and backups for uploaded files.
5. Deploy to the server; apply the firewall rules; test a reboot and logins from other devices.
6. Run a pilot payroll with one department and reconcile it against the current system.

## 8. Launch Status
**Not ready for live launch.**
**Ready for deployment to a staging or pilot server.**

The application, security, backups and recovery passed testing on this PC. Live launch still needs: SMS credentials, the mid-year TDS decision, setup and testing on the real server, an off-site backup destination, and a successful pilot payroll.
