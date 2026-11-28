# Final server configuration

**Your server:** Windows 10 PC, 16 GB RAM, public static IP, Google Workspace, intended 24/7.
**Status:** configuration prepared and tested on an isolated copy on the build laptop. **Not yet
applied to your server**, which isn't reachable from the build environment. Nothing on your server
or router has been changed.

## 1. Operating system decision (needs your approval)

| | Windows 10 (current) | Windows 11 Pro | Ubuntu Server 24.04 LTS |
|---|---|---|---|
| Security updates | **None** since 13 Oct 2026, unless you pay for commercial ESU | Yes | Yes, to 2029 (2034 with Pro) |
| Change needed | — | In-place upgrade (keeps data) if TPM 2.0 + supported CPU | Clean install |
| Docker | Docker Desktop (needs a signed-in user) | Docker Desktop | Docker Engine as a system service (no sign-in needed) |
| Recommendation | **Do not expose to the internet** | ✅ if the hardware is eligible | ✅ best for a dedicated 24/7 server |

**Your choice is needed.** I have not upgraded or reinstalled anything. First run the read-only
check on the server: `powershell -ExecutionPolicy Bypass -File deploy\windows\server-check.ps1`.

## 2. What runs where

| Component | Configuration | Publicly reachable |
|---|---|---|
| nginx (HTTPS gateway) | TLS 1.2+, HSTS, security headers, rate limits, HTTP→HTTPS redirect | **Yes, 443 (and 80 for the redirect / certificate validation)** |
| Web (Next.js), API (NestJS) | Non-root containers, Node 22 | No: internal Docker network only |
| PostgreSQL 16 | Persistent volume `eitf_postgres_data`; API connects as DML-only `eitf_app` | No |
| Redis | Persistent volume | No |
| Uploads | Volume `eitf_uploads` (documents, attendance selfies) | No (signed URLs through the API) |
| Backups | `db-backup` container: nightly, verified, age-encrypted, off-site via rclone | No |
| Monitoring | API health checks every 15 min → `ALERT_EMAILS`; external uptime monitor recommended | — |
| Restart | `restart: unless-stopped` on every service; on Windows, auto sign-in plus Docker Desktop start at sign-in; BIOS power-on after AC loss | — |

## 3. Network and firewall

* **Router:** forward only TCP **443** and **80** to the server's reserved LAN IP. Never forward
  3389 (RDP), 22, 5432, 6379, 2375. Check for CGNAT first: the router's WAN IP must equal the public
  IP (`SERVER_CONFIGURATION.md` §3).
* **Windows Firewall:** `deploy\windows\firewall.ps1 -Apply` allows 80/443 and blocks the database,
  Redis, Docker API and internal app ports. It never touches RDP. Undo with `-Remove`.
* **Remote administration:** VPN only (Tailscale/WireGuard). Needs your approval.

## 4. HTTPS

A browser-trusted certificate needs a **domain name** (for example `hrms.yourcompany.com`) whose DNS
A record points to your static IP. Let's Encrypt is issued and renewed by the `certbot` service,
and monitoring warns 21 days before expiry. **Needed from you:** the domain and DNS access.

## 5. Email OTP: Google Workspace

Either an app password on a sending mailbox (`smtp.gmail.com:587`) or the Workspace SMTP relay
(`smtp-relay.gmail.com:587`, restricted to your static IP). SPF and DKIM must be on. Full steps:
`WINDOWS_SERVER_DEPLOYMENT.md` §5. **Needed from you:** the mailbox/app password or relay set up in
the Admin console, and one real test employee inbox.

## 6. Environment settings (`.env.production`, never committed)

Generated per install: `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `INTEGRATION_SECRET_KEY`, `OTP_HASH_SECRET`, `STORAGE_SIGNING_SECRET`.
From you: `SMTP_*`, `PUBLIC_APP_URL`/`CORS_ORIGINS` (the domain), `ALERT_EMAILS`,
`BACKUP_AGE_RECIPIENT` (public key), `BACKUP_RCLONE_REMOTE` + rclone config. Rate limits are sized
for an office behind one IP (`SERVER_CONFIGURATION.md` §7).

Detailed references: `WINDOWS_SERVER_DEPLOYMENT.md`, `SERVER_CONFIGURATION.md`,
`PRODUCTION-FIREWALL.md`.
