# Production deployment guide

Target: your own always-on server with a static public IP, reachable from anywhere over HTTPS with a
publicly trusted certificate. Read `SERVER_CONFIGURATION.md` first and finish its CGNAT check.

**Nothing in this guide has been run on the production server yet.** Everything except the
internet-facing steps (domain, router, Let's Encrypt, real SMTP, off-site bucket) has been rehearsed
on an isolated test stack on this PC; see `TESTING_RESULTS.md`.

## 0. Prerequisites (owner: you)

- [ ] Dedicated server machine with a UPS (see sizing in `SERVER_CONFIGURATION.md`)
- [ ] Confirmed real static public IPv4 (WAN IP on the router = public IP)
- [ ] Domain or sub-domain, for example `hrms.yourcompany.com`, with an **A record → static IP**
- [ ] SMTP account and a test employee mailbox (`EMAIL_OTP_SETUP.md`)
- [ ] Off-site bucket and rclone credentials, plus an age key pair made on an admin PC (`DATABASE_BACKUP_AND_RESTORE.md`)
- [ ] `ALERT_EMAILS` recipients
- [ ] Payroll decisions and CA sign-off on mid-year TDS (`PROJECT_FINAL_STATUS.md`, R1–R2)

## 1. Prepare the host (Ubuntu 24.04 LTS recommended)

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git ufw unattended-upgrades
curl -fsSL https://get.docker.com | sudo sh        # Docker Engine + Compose plugin
sudo usermod -aG docker $USER                       # log out and back in
sudo dpkg-reconfigure -plow unattended-upgrades     # automatic security updates
```

Set a DHCP reservation for the server on the router and check the server's clock (NTP).

## 2. Get the release

```bash
sudo mkdir -p /opt/eitf-hrms && sudo chown $USER /opt/eitf-hrms
git clone https://github.com/adarshkumar077/hrms-payroll-system.git /opt/eitf-hrms
cd /opt/eitf-hrms
git checkout release/2026-11-production-hardening   # or the tag created at sign-off
```

## 3. Configure secrets

```bash
cp .env.production.example .env.production && chmod 600 .env.production
for k in POSTGRES_PASSWORD APP_DB_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET \
         INTEGRATION_SECRET_KEY OTP_HASH_SECRET STORAGE_SIGNING_SECRET; do
  sed -i "s|^$k=.*|$k=$(openssl rand -hex 32)|" .env.production
done
nano .env.production
```

Set at least:

```ini
PUBLIC_APP_URL=https://hrms.yourcompany.com
CORS_ORIGINS=https://hrms.yourcompany.com
COOKIE_SECURE=true
TRUST_PROXY=1
PUBLIC_HTTP_PORT=80
PUBLIC_HTTPS_PORT=443
TLS_CHECK_HOST=hrms.yourcompany.com
SMTP_HOST=…  SMTP_PORT=587  SMTP_USER=…  SMTP_PASSWORD=…  SMTP_FROM_EMAIL=…  SMTP_FROM_NAME=EITF HRMS
SUPPORT_CONTACT=…
ALERT_EMAILS=…
BACKUP_AGE_RECIPIENT=age1…          # public key only
BACKUP_RCLONE_REMOTE=r2:eitf-hrms-backups
BOOTSTRAP_ADMIN_EMAIL=…             # first Super Admin; remove both lines after first start
BOOTSTRAP_ADMIN_PASSWORD=…
```

Put the rclone config in `deploy/backup/rclone/rclone.conf` (`chmod 600`). Copy `.env.production` to
the company password manager.

## 4. Firewall

Follow `PRODUCTION-FIREWALL.md`: ufw allows 80/443, SSH only from the admin PC or VPN, and the
`DOCKER-USER` rules are applied.

## 5. First start (HTTP only, for certificate validation)

```bash
docker compose --env-file .env.production up -d --build
docker compose ps                 # all services healthy
curl -fsS http://localhost:${PUBLIC_HTTP_PORT:-8080}/api/v1/health
```

## 6. Router

Forward TCP 80 and 443 to the server, and nothing else (`SERVER_CONFIGURATION.md` §4). From a phone on
mobile data, `http://hrms.yourcompany.com/api/v1/health` should answer.

## 7. Let's Encrypt certificate and HTTPS

```bash
docker compose --env-file .env.production --profile ssl run --rm certbot certonly \
  --webroot -w /var/www/certbot -d hrms.yourcompany.com --email it@yourcompany.com --agree-tos --no-eff-email
```

Enable the SSL server block:

```bash
sed 's/YOUR_DOMAIN/hrms.yourcompany.com/g' deploy/nginx/conf.d/eitf-hrms-ssl.conf.template \
  > deploy/nginx/conf.d/eitf-hrms-ssl.conf
```

Then restart with the `ssl` profile:

```bash
docker compose --env-file .env.production --profile ssl up -d
curl -I https://hrms.yourcompany.com        # 200, HSTS header present, no certificate warning
```

Check the result with an external TLS test (for example SSL Labs): grade A expected.

## 8. Post-install checks (launch gate)

| # | Check | Pass when |
|---|---|---|
| 1 | `docker compose ps` | all healthy |
| 2 | API log shows `Applying least-privilege database role eitf_app` | present (`APP_DB_PASSWORD` set) |
| 3 | Sign in as Super Admin | forced password change, then enable 2FA |
| 4 | `GET /api/v1/admin/email/status` and then `POST /api/v1/admin/email/test` | test email received |
| 5 | Mobile OTP for a test employee | **real email arrives** and login works (`EMAIL_OTP_SETUP.md` §4) |
| 6 | `backup.sh once` | `last_status.json` shows `ok`, `encrypted`, `offsite: ok` |
| 7 | Restore that backup into a scratch database | row counts match |
| 8 | `GET /api/v1/admin/system-health?refresh=1` | no critical items |
| 9 | `node scripts/security-pentest.mjs https://hrms.yourcompany.com` | 0 findings |
| 10 | `LOAD_TEST_USER=… LOAD_TEST_PASS=… node scripts/load-test.mjs https://hrms.yourcompany.com 50` | 0 failures |
| 11 | External uptime monitor on `/api/v1/health` | alerting to `ALERT_EMAILS` |
| 12 | Remove the `BOOTSTRAP_ADMIN_*` lines and restart `api` | done |

Only after all 12 pass: import employees (`EMPLOYEE_EXCEL_IMPORT_GUIDE.md`), then the payroll
dry-run month (`FINAL_LAUNCH_REPORT.md`).

## 9. Updates

```bash
cd /opt/eitf-hrms
docker compose exec db-backup /bin/sh /usr/local/bin/backup.sh once     # backup first
git fetch && git checkout <new tag>
docker compose --env-file .env.production up -d --build                  # migrations run automatically
```

Rollback: check out the previous tag and run `up -d --build`. If a migration changed data, restore the
pre-update backup (`DATABASE_BACKUP_AND_RESTORE.md`).

## 10. Upgrading a volume created by an older (root) image

The API now runs as uid 1000. An uploads volume created by an older image must be re-owned once:

```bash
docker compose run --rm --user root --entrypoint chown api -R node:node /app/apps/api/uploads
```
