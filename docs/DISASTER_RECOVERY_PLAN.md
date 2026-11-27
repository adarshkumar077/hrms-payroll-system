# Disaster recovery plan

| Objective | Target |
|---|---|
| **RPO** (maximum data loss) | 24 hours: nightly backup, plus an on-demand backup before every payroll approval and update |
| **RTO** (time to be back online) | 4 hours on spare hardware, given the items in the "keep off the server" list |

## Keep off the server (two copies: password manager + sealed offline copy)

1. `.env.production` (all secrets)
2. age **private** backup key (`eitf-backup.key`)
3. rclone / bucket credentials
4. Domain registrar and DNS login
5. Router admin password and a screenshot of its port-forwarding page
6. This document, printed

Without item 2 the encrypted backups **cannot be read**. Test that the stored copy works during each
quarterly drill.

## Scenarios

| Scenario | First action | Recovery |
|---|---|---|
| Server won't boot / disk failure | Tell staff the system is down (WhatsApp/email template below) | §A: rebuild on spare hardware from the off-site backup |
| Ransomware / suspected compromise | **Unplug the network cable**; don't pay or wipe yet | Preserve the disk for investigation; §A on clean hardware; rotate **all** secrets; inform the CERT-In contact within 6 hours (Indian rules) and assess DPDP breach-notification duties |
| Accidental data deletion / bad import | Stop `api` | Restore the latest good backup into a scratch DB, then copy back the affected rows or do a full restore (`DATABASE_BACKUP_AND_RESTORE.md`) |
| Bad update | — | Check out the previous tag, `up -d --build`; restore the pre-update backup if migrations changed data |
| Internet outage | — | The LAN still works at `https://<server LAN IP>` only if the company CA is installed; otherwise wait. Consider a second ISP / 4G failover on the router |
| Power cut | UPS signals shutdown | The server restarts automatically (BIOS *power on after AC loss*; Docker `restart: unless-stopped`) |
| Lost Super Admin access | — | Use the **break-glass** Super Admin account (created at launch, 2FA on, credentials sealed with the secrets above) to reset the primary account. Create it on launch day; there is no other supported recovery path |
| Certificate expired | Monitoring warns 21 days ahead | `docker compose --profile ssl run --rm certbot renew` then reload nginx |

## §A Rebuild on new hardware

1. Install the OS and Docker (`PRODUCTION_DEPLOYMENT_GUIDE.md` §1–2), check out the **same release
   tag**.
2. Restore `.env.production` and `deploy/backup/rclone/rclone.conf` from the password manager.
3. `docker compose --env-file .env.production up -d postgres redis db-backup`
4. Download and restore the latest database backup:
   ```bash
   docker cp eitf-backup.key eitf-hrms-db-backup:/tmp/age.key
   docker compose exec -e BACKUP_AGE_IDENTITY_FILE=/tmp/age.key db-backup \
     sh /usr/local/bin/restore.sh --yes r2:eitf-hrms-backups/eitf_hrms_<latest>.dump.age
   ```
5. Restore the uploads archive into the uploads volume (into an empty folder, see the backup guide),
   then fix ownership:
   `docker compose run --rm --user root --entrypoint chown api -R node:node /app/apps/api/uploads`
6. `docker compose --env-file .env.production up -d --build`
7. If the public IP changed, update the DNS A record; on the router, forward 80/443 to the new server.
8. Run the launch-gate checks 1, 3, 4, 6 and 8 (`PRODUCTION_DEPLOYMENT_GUIDE.md` §8).
9. `docker compose exec db-backup rm -f /tmp/age.key`, and record the incident.

## Drills

| Frequency | Drill | Owner |
|---|---|---|
| Monthly | Restore the latest off-site backup into a scratch database; compare employee and payslip counts | IT |
| Quarterly | Full §A rebuild on a spare PC, timed against the 4-hour RTO | IT + HR witness |
| Yearly | Review this plan, contacts and secrets rotation | Management |

## Contacts (fill in)

| Role | Name | Phone | Email |
|---|---|---|---|
| IT owner | | | |
| Backup IT person | | | |
| ISP support (static IP) | | | |
| Domain / DNS provider | | | |
| HR head (staff communication) | | | |

## Staff message template

> The HRMS portal is temporarily unavailable due to a technical issue. Please note your attendance
> times; HR will record them once service is restored. Expected update: <time>. — IT
