# Final launch report

Date: 27 Nov 2026

## Status: NOT LAUNCHED

No production deployment has happened. No router, firewall or DNS change was made, no employee data
was imported, and no live payroll was run. This is deliberate: the launch gate below has unmet items
that only you can supply. The application is built, hardened and tested on an isolated
production-identical stack on this PC (`eitf-p2test`, loopback only).

## Launch gate

| # | Gate | State |
|---|---|---|
| 1 | All Critical/High security findings fixed | ✅ (`SECURITY_AUDIT.md`) |
| 2 | Automated tests pass on a production-identical stack | ✅ (`TESTING_RESULTS.md`) |
| 3 | Load at 10/15/20/40/50 users within targets | ✅ 0 errors, p95 ≤ 840 ms |
| 4 | Backup encrypted + restore verified | ✅ locally · ⛔ off-site (no bucket) |
| 5 | Dedicated 24/7 server with UPS | ⛔ not provided (only this laptop) |
| 6 | Real static public IP, no CGNAT | ⛔ unverified (router WAN IP needed) |
| 7 | Domain + trusted TLS certificate | ⛔ no domain |
| 8 | Real OTP email received in a test inbox | ⛔ no SMTP credentials |
| 9 | Monitoring alerts delivered | ⛔ needs SMTP + `ALERT_EMAILS` |
| 10 | Payroll rules confirmed (R2) and mid-year TDS resolved (R1) | ⛔ business / CA decision |
| 11 | Employee Excel validated in preview with 0 errors | ⏳ after gates 5–9 |
| 12 | Your written approval to go live | ⏳ |

## Launch sequence (once gates 5–10 are green)

1. **Day −3:** deploy on the server (`PRODUCTION_DEPLOYMENT_GUIDE.md`), run the 12 post-install
   checks, create the break-glass Super Admin.
2. **Day −2:** preview the employee Excel until there are 0 errors; take a backup; Super Admin
   imports; spot-check 5 employees.
3. **Day −1:** HR completes statutory details (PAN, UAN, bank account); a pilot group of 5 employees
   tests OTP login, attendance and leave on their phones.
4. **Day 0:** announce to all staff (login instructions: mobile number → code in your email).
   IT watches system health and the login-failure count during the 09:00–10:30 rush.
5. **First month:** run payroll as a **parallel dry run** next to the current process. Compare every
   payslip, have the CA sign off, and only then approve the first live payroll.
6. **Week +1:** first monthly restore test; review alerts and the audit log.

## Rollback

Until the first live payroll is approved, rollback is simply "keep using the current process": the
HRMS holds no data that exists nowhere else. After that, use the backup restore and the previous
release tag (`DISASTER_RECOVERY_PLAN.md`).

## Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| Management | | | |
| HR head | | | |
| CA (payroll / TDS) | | | |
| IT owner | | | |
