# Server configuration

## 1. The machine inspected (27 Nov 2026)

The machine available in this session is the one the work was done on:

| Item | Found | Suitable for 24/7 production? |
|---|---|---|
| Hardware | ASUS ExpertBook **laptop**, Intel i5-1135G7 (4 cores / 8 threads), 16 GB RAM, 477 GB SSD | **Not recommended.** Laptops throttle and sleep, and their batteries swell under 24/7 load. Usable only as a temporary pilot |
| OS | Windows 11 Pro, Docker Desktop 29.5.3 (WSL 2) | Works. Linux (Ubuntu 24.04 LTS) is preferred: no Docker Desktop licence questions, fewer reboots, systemd unit provided |
| LAN address | DHCP (two addresses seen on the same subnet) | Needs a **DHCP reservation** on the router |
| Public IP | Seen from outside as `223.236.x.x` | Static according to you; not verified |
| Hop 2 of traceroute | `10.240.x.x` (private range) | **Possible CGNAT.** See section 3 |
| Other workloads | Another Docker stack (`eitf-hrms`, older build, port 9080) and `fleet-install` | Production should run on its own machine; that stack was not touched |

**Recommended server:** a small desktop or mini-PC, or a tower server, with at least 4 cores, 16 GB
RAM, a 500 GB SSD (a second disk or NAS for local backups is a plus), a wired gigabit LAN, a **UPS**
(at least 30 minutes, with USB shutdown signalling), and BIOS set to *power on after power loss*.
Measured load (`TESTING_RESULTS.md`): 50 simultaneous users with p95 under 1.1 s on the laptop CPU,
so this sizing has comfortable headroom for 50–150 staff.

## 2. Software layout (Docker Compose)

| Container | Role | Published to the network? |
|---|---|---|
| `nginx` | TLS termination, security headers, reverse proxy | **Yes: 80 (redirect only) and 443** |
| `web` | Next.js UI | No (internal network only) |
| `api` | NestJS API, runs as `node` (uid 1000) and connects to the database as `eitf_app` (DML only) | No |
| `postgres` | PostgreSQL 16 | No |
| `redis` | Cache / queues | No |
| `db-backup` | Nightly encrypted backup and off-site copy | No |
| `certbot` (profile `ssl`) | Let's Encrypt renewal | No |

Start: `docker compose -f docker-compose.yml -f docker-compose.ip-https.yml --env-file .env.production up -d --build`
(or `deploy/up.sh`; `deploy/systemd/` has a unit that starts it on boot).

## 3. Internet access: CGNAT check (must be done before launch)

If your ISP puts the connection behind **carrier-grade NAT**, port forwarding cannot work, whatever
the router is set to.

1. Open the router's status page and read its **WAN IP**.
2. Compare it with the public IP shown by any "what is my IP" site.
   * **Same** → no CGNAT; port forwarding will work.
   * **Different**, or the WAN IP is in `100.64.0.0/10`, `10.x`, `172.16–31.x` or `192.168.x` → CGNAT.
     Ask the ISP for a **real static public IPv4** (usually a paid add-on on business plans), or use
     the Cloudflare Tunnel option (`--profile tunnel`, no inbound ports needed).

The traceroute hop `10.240.x.x` is the ISP's internal network. It *suggests* CGNAT but doesn't prove
it, so the WAN IP comparison above is the deciding test.

## 4. Router / port forwarding plan

| Rule | External | Internal | Note |
|---|---|---|---|
| HTTPS | TCP 443 | `<server LAN IP>`:443 | Required |
| HTTP | TCP 80 | `<server LAN IP>`:80 | Only for Let's Encrypt validation and the redirect to HTTPS |
| Nothing else | — | — | **Never forward** 22 (SSH), 3389 (RDP), 5432 (Postgres), 6379 (Redis), 2375/2376 (Docker) or the router admin page |

Safety (to avoid locking yourself out):
* Change one rule at a time and keep a screenshot of the router configuration before changing it.
* Do **not** disable the router's LAN-side admin access, and don't change the LAN subnet.
* Remote administration: use a VPN (WireGuard or Tailscale) into the LAN, never an open port. This
  has not been set up; it needs your approval.

## 5. HTTPS certificate

A certificate that browsers trust without warnings needs **a domain name** (for example
`hrms.yourcompany.com`) whose DNS A record points to your static IP. Then:

```bash
docker compose --profile ssl run --rm certbot certonly --webroot -w /var/www/certbot -d hrms.yourcompany.com
```

and switch nginx to the SSL template (`deploy/nginx/conf.d/eitf-hrms-ssl.conf.template`, see
`PRODUCTION_DEPLOYMENT_GUIDE.md`). Renewal runs from the `certbot` service, and monitoring warns 21
days before expiry (`TLS_CHECK_HOST`).

Without a domain, the only option in the repository is the company CA in `deploy/ip-https/`. That
needs the CA installed on every device, so it is fine for an office LAN but **not** for "access from
anywhere". Some public CAs now issue short-lived certificates for bare IP addresses, but that is not
configured here and is fragile; a domain is the reliable route.

## 6. Host firewall

Linux (ufw): allow 80 and 443, allow 22 **only from the admin PC or the VPN subnet**, deny everything
else. Full commands, including the Docker `DOCKER-USER` chain rules that make the firewall also apply
to published container ports, are in `PRODUCTION-FIREWALL.md`.

Windows (if you keep a Windows host): allow inbound 80/443 only on the *Private* profile, keep RDP
disabled or limited to the VPN, and keep Docker Desktop's *expose daemon on tcp://localhost:2375*
**off**.

## 7. Rate limits (environment)

Everyone in the office reaches the server from one public IP, so the per-IP limits are sized for the
whole office. Per-account protection is separate (account lockout, 5 OTPs per hour per mobile, 5 wrong
codes per OTP).

| Variable | Default | Meaning |
|---|---|---|
| `THROTTLE_LIMIT_PER_MINUTE` | 1200 | All API requests per IP |
| `AUTH_LOGIN_LIMIT_PER_MINUTE` | 60 | Login attempts per IP |
| `AUTH_FAILED_LOGIN_LIMIT` | 10 | **Failed** logins per IP in 10 minutes, then 429 (successes are not counted) |
| `OTP_REQUEST_LIMIT_PER_MINUTE` | 30 | OTP requests per IP |
| `OTP_MAX_PER_IP_PER_HOUR` | 300 | OTP requests per IP per hour |

## 8. Monitoring and alerts

The API checks every 15 minutes. It emails `ALERT_EMAILS` for every **critical** result and for
backup or disk **warnings** (the same alert is repeated at most every 6 hours). All results are
shown on the health page.

| Check | Warning | Critical |
|---|---|---|
| Database | response > 2 s | not responding |
| Disk (data volume) | < 15 % free | < 10 % free |
| Memory / CPU | < 10 % RAM free, or load > 2 × CPU count | < 5 % RAM free |
| Backup | not encrypted / no off-site copy | missing, failed, or older than 26 h |
| Email delivery | any failed send in the last hour | ≥ 3 failed sends in 15 min |
| Failed logins (15 min) | ≥ 20 | ≥ 50 |
| TLS certificate (`TLS_CHECK_HOST`) | < 21 days to expiry | < 7 days, or endpoint unreachable |

Dashboard: `GET /api/v1/admin/system-health?refresh=1` (Super Admin). Also recommended: an external
uptime check (UptimeRobot, Better Stack or similar) on `https://<domain>/api/v1/health`, so that a
full power or internet outage, which the server itself cannot report, still reaches you.

## 9. Secrets (`.env.production`, `chmod 600`, never committed)

Generate each with `openssl rand -hex 32`: `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INTEGRATION_SECRET_KEY`, `OTP_HASH_SECRET`,
`STORAGE_SIGNING_SECRET`. Also set `SMTP_*`, `BACKUP_AGE_RECIPIENT` (public key only),
`BACKUP_RCLONE_REMOTE`, `ALERT_EMAILS`, `CORS_ORIGINS` / `PUBLIC_APP_URL` = `https://<domain>` and
`COOKIE_SECURE=true`. Keep a copy in the company password manager.
