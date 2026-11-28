# Final deployment guide (your Windows server)

Do these steps in order on the server. Each step lists who does it. Steps marked **(you)** need
your credentials, accounts or physical access; they can't be done from the build environment.

| # | Step | Who | Reference |
|---|---|---|---|
| 0 | Run the read-only readiness check and send the output | you | `deploy\windows\server-check.ps1` |
| 1 | Decide the OS: upgrade Windows 10 → Windows 11 Pro, or install Ubuntu 24.04 (back up first) | **you (approval)** | `FINAL_SERVER_CONFIGURATION.md` §1 |
| 2 | BIOS: power on after AC loss; UPS connected; wired Ethernet; reserve the LAN IP on the router | you (physical) | `WINDOWS_SERVER_DEPLOYMENT.md` §3 |
| 3 | Install WSL 2 + Docker Desktop (or Docker Engine on Ubuntu) | you / me via VPN | §2 |
| 4 | `git clone` the repository, check out the release (after the PR is merged: `main` or a tag) | you / me | §4 |
| 5 | Create `.env.production` with generated secrets; restrict file permissions | you / me | §4 |
| 6 | Google Workspace: app password or SMTP relay; SPF + DKIM | **you (Admin console)** | §5 |
| 7 | Domain + DNS A record → static IP | **you (registrar)** | `FINAL_SERVER_CONFIGURATION.md` §4 |
| 8 | Check for CGNAT: router WAN IP = public IP | **you (router)** | `SERVER_CONFIGURATION.md` §3 |
| 9 | Start the stack: `deploy\up.ps1` (refuses example secrets) | you / me | §6 |
| 10 | Create the Super Admin on the console (one-time password shown once) | **you** | `FINAL_ADMIN_ACCESS_GUIDE.md` |
| 11 | Windows Firewall rules (`firewall.ps1 -Apply`); router forwards 80/443 only | **you (router)** | §7 |
| 12 | Let's Encrypt certificate, switch nginx to HTTPS | you / me | `PRODUCTION_DEPLOYMENT_GUIDE.md` §7 |
| 13 | Backup key pair (on an admin PC), off-site bucket, `backup.sh once`, restore test | **you (bucket)** | `FINAL_BACKUP_RECOVERY_GUIDE.md` |
| 14 | Launch checks: health, real OTP email, login per role, external access from mobile data, pentest, load test, restart test | you + me | `PRODUCTION_DEPLOYMENT_GUIDE.md` §8 |
| 15 | Enter TDS opening balances for Apr–Nov (CA-verified) | **you / CA** | Payroll → TDS Opening Balances |
| 16 | Employee Excel: preview → fix errors → backup → Super Admin import | **you (file + approval)** | `EMPLOYEE_EXCEL_IMPORT_GUIDE.md` |

## Upgrading an existing installation

```powershell
docker compose --env-file .env.production exec db-backup /bin/sh /usr/local/bin/backup.sh once
git fetch; git checkout <new tag>
Get-Content deploy\preflight\duplicate-contacts.sql | docker compose --env-file .env.production exec -T postgres psql -U eitf -d eitf_hrms
powershell -ExecutionPolicy Bypass -File deploy\up.ps1
```

The duplicate-contacts check must print 0 rows. Migrations run automatically at start; all of them
are additive or validated.

## Rollback

Check out the previous tag and run `deploy\up.ps1` again. If a migration changed data, restore the
pre-update backup (`FINAL_BACKUP_RECOVERY_GUIDE.md`). Before the first live payroll, the existing
process stays the fallback.
