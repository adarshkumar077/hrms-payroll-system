# EITF HRMS: Hosting on your own dedicated server

Authoritative hosting plan for running the EITF HRMS + Payroll system on a machine **you own** (an on-premise server in your office, or a dedicated / bare-metal server you rent or buy). It is written for the IT person who installs and runs it, with a one-page summary for the business owner first.

Every command, variable, port, service and path below was checked against the repository (`docker-compose.yml`, `.env.production.example`, `apps/api/docker-entrypoint.sh`, `deploy/`, `scripts/`). Where an older document disagrees with the code, this guide follows the code. See [Section 14](#14-superseded-or-stale-material-in-older-docs).

Contents

1. [Executive summary (for the business owner)](#1-executive-summary-for-the-business-owner)
2. [Hardware sizing](#2-hardware-sizing)
3. [Software prerequisites](#3-software-prerequisites)
4. [Network and domain](#4-network-and-domain)
5. [Step-by-step install](#5-step-by-step-install)
6. [Data and storage](#6-data-and-storage)
7. [Backups and disaster recovery](#7-backups-and-disaster-recovery)
8. [Monitoring and operations](#8-monitoring-and-operations)
9. [Security hardening checklist](#9-security-hardening-checklist)
10. [Upgrades and releases](#10-upgrades-and-releases)
11. [Go-live checklist](#11-go-live-checklist)
12. [Handover](#12-handover)
13. [Troubleshooting](#13-troubleshooting)
14. [Superseded or stale material in older docs](#14-superseded-or-stale-material-in-older-docs)

---

## 1. Executive summary (for the business owner)

**What runs.** One server runs six containers under Docker Compose: a web front end (Next.js), the API (NestJS), a PostgreSQL 16 database, a Redis 7 cache, an nginx reverse proxy, and a nightly encrypted backup job. An optional Cloudflare Tunnel container gives secure internet access without opening any port on your office router. Employees use it in a browser and in a mobile app. Staff data stays on your machine, apart from the encrypted nightly backup copy that goes to a storage account you control.

**What you must provide.**

| Item | Who | Notes |
|---|---|---|
| A server (see [Section 2](#2-hardware-sizing)) with a UPS, in a locked, cooled room | You | Dedicated to this system |
| A domain name (for example `hrms.yourcompany.com`) | You | You must own the registrar account |
| Internet access: a static public IP **or** a free Cloudflare account (Tunnel) | You | Tunnel works behind NAT with no static IP |
| An off-site backup bucket (Cloudflare R2, Backblaze B2 or AWS S3) | You | Required for disaster recovery |
| A Chartered Accountant to verify the statutory payroll rules | You | **Mandatory before the first live payroll** |
| Expo, Apple Developer and Google Play accounts | You | Only for the mobile app |
| An SMTP mailbox for OTP emails (company mail, Google Workspace, Microsoft 365, Zoho, Amazon SES, Brevo …) | You | Email OTP is built in; it needs SMTP host, port, user, password and a From address ([`EMAIL_OTP_SETUP.md`](EMAIL_OTP_SETUP.md)) |
| An IT person for about 2 hours per week | You | See the operations checklist in [Section 8](#8-monitoring-and-operations) |

**Indicative monthly running cost in India (INR).** These are planning ranges, not quotes. Check current prices.

| Cost line | Range per month | Notes |
|---|---|---|
| Server hardware, amortised over 4 to 5 years | Rs 1,500 to Rs 12,000 | Small tier about Rs 70,000 to Rs 1,00,000 one time. Large tier about Rs 3,00,000 to Rs 5,00,000 |
| Electricity and UPS battery replacement | Rs 300 to Rs 1,500 | Server runs 24x7 |
| Domain name | Rs 60 to Rs 150 | About Rs 700 to Rs 1,800 per year |
| Cloudflare Tunnel and DNS | Rs 0 | Free plan is enough |
| Off-site backup storage (R2 / B2 / S3) | Rs 0 to Rs 500 | Database dumps are small. Add storage if selfies and documents go to object storage ([Section 6](#6-data-and-storage)) |
| SMS gateway | Rs 0 until integrated | Typically about Rs 0.15 to Rs 0.25 per OTP SMS once live, plus a one-time DLT registration |
| Internet connection | Existing | A business line with a stable uplink is recommended |
| **Total running cost (excluding staff time and hardware amortisation)** | **about Rs 400 to Rs 2,500** | |

**Go-live timeline (typical).**

| Week | Activity |
|---|---|
| 0 | Order hardware, register domain, create Cloudflare and backup-storage accounts |
| 1 | OS install, hardening, application install, first backup and restore drill |
| 1 to 2 | CA verifies statutory payroll rules; HR enters employees and salary configuration; EPFO trial upload |
| 2 to 3 | Smoke, security and load tests; mobile builds submitted to the stores |
| 3 to 4 | Pilot with one department for one full payroll cycle, reconciled against the current system |
| 4 to 5 | Go-live for all staff after owner sign-off on the checklist in [Section 11](#11-go-live-checklist) |

Store review for the mobile app can add several days to a week or more. If you can use the web app on phones at first, the mobile app does not need to block go-live.

---

## 2. Hardware sizing

The application runs as a **single server** (no clustering, no zero-downtime upgrades). Sizing below is an engineering estimate. The load scripts in `scripts/` have not been run against a production host by the development team, and `docs/PERFORMANCE-REPORT.md` is still an empty template, so confirm with the tests in [Section 11](#11-go-live-checklist) and fill that report in.

| | Up to 50 employees | Up to 200 employees | Up to 1,000 employees |
|---|---|---|---|
| CPU | 4 cores (x86-64) | 4 to 8 cores | 8 to 16 cores |
| RAM | 8 GB | 16 GB | 32 GB |
| System SSD | 256 GB | 512 GB | 1 TB NVMe |
| Disk layout | 2 x SSD, RAID 1 (recommended) | 2 x SSD, RAID 1 | 2 x NVMe, RAID 1 |
| Growth if selfies and documents stay on the local volume | about 5 GB per year | about 20 GB per year | about 100 GB per year |
| UPS | 600 VA line-interactive, 10+ minutes runtime | 1 kVA | 1.5 to 2 kVA, plus automatic shutdown via NUT or apcupsd |
| Network | 100 Mbps, static IP or Cloudflare Tunnel | 100 Mbps to 1 Gbps | 1 Gbps; static IP or Tunnel; consider a second ISP link |
| Off-site backups | Required | Required | Required, plus a second backup destination |

Notes:

- **Minimum from the repository:** `AUDIT-REPORT.md` says 4 GB RAM, 2 vCPU and 40 GB SSD for a small VPS. The tiers above add headroom for Docker image builds (the API and web images compile on the server), the nightly dump and RAID resilience.
- **Growth estimate assumptions.** About 2 selfie punches per working day, about 260 working days per year, about 100 to 150 KB per selfie (the API accepts up to 2 MB per selfie, so real sizes depend on the phone camera), plus HR documents of about 5 to 20 MB per employee per year. That is roughly 60 to 170 MB per employee per year. The figures in the table use about 100 MB per employee per year. Measure your own after the pilot with `docker system df -v`.
- Database size is small by comparison (tens to a few hundred MB per year at these sizes) once selfies are in object storage (the `db:migrate-selfies` step in [Section 6](#6-data-and-storage)).
- **Docker data directory.** All volumes live under `/var/lib/docker`. Make sure that path is on the large SSD.
- **RAID 1** protects against a single disk failure only. It is not a backup. The off-site encrypted backup in [Section 7](#7-backups-and-disaster-recovery) is still required.
- **Reliability.** Use a server with ECC RAM for the 200 and 1,000 tiers if budget allows. Use a good-quality branded server or workstation, not a laptop.
- **Network without a static IP.** Use Cloudflare Tunnel ([Section 4](#4-network-and-domain), option A). It makes an outbound connection only, so it works behind NAT, a carrier-grade NAT or a dynamic IP.

---

## 3. Software prerequisites

| Software | Version / source | Purpose |
|---|---|---|
| Ubuntu Server | **24.04 LTS** (recommended; standard support to 2029). 22.04 LTS also works (`deploy/vps-install.sh` targets 22.04 and 24.04). Debian 12 is an acceptable alternative | Host OS |
| Docker Engine | Current stable release from Docker's official apt repository | Runs all containers |
| Docker Compose plugin | v2.24 or later (`docker compose`, not the old `docker-compose`). The repo uses `include:` (v2.20+); the optional port-binding override in Section 4 uses `!override` (v2.24+) | Orchestration |
| git | from Ubuntu apt | Fetch the source |
| ufw | from Ubuntu apt | Host firewall (read the Docker caveat in Section 4) |
| fail2ban | from Ubuntu apt | SSH brute-force protection |
| unattended-upgrades | from Ubuntu apt | Automatic security patches |
| chrony | from Ubuntu apt | Time sync (required: JWT expiry, 2FA codes and scheduled jobs depend on a correct clock) |
| age | from Ubuntu apt (universe) | **Only on the admin workstation** for the backup key pair. Not needed on the server because `db-backup` has its own copy |
| rclone | from Ubuntu apt (universe) | Optional on the server, for listing and downloading backups by hand. The `db-backup` container already includes it |
| Node.js | 20 or newer | **Only** where you run the test scripts in `scripts/*.mjs` (they use the built-in `fetch`). Not needed to run the application, which builds inside Docker from `node:20-bookworm-slim` |

**Timezone.** The application schedules its jobs in **Asia/Kolkata**: auto check-out at 21:00 IST (`@Cron('0 21 * * *', { timeZone: 'Asia/Kolkata' })` in `apps/api/src/attendance/attendance.service.ts`) and an hourly job at minute 8 in IST. The nightly database backup uses **UTC** (`BACKUP_HOUR_UTC`, default 20 = 01:30 IST). Set the server clock correctly and set the OS timezone to IST so that log timestamps and cron entries are unambiguous:

```bash
sudo timedatectl set-timezone Asia/Kolkata
timedatectl          # "System clock synchronized: yes" and "NTP service: active"
```

---

## 4. Network and domain

Choose **one** option. Option A is recommended for most offices.

| | A. Cloudflare Tunnel | B. Public static IP + nginx + Let's Encrypt | C. LAN-only intranet |
|---|---|---|---|
| Open inbound ports | None | 80 and 443 | None on the internet |
| Works behind NAT or dynamic IP | Yes | No | Yes |
| Staff reach it from home / mobile data | Yes | Yes | Only over VPN |
| Certificate | Cloudflare, automatic | Let's Encrypt via the `certbot` profile | Your internal CA (manual) |
| Needs | Domain on Cloudflare DNS, free account | Domain, static IP, ports 80/443 forwarded | Internal DNS, internal CA |
| Mobile app | Works | Works | Works only on the LAN or VPN, and the phones must trust your CA |
| `TRUST_PROXY` | leave empty | leave empty | leave empty |
| Compose profile | `tunnel` | `ssl` | none |
| `.env.production` ports | keep `PUBLIC_HTTP_PORT=8080` | `PUBLIC_HTTP_PORT=80`, `PUBLIC_HTTPS_PORT=443` | `PUBLIC_HTTP_PORT=80`, `PUBLIC_HTTPS_PORT=443` |

### Ports and the firewall

The compose file publishes **only nginx** to the host: `${PUBLIC_HTTP_PORT:-${PUBLIC_PORT:-8080}}:80` and `${PUBLIC_HTTPS_PORT:-8443}:443`. PostgreSQL (5432), Redis (6379), the API (3001) and the web app (3000) have no `ports:` mapping and are reachable only on the internal Docker network `eitf`. Never add a `ports:` entry for the database or Redis.

**Docker bypasses ufw.** Ports that Docker publishes are opened through Docker's own iptables rules, so `ufw deny 8080` does not block them. Because compose binds nginx on all interfaces, the "no open ports" benefit of option A needs the nginx host ports bound to loopback. Do this with an override file (`docker compose` loads `docker-compose.override.yml` automatically, and `deploy/up.sh` and the systemd unit call plain `docker compose`):

```bash
# Option A only (Cloudflare Tunnel). Bind nginx to loopback so nothing is reachable from the LAN.
cat > docker-compose.override.yml <<'EOF'
services:
  nginx:
    ports: !override
      - "127.0.0.1:8080:80"
EOF
```

This was not run in the development environment (no Docker available). After starting the stack, verify from another machine on the LAN that `http://<server-ip>:8080` does **not** answer, and that `curl http://127.0.0.1:8080/api/v1/health` on the server does.

### Option A: Cloudflare Tunnel

1. Add your domain to Cloudflare (change the registrar's nameservers to Cloudflare's).
2. In Cloudflare **Zero Trust** go to **Networks**, then **Tunnels**, then create a tunnel, choose the **Docker** connector and copy the tunnel **token**.
3. Add a **Public Hostname**: subdomain `hrms`, your domain, service type HTTP, URL **`http://nginx:80`**. (`nginx` is the Docker service name; see `deploy/cloudflare/config.yml` and `.env.production.example`.)
4. Put the token in `.env.production` as `CLOUDFLARE_TUNNEL_TOKEN=...`. `deploy/up.sh` detects it and adds `--profile tunnel`.
5. Set `PUBLIC_APP_URL=https://hrms.yourcompany.com` and `CORS_ORIGINS=https://hrms.yourcompany.com`.

The tunnel container (`cloudflared`, image `cloudflare/cloudflared:2024.12.2`) only makes outbound connections. TLS terminates at Cloudflare; the hop from cloudflared to nginx is plain HTTP on the private Docker network, which is why `COOKIE_SECURE=true` still works (the browser sees HTTPS).

DNS record: created by Cloudflare automatically when you add the Public Hostname (a CNAME to `<tunnel-id>.cfargotunnel.com`).

### Option B: Public static IP + nginx + Let's Encrypt

1. DNS: create an **A record** `hrms.yourcompany.com` pointing to your static public IP (and an AAAA record if you have IPv6).
2. Router: forward TCP **80** and **443** to the server. Nothing else.
3. Firewall, using ufw:
   ```bash
   sudo ufw default deny incoming
   sudo ufw default allow outgoing
   sudo ufw allow OpenSSH
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
   Ports 80 and 443 are the only ones you want open to the internet, so the Docker bypass is harmless here. Still do not publish 5432 or 6379.
4. Set in `.env.production`: `PUBLIC_HTTP_PORT=80` and `PUBLIC_HTTPS_PORT=443`.
5. Certificate steps are in [Section 5, step 12](#step-12-ssl-option-b-only).

### Option C: LAN-only intranet

- The browser must reach the app over **HTTPS** because refresh-token cookies are `Secure` (`COOKIE_SECURE=true`) and the web app sends `upgrade-insecure-requests`. Do **not** set `COOKIE_SECURE=false` in a real deployment; that setting exists only for plain-http local development.
- Create an internal DNS name (for example `hrms.corp.local`) pointing to the server, and issue a certificate for it from your internal CA.
- `deploy/nginx/conf.d/eitf-hrms-ssl.conf.template` reads certificates from `/etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem` and `privkey.pem` inside the nginx container, backed by the Docker volume `eitf_certbot_certs`. To use an internal-CA certificate, place your files at `live/<domain>/fullchain.pem` and `live/<domain>/privkey.pem` in that volume, then generate the active config the same way `deploy/certbot/init-letsencrypt.sh` does (`sed "s/YOUR_DOMAIN/<domain>/g" ...template > ...eitf-hrms-ssl.conf` and append the `include` line to `deploy/nginx/conf.d/eitf-hrms.conf`). **This internal-CA procedure is not scripted or tested in the repository.** Test it before relying on it.
- Set `PUBLIC_APP_URL` and `CORS_ORIGINS` to the exact `https://` internal URL.
- Remote or mobile users need a VPN into the office network, and phones must have your CA certificate installed.
- Do not enable the `tunnel` profile.

### `TRUST_PROXY`

Leave `TRUST_PROXY` **empty** for all three options. With an empty value the API trusts only loopback, link-local and private-range proxy hops (nginx, cloudflared, the Docker bridge) and takes the client IP from the first public address in `X-Forwarded-For`, so a client cannot spoof it (`apps/api/src/common/cors-origin.ts`). Set it to `false` only if the API were exposed with no proxy at all (not a supported layout here). This matters for the IP allow-list, login activity and rate limiting. After go-live, log in from a phone on mobile data and confirm Security, then Login activity, shows the phone's public IP and not a `172.x` Docker address (see [Section 13](#13-troubleshooting)).

---

## 5. Step-by-step install

All commands run on the server. Replace `hrms.yourcompany.com` and the e-mail addresses.

### Step 1: Install Ubuntu and update

Install Ubuntu Server 24.04 LTS with a minimal install and OpenSSH server. Use RAID 1 for the system disks if you have two. Then:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git ufw fail2ban unattended-upgrades chrony curl ca-certificates
sudo timedatectl set-timezone Asia/Kolkata
sudo systemctl enable --now chrony
```

### Step 2: Create the deploy user and lock down SSH

```bash
sudo adduser eitf                  # choose a strong password; you will disable password login below
sudo usermod -aG sudo eitf
# From your admin workstation: ssh-copy-id eitf@SERVER_IP   (confirm key login works BEFORE continuing)

sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sudo sshd -t && sudo systemctl reload ssh
```

Keep your existing SSH session open and test a second login before closing it.

### Step 3: Firewall, fail2ban and automatic updates

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
# Option B only: sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades     # answer Yes
```

### Step 4: Install Docker Engine and the Compose plugin

Use Docker's official apt repository (instructions at docs.docker.com/engine/install/ubuntu), which installs `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin` and `docker-compose-plugin`. (`deploy/vps-install.sh` uses the `get.docker.com` convenience script instead; that is acceptable for a first install but the apt repository gives you controlled upgrades.)

```bash
sudo usermod -aG docker eitf
newgrp docker
docker --version
docker compose version          # must print v2.x (v2.24+ if you use the override file)
```

### Step 5: Get the source

```bash
sudo mkdir -p /opt/eitf-hrms
sudo chown eitf:eitf /opt/eitf-hrms
git clone <YOUR_REPO_URL> /opt/eitf-hrms
cd /opt/eitf-hrms
git tag --list | tail             # pick a release tag if one exists
git checkout <TAG_OR_BRANCH>      # for example a release tag, or the branch you were handed
```

The path `/opt/eitf-hrms` matters: the systemd unit (`deploy/systemd/eitf-hrms.service`) hard-codes it. Do not deploy from a work-in-progress branch; deploy a tagged, tested commit.

### Step 6: Create `.env.production`

```bash
cd /opt/eitf-hrms
cp .env.production.example .env.production
chmod 600 .env.production
```

Generate each secret with `openssl rand -base64 48` and edit the file. A helper that fills the four random values in one go:

```bash
for k in POSTGRES_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET INTEGRATION_SECRET_KEY; do
  sed -i "s|^${k}=.*|${k}=$(openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48)|" .env.production
done
```

(`tr -d '/+='` keeps characters that are safe inside the database URL, because `POSTGRES_PASSWORD` is embedded in `DATABASE_URL` by `docker-compose.yml`.)

Then edit by hand (`nano .env.production`):

| Variable | Value | Notes |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_DB` | leave `eitf`, `eitf_hrms` | |
| `POSTGRES_PASSWORD` | random, 24+ chars | Compose refuses to start if empty |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | random, 32+ chars, different from each other | Compose refuses to start if empty |
| `INTEGRATION_SECRET_KEY` | random, 32+ chars | **Required in production**; the API throws at boot if missing. If you are **migrating an existing database** that already holds encrypted integration secrets, set it to the **old `JWT_ACCESS_SECRET` value** so they stay readable |
| `PUBLIC_APP_URL`, `CORS_ORIGINS` | the exact `https://` origin, no trailing slash, no path | In production only the origins listed here are allowed (`*` is ignored) |
| `COOKIE_SECURE` | `true` | Leave it |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | your first Super Admin | Password must be **at least 12 characters** in production or no user is created (`apps/api/prisma/bootstrap-admin.ts`). The account is forced to change the password at first login. Optional: `BOOTSTRAP_ADMIN_LOGIN_ID` (defaults to the e-mail) |
| `TRUST_PROXY` | empty | See Section 4 |
| `PUBLIC_HTTP_PORT`, `PUBLIC_HTTPS_PORT` | per option in Section 4 | |
| `CLOUDFLARE_TUNNEL_TOKEN` | option A only | Leave empty otherwise |
| `NEXT_PUBLIC_API_URL` | empty | Same-origin `/api/v1` is recommended |
| `STORAGE_DRIVER` and `S3_*` | see [Section 6](#6-data-and-storage) | |
| `BACKUP_AGE_RECIPIENT`, `BACKUP_RCLONE_REMOTE`, `BACKUP_HOUR_UTC`, `BACKUP_RETENTION_DAYS` | see [Section 7](#7-backups-and-disaster-recovery) | |
| `LOAD_TEST_USER`, `LOAD_TEST_PASS` | empty, or a real admin login | Only used by the smoke/load/soak scripts, which refuse to run without them |
| `COMPOSE_PROFILES` | `tunnel` (option A), `ssl` (option B) or empty (option C) | Read by the systemd unit to decide which optional containers to start |

Mobile OTP login sends the code to the employee's **registered email** over SMTP. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SUPPORT_CONTACT` and `OTP_HASH_SECRET` (all forwarded by `docker-compose.yml`). Leave `SMTP_HOST` empty to keep it off. See [`docs/EMAIL_OTP_SETUP.md`](EMAIL_OTP_SETUP.md). No SMS provider is used.

Finally confirm the file is not tracked by git: `git status --short` must not list `.env.production`, and `ls -l .env.production` must show `-rw-------`.

### Step 7: First boot

```bash
cd /opt/eitf-hrms
chmod +x deploy/up.sh scripts/*.sh
./deploy/up.sh
```

`deploy/up.sh` loads `.env.production`, adds `--profile tunnel` if `CLOUDFLARE_TUNNEL_TOKEN` is set (and `--profile ssl` if `ENABLE_SSL=true`), runs `docker compose --env-file .env.production ... up -d --build`, then `scripts/startup-verify.sh`. The first build takes several minutes. On boot the API container runs, in order (`apps/api/docker-entrypoint.sh`): `prisma migrate deploy`, the seed (company, roles, settings, statutory rule sets, and the bootstrap Super Admin if the env vars are set), `remove-demo-employees.ts`, `sync-settings.ts`, then starts the API. The API health check allows up to 120 seconds to start.

Your first login is the `BOOTSTRAP_ADMIN_*` account (`up.sh` prints a reminder at the end).

If you prefer to run compose by hand instead of `up.sh`:

```bash
docker compose --env-file .env.production up -d --build                      # option B / C
docker compose --env-file .env.production --profile tunnel up -d --build     # option A
```

### Step 8: Check health

```bash
docker compose --env-file .env.production ps          # every service "healthy" (cloudflared has no health check)
curl -fsS http://127.0.0.1:${PUBLIC_HTTP_PORT:-8080}/api/v1/health
curl -fsS https://hrms.yourcompany.com/api/v1/health   # once DNS / tunnel is working
```

The health JSON must show `"status":"ok"`, `"db":"ok"` and `"redis":"ok"`. A `"status":"degraded"` response means the database is unreachable. `/nginx-health` returns `ok` from nginx alone. If anything is unhealthy: `docker compose --env-file .env.production logs --tail=100 api`.

### Step 9: First admin login and company setup

1. Open `https://hrms.yourcompany.com`, log in with `BOOTSTRAP_ADMIN_EMAIL` and the bootstrap password. You are forced to set a new password. (Until you do, the API answers other calls with 403 `PASSWORD_CHANGE_REQUIRED`.)
2. Enable 2FA for this account (Account settings).
3. Fill in the company profile and settings (company details, shifts, holidays, weekly off, leave rules, attendance incentive, security).
4. In **Security settings**, raise **Password min length** (`security.password_min_length`) to **8 or more** on this database if it shows less. New databases default to 8; a database that was created earlier keeps its stored value (`AUDIT-REPORT.md` addendum A2).
5. If you do not use `BOOTSTRAP_ADMIN_*`, create the first admin once with `POST /api/v1/auth/setup/super-admin`. It only works while no admin exists.
6. Create HR and other user accounts through the UI. Enforce 2FA for Super Admin/HR if you want it (`security.require_2fa_for_admins`).

Do not import or generate any demo data on this server ([Section 9](#9-security-hardening-checklist)).

### Step 10: Statutory rule review with your CA

Payroll TDS, PF, ESI and professional tax use rule tables seeded from the developers' reading of the law and **not checked by a CA**. Hand `docs/PAYROLL-RULES.md` to your CA. They must verify every table (new and old regime slabs, 87A rebate, surcharge, PF ceiling and EPS split, ESI threshold and contribution periods, state professional tax slabs) against current law, including the Income-tax Act 2025 and any Budget 2026 changes. The FY 2026-27 values are the FY 2025-26 values carried forward. Rules live in the `statutory_rule_sets` table. Review them read-only under Payroll, then **Statutory Rules**. There is **no editing UI**: corrections are made by updating `statutory_rule_sets.rules` directly, which is validated on read, so ask your developer to apply the CA's corrections. Do not run a live payroll before this sign-off.

### Step 11: Auto-start on reboot (systemd)

Containers already carry `restart: unless-stopped`, so Docker brings them back after a reboot. The systemd unit additionally runs `docker compose up` on boot and brings the stack down cleanly on shutdown.

The shipped unit `deploy/systemd/eitf-hrms.service` loads `.env.production` and starts the optional containers named in `COMPOSE_PROFILES`: set it to `tunnel` for option A, `ssl` for option B (certbot renewal), or leave it empty for option C. No edits to the unit are needed.

```bash
sudo cp deploy/systemd/eitf-hrms.service /etc/systemd/system/eitf-hrms.service

sudo systemctl daemon-reload
sudo systemctl enable eitf-hrms
sudo systemctl start eitf-hrms
systemctl status eitf-hrms
```

The unit's `ExecStart` includes `--build`, so a reboot rebuilds images from the checked-out source (a few minutes, and it needs the build tools to reach the internet for npm packages). That is acceptable but means a reboot with no internet can be slow or fail to rebuild; the already-built images and `restart: unless-stopped` still bring the stack up. Test with a real reboot (`sudo reboot`) before go-live and confirm `docker compose ps` shows everything healthy.

### Step 12: SSL (option B only)

DNS must already point at the server and ports 80/443 must be reachable. `.env.production` needs `PUBLIC_HTTP_PORT=80` and `PUBLIC_HTTPS_PORT=443`, and the stack must be running (nginx has to answer the ACME challenge on port 80).

```bash
cd /opt/eitf-hrms
docker compose --env-file .env.production up -d --build         # with ports 80/443 set
./deploy/certbot/init-letsencrypt.sh hrms.yourcompany.com admin@yourcompany.com
```

The script requests the certificate with the `certbot` service, writes `deploy/nginx/conf.d/eitf-hrms-ssl.conf` from the template, appends an `include` line to `deploy/nginx/conf.d/eitf-hrms.conf`, and starts nginx and the `certbot` renewal container (`certbot renew` every 12 hours). Because it edits `eitf-hrms.conf`, which is tracked by git, run `git stash` or `git checkout -- deploy/nginx/conf.d/eitf-hrms.conf` carefully before an upgrade pull ([Section 10](#10-upgrades-and-releases)). After running it, set `ENABLE_SSL=true` in `.env.production` so later `./deploy/up.sh` runs keep the `ssl` profile, and verify:

```bash
curl -I https://hrms.yourcompany.com/
curl -fsS https://hrms.yourcompany.com/api/v1/health
```

### Step 13: Log rotation

Rotation is built in. `docker-compose.yml` defines a shared logging block (`x-logging`) with `driver: json-file`, `max-size: "20m"` and `max-file: "5"`, and every service uses it. That caps each container at 100 MB of logs. No logrotate setup is needed for the application. Check it took effect:

```bash
docker inspect eitf-hrms-api --format '{{json .HostConfig.LogConfig}}'
```

---

## 6. Data and storage

What is stored where:

| Data | Location | Backed up by |
|---|---|---|
| Database (employees, payroll, leave, audit, settings, document keys) | Docker volume `eitf_postgres_data` (PostgreSQL `PGDATA`) | `db-backup` nightly (Section 7) |
| Selfies and HR documents, **local driver** | Docker volume `eitf_uploads`, mounted at `/app/apps/api/uploads` in the `api` container | **Not** covered by `db-backup`. You must back it up separately (below) |
| Selfies and HR documents, **s3 driver** | Your S3-compatible bucket | The bucket provider's durability; consider versioning |
| In-app JSON snapshots | Docker volume `eitf_backups`, `/app/apps/api/data/backups/<companyId>/` | Not a substitute for a database restore (forensics and settings only) |
| Nightly encrypted dumps | Docker volume `eitf_db_backups`, `/backups` in `db-backup`, and your off-site bucket | n/a |
| Redis cache | Docker volume `eitf_redis_data` | Not needed (cache only, capped at 128 MB with LRU) |

### Local volume or object storage

| | `STORAGE_DRIVER=local` (default) | `STORAGE_DRIVER=s3` |
|---|---|---|
| Where files live | `eitf_uploads` on the server | R2, Backblaze B2, AWS S3 or MinIO |
| Server disk growth | Yes (see Section 2) | None for new files |
| Backup effort | You must tar and ship the volume | Provider durability, optional versioning |
| Extra accounts | None | A bucket and an API key |
| Fits | Single-site, small, air-gapped | Anything that must survive loss of the server without extra work |

For an on-premise server **with no extra cloud account**, local is fine if you add the uploads backup below. If you already have the off-site backup bucket, using object storage for files too removes a whole class of recovery work. Switch drivers in `.env.production`, then restart the API:

```bash
# Cloudflare R2 example (see .env.production.example for B2 / AWS values)
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=eitf-hrms-files
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
STORAGE_PUBLIC_ORIGIN=https://<bucket>.<accountid>.r2.cloudflarestorage.com
```

`STORAGE_PUBLIC_ORIGIN` is the origin browsers load presigned selfie URLs from; it is added to the web app's Content-Security-Policy `img-src`. If selfies do not display after switching, this value is the first thing to check. Keep the bucket **private**. Use a bucket separate from the backup bucket. After switching, new files go to S3; existing local files stay readable, but are not copied automatically.

```bash
docker compose --env-file .env.production up -d api web
```

### Selfie migration (only if you restore or import an older database with base64 selfies)

Older data stored selfies as base64 inside Postgres. A fresh install has none. If you carry an old database over, run once after deploy (safe to re-run; the script is `apps/api/prisma/migrate-selfies-to-storage.ts`, npm script `db:migrate-selfies`):

```bash
docker compose --env-file .env.production exec api npm run db:migrate-selfies                 # dry run: prints counts and bytes
docker compose --env-file .env.production exec api npm run db:migrate-selfies -- --apply      # uploads and rewrites rows to storage: keys
```

This runs inside the `api` container (the working directory is `apps/api`, whose `package.json` defines the script). The container image includes `tsx`, which the boot entrypoint also uses. This exact in-container invocation has not been executed in the development environment; if it fails, run the same script from a developer checkout against the database.

### Backing up the uploads volume (local driver)

`docker-compose.yml` does not back up `eitf_uploads`. Add a nightly host job. The `api` image includes `tar`, which avoids guessing the project-prefixed volume name:

```bash
mkdir -p /srv/eitf-uploads-backup
cat > /opt/eitf-hrms/deploy-uploads-backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/eitf-hrms
OUT=/srv/eitf-uploads-backup/uploads_$(date -u +%Y%m%dT%H%M%SZ).tar.gz
docker compose --env-file .env.production exec -T api tar czf - -C /app/apps/api uploads > "$OUT"
find /srv/eitf-uploads-backup -name 'uploads_*.tar.gz' -mtime +14 -delete
EOF
chmod 700 /opt/eitf-hrms/deploy-uploads-backup.sh
# 02:30 IST daily; then copy /srv/eitf-uploads-backup off the server (rclone sync to a bucket, or an external disk)
( crontab -l 2>/dev/null; echo '30 2 * * * /opt/eitf-hrms/deploy-uploads-backup.sh >> /var/log/eitf-uploads-backup.log 2>&1' ) | crontab -
```

Selfies and HR documents are personal data. Encrypt this archive too (for example `age -r <public key>`) before it leaves the server, using the same age public key as the database backups. Restoring is the reverse: stop `api`, stream the archive back with `docker compose ... exec -T api tar xzf - -C /app/apps/api`, start `api`. (Script name and cron lines are suggestions written for this guide, not files in the repository.)

---

## 7. Backups and disaster recovery

### 7.1 What the nightly job does

The `db-backup` service (`deploy/backup/backup.sh`, image built from `deploy/backup/Dockerfile`) runs one backup per day at `BACKUP_HOUR_UTC` (default 20, that is 01:30 IST):

1. `pg_dump -Fc` to `/backups/eitf_hrms_<UTC timestamp>.dump`;
2. encrypts to `...dump.age` with **age** if `BACKUP_AGE_RECIPIENT` is set, then deletes the plaintext;
3. deletes local files older than `BACKUP_RETENTION_DAYS` (default 14);
4. uploads the encrypted file with **rclone** to `BACKUP_RCLONE_REMOTE` and deletes remote files older than the same limit.

Without `BACKUP_AGE_RECIPIENT` the dump stays **unencrypted and local only** and logs a WARNING. Without `BACKUP_RCLONE_REMOTE` there is no off-site copy and a WARNING is logged. An upload failure is logged as ERROR but does **not** fail the job, so you must read the logs ([Section 8](#8-monitoring-and-operations)). Full detail: `docs/BACKUP_AND_RECOVERY.md`.

### 7.2 One-time setup

On your **admin workstation, not the server**:

```bash
age-keygen -o backup.key           # prints the PUBLIC key (age1...) to the screen
```

- Put the public key in `.env.production` as `BACKUP_AGE_RECIPIENT=age1...`.
- **Key custody.** `backup.key` is the private key. Without it no backup can be decrypted. Store **two copies in two different places that are not the server**: for example the owner's password manager and a sealed envelope or an encrypted USB drive in a safe (or a bank locker). Record who holds each copy. If the key is lost, every off-site backup becomes unreadable.
- Create a private bucket (for example `eitf-hrms-backups`) on R2, B2 or S3, with an API key limited to that bucket that can read, write, list and delete. Write `deploy/backup/rclone/rclone.conf` with your remote (examples for R2, B2 and S3 are in `docs/BACKUP_AND_RECOVERY.md`), then:

```bash
cd /opt/eitf-hrms
mkdir -p deploy/backup/rclone
nano deploy/backup/rclone/rclone.conf
chmod 600 deploy/backup/rclone/rclone.conf       # directory is gitignored; never commit it
```

Set `BACKUP_RCLONE_REMOTE=r2:eitf-hrms-backups` (matching the section name in `rclone.conf`) in `.env.production`, then rebuild and start the backup service and run a first backup by hand:

```bash
docker compose --env-file .env.production up -d --build db-backup
docker compose --env-file .env.production exec db-backup /bin/sh /usr/local/bin/backup.sh once
docker compose --env-file .env.production exec db-backup rclone lsf r2:eitf-hrms-backups     # your remote name here
```

The log must show `encrypted -> ...dump.age` and `uploading ...`, and the listing must show the new `.dump.age` file.

### 7.3 Targets

| Target | Value | Why |
|---|---|---|
| **RPO** (maximum data loss) | up to 24 hours, with the default nightly schedule | One dump per day. Lower it by moving to `BACKUP_HOUR_UTC` plus a second run, or by adding WAL archiving (not provided) |
| **RTO** (time to restore service) | about 2 to 4 hours for a rebuild on new hardware, once the age key and off-site backup are at hand | Includes OS install, Docker, image build, restore and checks |
| Retention | 14 days local and off-site (`BACKUP_RETENTION_DAYS`) | Add a bucket lifecycle rule for monthly copies if you need longer history |
| Off-site copies | 1 required, 2 recommended for 200+ employees | Different provider or account |

### 7.4 Monthly restore drill

An untested backup is not a backup. Do this before go-live and then **monthly** (the existing doc says quarterly; monthly is the recommendation here for a payroll system). Never restore into production for a drill. The full procedure is in `docs/BACKUP_AND_RECOVERY.md`; the short version:

```bash
# 1. List recent backups (workstation with rclone configured)
rclone lsf r2:eitf-hrms-backups | sort | tail -5

# 2. Start a scratch Postgres
docker run -d --name restore-drill -e POSTGRES_PASSWORD=drill -p 55432:5432 postgres:16-alpine
sleep 5
docker exec restore-drill createdb -U postgres eitf_drill

# 3. Restore into it using the db-backup image's restore.sh (dry run without --yes)
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "$HOME/keys/backup.key:/keys/backup.key:ro" \
  -v "$HOME/eitf-rclone:/config/rclone:ro" \
  -e BACKUP_AGE_IDENTITY_FILE=/keys/backup.key \
  -e BACKUP_RCLONE_CONFIG=/config/rclone/rclone.conf \
  -e DATABASE_URL='postgresql://postgres:drill@host.docker.internal:55432/eitf_drill' \
  --entrypoint /usr/local/bin/restore.sh \
  eitf-hrms-db-backup:latest \
  --yes r2:eitf-hrms-backups/<file-from-step-1>.dump.age

# 4. Check, compare with production, clean up
docker exec restore-drill psql -U postgres -d eitf_drill -c 'SELECT count(*) AS employees FROM employees;'
docker compose --env-file .env.production exec postgres psql -U eitf -d eitf_hrms -c 'SELECT count(*) AS employees FROM employees;'
docker rm -f restore-drill
```

Record the date, backup file, row counts and operator in your operations log. The `eitf-hrms-db-backup:latest` image exists on the server after the stack is built; on a workstation, build it first from `deploy/backup/` or run the drill on the server.

### 7.5 Emergency restore into production

Follow "Emergency restore into production" in `docs/BACKUP_AND_RECOVERY.md`. In outline: stop `api` and `web`; take a fresh `backup.sh once` of the current state; put the age private key on the server only in RAM (`/dev/shm/backup.key`); run `restore.sh --yes` through `docker compose run --rm --no-deps ... --entrypoint /usr/local/bin/restore.sh db-backup ...`; delete the key; `prisma migrate deploy` if needed (it also runs on API start); start `api web`; verify health and spot-check payroll and leave data. `restore.sh` uses `pg_restore --clean --if-exists`, which **drops and recreates every object** in the target database.

### 7.6 Full machine rebuild (server destroyed)

1. Prepare replacement hardware and repeat Steps 1 to 5 of Section 5 (OS, hardening, Docker, source at the **same tag** that was running).
2. Recreate `.env.production`. You need the **same** `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, and critically the **same `INTEGRATION_SECRET_KEY`** as before, or encrypted integration secrets become unreadable. Keep an encrypted copy of `.env.production` in your password manager, separate from the backups. New `POSTGRES_PASSWORD` is fine because the database is restored into a fresh volume.
3. Restore `deploy/backup/rclone/rclone.conf` (also from the password manager) and put your Cloudflare tunnel token or DNS in place.
4. Start only the database first: `docker compose --env-file .env.production up -d postgres`.
5. Fetch the age private key from custody, then restore the newest good dump into the empty database with `restore.sh` as in 7.5 (target the fresh `eitf_hrms` database).
6. Restore the uploads archive (local driver) as described in Section 6, or confirm the bucket (s3 driver) is intact.
7. Start the rest: `./deploy/up.sh`. The API applies any missing migrations on boot.
8. Verify: health endpoint, log in, spot-check the latest payroll run, point DNS or the tunnel at the new host, and re-run the smoke test. Then run a fresh backup and delete the age key from the server.

---

## 8. Monitoring and operations

### Health endpoints

| URL | Meaning |
|---|---|
| `/api/v1/health` | API, database (`db`), Redis (`redis`), uptime (`uptimeSec`), memory. `status` is `ok` when the database responds, otherwise `degraded` |
| `/nginx-health` | nginx alone, returns `ok` |

### Cron monitor

`scripts/monitor-health.mjs` (needs Node 20+ on the machine that runs it) checks `/api/v1/health`, `/nginx-health` and `/`, prints one line, and exits 1 on failure. Example for the server, every 5 minutes:

```bash
crontab -e
*/5 * * * * cd /opt/eitf-hrms && node scripts/monitor-health.mjs http://127.0.0.1:8080 >> /var/log/eitf-monitor.log 2>&1
```

(Use port 80 if `PUBLIC_HTTP_PORT=80`.) The script only exits non-zero; wire e-mail or a webhook yourself. **Also** use an external uptime monitor that checks `https://hrms.yourcompany.com/api/v1/health` from outside your network (for example UptimeRobot or Better Stack free plans), because a monitor on the server cannot tell you the server or the internet link is down.

Disk-space alert (suggested, not in the repository):

```bash
*/30 * * * * [ "$(df --output=pcent /var/lib/docker | tail -1 | tr -dc 0-9)" -ge 80 ] && echo "Disk above 80% on $(hostname)" | mail -s "HRMS disk alert" it@yourcompany.com
```

This needs a working `mail` setup; alternatively post to a chat webhook with `curl`.

### Logs

```bash
docker compose --env-file .env.production logs -f --tail=100 api
docker compose --env-file .env.production logs --since 26h db-backup | grep -E 'ERROR|WARNING|dump complete|uploading'
docker compose --env-file .env.production logs -f nginx
docker compose --env-file .env.production logs -f cloudflared      # option A
docker stats --no-stream
docker system df
```

### Reading audit logs

Web app: **Security**, then **Audit** (`/security/audit`). API: `GET /api/v1/security/audit` and `GET /api/v1/security/audit/export/csv` (Super Admin / HR). Use these to review who changed payroll, salary configuration, roles, settings and logins. Details are in `docs/AUDIT_AND_SECURITY.md`.

### Operations checklist

| When | Task |
|---|---|
| Daily | Open the external uptime monitor. Check `db-backup` logs for `ERROR` and `WARNING` (command above). Confirm `docker compose ps` is all healthy |
| Weekly | `df -h` and `docker system df`. Review audit log for unusual activity (failed logins, role or salary changes). Check `fail2ban-client status sshd`. Check `apt list --upgradable` and that unattended-upgrades is working. Confirm a recent `.dump.age` file exists off-site (`rclone lsf`) |
| Monthly | **Restore drill** (Section 7.4). Review admin accounts and remove leavers. Apply Docker and OS updates in a maintenance window and reboot. Check the UPS battery self-test. Verify TLS certificate expiry (option B auto-renews) |
| Before each payroll | Take a manual backup (`backup.sh once`), confirm attendance is final and approved |
| Quarterly | Rotate the Cloudflare/S3/R2 API keys if policy requires. Re-confirm age key copies exist. CA re-check of statutory tables at each financial year or Budget change |
| Annually | Review hardware warranty, disk health (`smartctl -a`), UPS battery. Renew the domain |

---

## 9. Security hardening checklist

- [ ] SSH key login only; `PermitRootLogin no`; `PasswordAuthentication no` (Section 5, step 2).
- [ ] `ufw` enabled with default deny incoming; only OpenSSH (and 80/443 for option B) allowed. Remember Docker bypasses ufw for published ports ([Section 4](#4-network-and-domain)).
- [ ] fail2ban running for SSH.
- [ ] `unattended-upgrades` enabled for security updates; plan a monthly reboot.
- [ ] PostgreSQL and Redis are **not published** on the host. Verify: `ss -tlnp | grep -E ':5432|:6379'` returns nothing, and `docker compose --env-file .env.production ps` shows no host port for `postgres` or `redis`.
- [ ] `.env.production` mode 600, owned by the deploy user; `deploy/backup/rclone/rclone.conf` mode 600. Neither is committed to git.
- [ ] Secrets are random (`openssl rand -base64 48`), unique per system, and not reused from any previous deployment. The old repository once committed real secrets (`AUDIT-REPORT.md` C1); treat any secret that was ever in git history as burned.
- [ ] **Rotate secrets** (procedure below) on a schedule and whenever someone with access leaves.
- [ ] 2FA enabled for every Super Admin and HR account; consider `security.require_2fa_for_admins`.
- [ ] **IP allow-list** (`security.ip_allowlist` in Security settings; empty means everyone is allowed). Use it to restrict admin access to the office egress IPs if staff are on fixed addresses. It uses the real client IP behind the proxy (`req.ip`), so `TRUST_PROXY` must be correct; verify in Login activity before you rely on it, and do not lock yourself out.
- [ ] **Password policy:** `security.password_min_length` is at least 8 on this database (existing databases keep the old stored value; raise it in Security settings). Consider enabling `security.password_require_upper`, `_number` and `_special`. Lockout defaults: 5 failed logins, 30 minutes.
- [ ] **Never set `OTP_SHOW_IN_UI`** in production. It would display login OTP codes in the browser.
- [ ] **Never run the demo-data script** (`apps/api/scripts/demo/*`, see `docs/DEMO-DATA.md`) against the production database. Demo data must not exist at go-live ([Section 11](#11-go-live-checklist)).
- [ ] Swagger is off in production (`NODE_ENV=production`). The nginx config still proxies `/api/docs` to the API, which returns nothing useful in production; the security script `swagger-not-public-prod` checks this.
- [ ] Physical security: locked room, BIOS password, disk encryption decision documented (full-disk encryption means someone must enter the passphrase after a reboot; decide deliberately).

### Rotating secrets

| Secret | Procedure | Side effects |
|---|---|---|
| `POSTGRES_PASSWORD` | Change the role password inside the database, then update the file: `docker compose --env-file .env.production exec postgres psql -U eitf -d eitf_hrms -c "ALTER USER eitf PASSWORD '<new>';"`, edit `.env.production`, then `docker compose --env-file .env.production up -d --force-recreate api db-backup` | Brief API restart. Changing only the env file will not change the password inside an existing database volume |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Edit `.env.production`, then `docker compose --env-file .env.production up -d api web` | Every user is signed out |
| `INTEGRATION_SECRET_KEY` | **Do not change it casually.** Values already encrypted with it would become unreadable. Rotating requires re-entering every stored integration secret afterwards | Plan with your developer |
| `BOOTSTRAP_ADMIN_PASSWORD` | Only used when creating the first admin. After first login, remove it from `.env.production` | None |
| S3/R2 keys, rclone keys | Issue a new key in the provider, update `.env.production` or `rclone.conf`, restart `api` or `db-backup`, then revoke the old key | None if done in order |
| age key pair | Generate a new pair, update `BACKUP_AGE_RECIPIENT`, `up -d --build db-backup`. **Keep the old private key** until all backups encrypted with it have aged out | New backups use the new key |
| Cloudflare tunnel token | Rotate in the dashboard, update `CLOUDFLARE_TUNNEL_TOKEN`, `up -d cloudflared` | Short outage |

---

## 10. Upgrades and releases

Zero-downtime upgrades are **not supported**: one server, one API instance, and the API container restarts and runs migrations on boot. Schedule a maintenance window (outside payroll processing days) and tell staff.

```bash
cd /opt/eitf-hrms

# 1. Backup first, always
docker compose --env-file .env.production exec db-backup /bin/sh /usr/local/bin/backup.sh once
docker compose --env-file .env.production exec db-backup rclone lsf <your remote>          # confirm it arrived

# 2. Note what is running now (for rollback)
git rev-parse HEAD > /tmp/eitf-previous-commit
git describe --tags --always

# 3. Fetch and check out the new release
git fetch --tags
git checkout <NEW_TAG>

# 4. Rebuild and restart (add --profile tunnel for option A, --profile ssl for option B)
docker compose --env-file .env.production up -d --build
# or: ./deploy/up.sh   (picks the profiles from .env.production)

# 5. Verify
docker compose --env-file .env.production ps
curl -fsS https://hrms.yourcompany.com/api/v1/health
```

Migrations run automatically (`prisma migrate deploy` in `docker-entrypoint.sh`); watch them with `docker compose --env-file .env.production logs -f api`. Read the release notes first for changes to `.env.production.example` and add any new required variables before step 4. A local change to a tracked file blocks `git checkout`: on option B, step 12 of the install edits `deploy/nginx/conf.d/eitf-hrms.conf`. Keep that change as a separate commit or `git stash` it and re-apply after the checkout.

After an upgrade that touches payroll, re-run the smoke test ([Section 11](#11-go-live-checklist)) and compare a known payslip to its previous value.

### Rollback

Database migrations only go forward, so rollback depends on whether a migration ran.

1. **No new migration in the release, or the release failed before migrating:** check out the previous tag and rebuild.
   ```bash
   git checkout "$(cat /tmp/eitf-previous-commit)"
   docker compose --env-file .env.production up -d --build
   ```
2. **A migration was applied and data is affected:** stop `api web`, check out the previous tag, restore the pre-upgrade dump into the database using the emergency restore procedure (Section 7.5; you took it in step 1), rebuild and start. Data entered after the upgrade began is lost, so decide quickly and tell users.
3. Docker keeps the previous images until pruned. Do not run `docker image prune -a` until the new release has proven stable for a few days.

---

## 11. Go-live checklist

Print this and tick it. Sign-off by the owner, IT, HR and the CA.

**Security and secrets**

- [ ] All secrets generated fresh with `openssl rand -base64 48`; none reused from the old repository or demo environment.
- [ ] `.env.production` is mode 600 and not in git; an encrypted copy is stored in the password manager.
- [ ] `INTEGRATION_SECRET_KEY` set (and, if migrating a database, equal to the old `JWT_ACCESS_SECRET`).
- [ ] First Super Admin changed the bootstrap password and enabled 2FA. `BOOTSTRAP_ADMIN_PASSWORD` removed from `.env.production`.
- [ ] `security.password_min_length` is 8 or more.
- [ ] `OTP_SHOW_IN_UI` is not set anywhere. `COOKIE_SECURE=true`.
- [ ] SSH hardening, ufw, fail2ban, unattended-upgrades confirmed; Postgres and Redis not exposed.

**Payroll correctness**

- [ ] The CA verified every table in `docs/PAYROLL-RULES.md` (the rows in `statutory_rule_sets`) for this company's states and financial year. Sign-off recorded.
- [ ] A trial **EPFO ECR upload** was done (the ECR file layout needs EPFO trial validation, `EXECUTION-PLAN.md` T10).
- [ ] HR confirmed that **"gross" in salary configuration means base salary *excluding* the allowances entered beside it** (`docs/PAYROLL-RULES.md`, `AUDIT-REPORT.md` A5). If HR entered gross figures that already included allowances, those employees must be re-entered or they will be overpaid.
- [ ] Attendance incentive settings reviewed (`incentive.enabled`, `incentive.amount`, `incentive.max_late_marks`, `incentive.require_no_half_day`, `incentive.require_no_absent`, `incentive.require_no_ulob`). The seeded defaults are enabled, Rs 500 a month, zero late marks allowed.
- [ ] Per-employee tax regime, declared deductions and PT state entered. Weekly-off, holidays and leave rules set.
- [ ] **Demo data is NOT present** (no demo employees, no demo accounts). `SELECT count(*) FROM employees;` matches your real headcount.
- [ ] **Pilot payroll cycle** for one department completed and reconciled against the current system, line by line. Note that only a Super Admin can open the payroll run page ([Section 12.4](#124-known-limitations)).

**Backup and recovery**

- [ ] Off-site backup bucket and rclone remote working; `db-backup` logs show `encrypted` and `uploading`.
- [ ] Age private key stored in two separate locations off the server; custodians recorded.
- [ ] **Restore drill** completed with row counts matched (Section 7.4).
- [ ] Uploads volume backed up (or `STORAGE_DRIVER=s3` in use).

**Tests** (run from a machine with Node 20+, against the real HTTPS URL, using a real admin account that has already changed its password; the scripts' built-in default credentials do not exist on a fresh install)

```bash
export LOAD_TEST_USER='<BOOTSTRAP_ADMIN_EMAIL or login id>'
export LOAD_TEST_PASS='<current admin password>'

node scripts/smoke-test.mjs https://hrms.yourcompany.com
node scripts/security-pentest.mjs https://hrms.yourcompany.com
node scripts/load-test.mjs https://hrms.yourcompany.com 10
node scripts/load-test.mjs https://hrms.yourcompany.com 15
node scripts/load-test.mjs https://hrms.yourcompany.com 20
nohup node scripts/soak-test.mjs https://hrms.yourcompany.com 1440 60 >> soak.log 2>&1 &     # 24 h soak
```

- [ ] `smoke-test.mjs`: all checks pass. (It refuses `localhost` and `192.168.*` URLs.)
- [ ] `security-pentest.mjs`: no HIGH findings.
- [ ] `load-test.mjs` at 10, 15 and 20 users: 0 failures, average under 500 ms, p95 under 2000 ms (targets from `docs/PERFORMANCE-REPORT.md`). Fill that report in. For the 200 and 1,000 tiers, also test at your real concurrency (for example the morning punch-in peak).
- [ ] 24-hour soak test clean. `docker stats --no-stream` shows no steady memory growth.
- [ ] Real reboot test: `sudo reboot`, stack returns healthy without manual steps.
- [ ] Power-loss behaviour with the UPS tested.

**Access and clients**

- [ ] HTTPS works from a phone on mobile data (option A or B). Login activity shows the phone's real public IP.
- [ ] Mobile builds created with EAS against the production URL and installed on test phones (Section 12.2).
- [ ] **SMS gateway decision made** and recorded: either integrate a provider now, or go live with web and password login only ([Section 12.4](#124-known-limitations)).
- [ ] Staff briefed (`docs/USER_MANUALS.md`, `docs/TRAINING.md`).

---

## 12. Handover

### 12.1 What the customer receives

| Item | Path |
|---|---|
| Source code (API, web, mobile), Docker files and deployment scripts | the repository |
| This hosting guide | `docs/HOSTING-DEDICATED-SERVER.md` |
| Project audit and fixes | [`AUDIT-REPORT.md`](../AUDIT-REPORT.md) (findings, with an addendum of issues found during execution) |
| Task-by-task fix plan and status | [`EXECUTION-PLAN.md`](../EXECUTION-PLAN.md) |
| Statutory payroll rules and limitations | [`docs/PAYROLL-RULES.md`](PAYROLL-RULES.md) |
| Backup and recovery (database) | [`docs/BACKUP_AND_RECOVERY.md`](BACKUP_AND_RECOVERY.md) |
| Which database columns are money | [`docs/MONEY-FIELDS.md`](MONEY-FIELDS.md) |
| Demo data tool (for non-production use only) | [`docs/DEMO-DATA.md`](DEMO-DATA.md) |
| Audit and security notes | [`docs/AUDIT_AND_SECURITY.md`](AUDIT_AND_SECURITY.md) |
| Database notes, export engine | [`docs/DATABASE.md`](DATABASE.md), [`docs/EXPORT_ENGINE.md`](EXPORT_ENGINE.md) |
| User manuals and training | [`docs/USER_MANUALS.md`](USER_MANUALS.md), [`docs/TRAINING.md`](TRAINING.md) |
| Performance report template | [`docs/PERFORMANCE-REPORT.md`](PERFORMANCE-REPORT.md) |

### 12.2 Mobile app

The Expo app lives in `apps/mobile`. `apps/mobile/eas.json` has a `production` build profile whose `EXPO_PUBLIC_API_URL` is a placeholder (`https://hrms.yourcompany.com/api/v1`); **change it to your production URL (keeping the `/api/v1` suffix) before building**.

```bash
cd apps/mobile
npx eas-cli login
npx eas build -p android --profile preview        # internal APK for testing
npx eas build -p android --profile production     # Play Store bundle
npx eas build -p ios --profile production         # needs an Apple Developer account
```

The company's own Expo, Apple Developer and Google Play accounts must own the apps. Bundle IDs are in `apps/mobile/app.json` (`com.eitf.hrms`); change them if the customer is not EITF. Source: `docs/DEPLOYMENT.md`, "Mobile release".

### 12.3 Accounts the customer must own

| Account | Used for | Owner should be |
|---|---|---|
| Domain registrar | The hostname | A company e-mail, not a person's |
| Cloudflare | DNS, Tunnel, optionally R2 | Company account with 2FA and a second admin |
| Backup storage (R2 / B2 / S3) | Off-site encrypted backups, optional file storage | Company account |
| Expo, Apple Developer, Google Play | Mobile builds and store listings | Company accounts |
| SMTP mailbox (OTP emails and system alerts) | Mobile OTP login, `ALERT_EMAILS` monitoring | Company account |
| Git hosting | Source and tags | Company account |
| Password manager | `.env.production` copy, age key, rclone config | Shared vault with at least two people |

### 12.4 Known limitations

From `AUDIT-REPORT.md` (addendum), `docs/PAYROLL-RULES.md` and the code:

- **Email OTP needs SMTP credentials.** Mobile OTP login (employee accounts only) emails the code to the employee's registered address and stays switched off until `SMTP_HOST` and a valid `SMTP_FROM_EMAIL` are set. Until then the login screen tells employees to use User ID + password. See [`EMAIL_OTP_SETUP.md`](EMAIL_OTP_SETUP.md).
- **Only a Super Admin can open the payroll run pages.** The payroll run endpoints (`payroll/runs`, generate, approve) are restricted to the `SUPER_ADMIN` role in `apps/api/src/payroll/payroll.controller.ts`. HR can configure salaries but cannot open the payroll run page. Plan who approves payroll accordingly.
- **Statutory rules are unverified until your CA signs off**, and there is no UI to edit them (SQL update on `statutory_rule_sets`).
- Payroll limitations (`docs/PAYROLL-RULES.md`): old-regime senior and super-senior slabs not modelled; no 80C cap or itemised Chapter VI-A heads, HRA exemption and perquisites not computed; previous-employer income (Form 12B) not captured; PF EDLI and admin charges not computed; ESI daily-wage rule not modelled; only seven states have professional-tax slabs seeded (MH, KA, WB, TN, TS, AP, GJ); salary-structure-only employees bypass the statutory engine; the attendance payroll export is a steady-state estimate and the payroll run is the source of truth.
- The EPFO ECR file layout needs a trial upload before relying on it.
- **Existing databases keep their stored `security.password_min_length`**; raise it manually (addendum A2).
- **"Gross" means base salary excluding allowances** in salary config; wrong entries overpay (addendum A5).
- Single server: no high availability, no zero-downtime upgrade. A disk or server failure means downtime until restore (RTO above).
- Test coverage is limited relative to the product's size (`AUDIT-REPORT.md` H6), although core tests were added later (`EXECUTION-PLAN.md` T14). Run your own pilot cycle.
- Load and soak tests have not been run on your hardware by the developers; you run them in [Section 11](#11-go-live-checklist).

### 12.5 Support and maintenance recommendations

- Name an **IT owner** and a deputy. Budget about 2 hours a week for the checklist in Section 8.
- Keep a **maintenance agreement** with the developer or a vendor for: security patches to dependencies (re-run `npm audit` each quarter), migrations at upgrades, SMS integration, and statutory rule updates every Budget and financial year.
- Keep an **operations log** (restore drills, upgrades, incidents, secret rotations).
- Review `docs/PAYROLL-RULES.md` with the CA every April and after any Budget.
- Re-check the monthly restore drill result before every payroll.

---

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker compose up` stops with "Set POSTGRES_PASSWORD / JWT_ACCESS_SECRET / CORS_ORIGINS / INTEGRATION_SECRET_KEY in .env.production" | A required variable is empty (the compose file uses `:?` checks) | Fill it in `.env.production` and pass `--env-file .env.production` |
| `api` keeps restarting; logs mention `INTEGRATION_SECRET_KEY` | The API refuses to boot in production without it | Set `INTEGRATION_SECRET_KEY` (for an existing database, use the old `JWT_ACCESS_SECRET` value) and `docker compose --env-file .env.production up -d api` |
| `api` unhealthy for the first 2 minutes | Normal: health check `start_period` is 120 s while migrations and seed run | Wait; if it persists read `docker compose ... logs api` |
| Browser shows "CORS blocked", or API calls fail from the web app | `CORS_ORIGINS` / `PUBLIC_APP_URL` does not exactly match the browser origin (scheme, host, port, no trailing slash, no path). In production LAN and tunnel origins are not auto-allowed | Correct both variables to the exact `https://` origin, restart `api` |
| Login succeeds but you are logged out immediately / refresh fails | The refresh cookie is `Secure` and the site is being served over plain `http` | Use HTTPS. Do not set `COOKIE_SECURE=false` outside local development |
| API returns 403 `PASSWORD_CHANGE_REQUIRED` (also for scripts and mobile) | The account still has the forced-change flag (new bootstrap admin) | Log in on the web, set a new password, then use that account in scripts |
| No bootstrap admin was created | Password shorter than 12 characters, or either `BOOTSTRAP_ADMIN_*` empty. The log says "no user created" | Fix the values and `docker compose ... restart api` (seed is idempotent), or use `POST /api/v1/auth/setup/super-admin` |
| Client IP shows `172.x` or the same IP for everyone; IP allow-list or lockout misbehaves | A proxy hop not trusted, or a custom `TRUST_PROXY` set wrongly | Set `TRUST_PROXY` back to empty. Test with Login activity from mobile data |
| `prisma migrate deploy` fails on start | Database not reachable, wrong `POSTGRES_PASSWORD` after a volume already existed, or a drifted schema | `docker compose ... logs api`. A changed env password does not change an existing volume's password: use the rotation steps in Section 9 |
| Smoke or load test exits with "Set LOAD_TEST_USER…", or login 401/403 | The scripts need a real admin login; a 403 means that account still has to change its first password | Export `LOAD_TEST_USER` / `LOAD_TEST_PASS` for a real admin that has changed its password |
| `smoke-test.mjs` prints "Provide production HTTPS URL" | It rejects `localhost` and `192.168.*` | Run it against the public HTTPS URL |
| Server slow, containers fail to start, "no space left on device" | Disk full (images, build cache, logs, uploads, dumps) | `df -h`, `docker system df`. `docker builder prune` and `docker image prune` free build cache and old images. Move uploads to s3 or add disk. Logs are already capped at 100 MB per container |
| `db-backup` log: "BACKUP_AGE_RECIPIENT is not set; dump is UNENCRYPTED" | Variable empty | Set the public key, `up -d --build db-backup`; plaintext dumps stay local only |
| `db-backup` log: "BACKUP_RCLONE_REMOTE is not set; skipping off-site upload" | Variable empty | Set the remote and rclone config (Section 7.2) |
| `db-backup` log: "refusing to upload an unencrypted dump off-site" | Remote set but no age recipient | Set `BACKUP_AGE_RECIPIENT` |
| `db-backup` log: "off-site upload failed" (job still exits 0) | Wrong or expired rclone key, bucket name, or no internet | `docker compose ... exec db-backup rclone lsf <remote>` to test; fix `rclone.conf`; read logs daily |
| Selfies broken after switching to s3 | `STORAGE_PUBLIC_ORIGIN` wrong (CSP blocks the image), or bucket not reachable | Set the exact bucket origin in the web service environment and restart `web` |
| Certificate request fails (option B) | DNS not pointing at the server, ports 80/443 not forwarded, or `PUBLIC_HTTP_PORT` still 8080 | Fix DNS and ports; `docker compose ... logs nginx`; rerun `init-letsencrypt.sh` |
| Works on LAN but not from the internet (option A) | Tunnel not running or Public Hostname service not `http://nginx:80` | `docker compose ... logs cloudflared`; confirm the Cloudflare hostname mapping |
| Everything down after reboot | systemd unit not enabled, or `--build` failed offline | `systemctl status eitf-hrms`, `journalctl -u eitf-hrms -n 100`; `docker compose ... up -d` |
| 502 from nginx right after an upgrade | The API is still migrating or starting | Wait for `docker compose ps` to show `api` healthy |

---

## 14. Superseded or stale material in older docs

The code and the compose file are the source of truth. `docs/FINAL-LAUNCH.md`, `docs/PRODUCTION-DEPLOYMENT.md` and `docs/PUBLIC-HTTPS-TESTING.md` are marked superseded. These older statements are wrong or incomplete; do not follow them.

| Where | Says | Reality (code) |
|---|---|---|
| `docs/PRODUCTION-DEPLOYMENT.md` (Phase 3 verify, validation) | Log in as `superadmin` / `Super@123` | No such account is created. The first Super Admin comes from `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` (12+ chars in production, forced change at first login) |
| `docs/PRODUCTION-DEPLOYMENT.md` "Required environment variables" | Omits `INTEGRATION_SECRET_KEY`; suggests `openssl rand -base64 32` | `INTEGRATION_SECRET_KEY` is required (compose `:?` and API boot check). Use `openssl rand -base64 48` |
| `docs/PRODUCTION-DEPLOYMENT.md` Phase 6 and `scripts/restore-db.sh` | Backups are `backup.sql.gz` restored with `gunzip` | Backups are `eitf_hrms_<ts>.dump` (pg custom format) and `.dump.age` encrypted files, restored with `deploy/backup/restore.sh` (Section 7). The old `scripts/restore-db.sh` has been removed |
| `docs/PRODUCTION-DEPLOYMENT.md` Phase 6 | `docker run ... -v eitf_hrms_eitf_db_backups:/backups` | The volume name is prefixed by the compose project (the directory name). Use `docker volume ls | grep eitf_db_backups` rather than a fixed name |
| `docs/BACKUP_AND_RECOVERY.md` | Restore drill quarterly | Same procedure is valid; this guide recommends monthly |
| `docs/DEPLOYMENT.md` | `NEXT_PUBLIC_API_URL` should be the public API base URL | With the Docker stack leave `NEXT_PUBLIC_API_URL` empty (same-origin `/api/v1`) as in `.env.production.example` |
| `AUDIT-REPORT.md` section 6 | Lists systemd as a "Non-Docker option" | `deploy/systemd/eitf-hrms.service` runs `docker compose`; it is not a non-Docker deployment |
| `AUDIT-REPORT.md`, `docs/PRODUCTION-DEPLOYMENT.md` | Sized and written for a cloud VPS (Hetzner, DigitalOcean, Contabo) | Use Section 2 of this guide for a dedicated or on-premise machine |
| `scripts/startup-verify.sh` | Checks `http://127.0.0.1:8080` unless `PUBLIC_APP_URL` is exported | When run alone with `PUBLIC_HTTP_PORT=80`, export `PUBLIC_HTTP_PORT` first. `deploy/up.sh` exports it for you |
