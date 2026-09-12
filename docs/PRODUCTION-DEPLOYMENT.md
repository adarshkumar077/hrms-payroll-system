# EITF HRMS + Payroll + CRM — Production Deployment Guide

Complete guide for **24×7 Docker deployment on a Cloud VPS** with **one permanent HTTPS URL** via Cloudflare Tunnel (recommended) or Let's Encrypt.

---

## Architecture

```
Internet (HTTPS)
    │
    ▼
Cloudflare Edge  ──or──  Let's Encrypt (nginx :443)
    │
    ▼
cloudflared (Docker)  ──►  nginx :80  ──►  web :3000 (Next.js)
                         └──►  api :3001 (NestJS)
                                    │
                         postgres + redis (persistent volumes)
```

**No localhost, LAN IP, or laptop dependency** once deployed on VPS.

---

## Phase 1 — VPS Provisioning

### Recommended providers
| Provider | Spec (10–15 users) | Est. cost |
|----------|-------------------|-----------|
| Hetzner CX22 | 2 vCPU, 4 GB RAM, 40 GB SSD | ~€4/mo |
| DigitalOcean | 2 vCPU, 4 GB RAM | ~$18/mo |
| Contabo VPS S | 4 vCPU, 8 GB RAM | ~€5/mo |

### Minimum requirements
- **OS:** Ubuntu 22.04 LTS or 24.04 LTS
- **RAM:** 4 GB (8 GB recommended for headroom)
- **Disk:** 40 GB SSD
- **Ports:** 22 (SSH) only when using Cloudflare Tunnel

### Initial server setup

```bash
ssh root@YOUR_VPS_IP

# Create deploy user
adduser eitf
usermod -aG sudo eitf
su - eitf

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose plugin (included in modern Docker)
docker compose version
```

---

## Phase 2 — Deploy Application

```bash
# On VPS
sudo mkdir -p /opt/eitf-hrms
sudo chown $USER:$USER /opt/eitf-hrms
cd /opt/eitf-hrms

# Upload project (git clone or scp)
git clone YOUR_REPO_URL .
# OR: scp -r ./eitf-hrms/* eitf@VPS:/opt/eitf-hrms/

cp .env.production.example .env.production
nano .env.production   # set secrets (see below)
```

### Required environment variables

```env
POSTGRES_PASSWORD=<strong-random-32+>
JWT_ACCESS_SECRET=<random-32+>
JWT_REFRESH_SECRET=<random-32+>
PUBLIC_APP_URL=https://hrms.yourcompany.com
CORS_ORIGINS=https://hrms.yourcompany.com
CLOUDFLARE_TUNNEL_TOKEN=<from Cloudflare dashboard>
```

Generate secrets:
```bash
openssl rand -base64 32
```

### One-command startup

```bash
chmod +x deploy/up.sh scripts/*.sh
./deploy/up.sh
```

Or manually:
```bash
docker compose --env-file .env.production --profile tunnel up -d --build
```

Verify:
```bash
bash scripts/startup-verify.sh
docker compose ps
docker compose logs -f --tail=50
```

---

## Phase 3 — Cloudflare Tunnel (Permanent HTTPS URL)

### Why Cloudflare Tunnel?
- **One permanent HTTPS URL** (e.g. `https://hrms.yourcompany.com`)
- **No public IP / port forwarding** on VPS firewall
- **Works from office, home, mobile data** worldwide
- Automatic DDoS protection at Cloudflare edge

### Setup steps

1. Add your domain to [Cloudflare](https://dash.cloudflare.com)
2. Go to **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
3. Choose **Docker** connector → copy the **tunnel token**
4. Add **Public Hostname**:
   - Subdomain: `hrms` (or `@` for root)
   - Domain: `yourcompany.com`
   - Service: `http://nginx:80` *(Docker internal hostname)*
5. Paste token into `.env.production`:
   ```env
   CLOUDFLARE_TUNNEL_TOKEN=eyJh...
   PUBLIC_APP_URL=https://hrms.yourcompany.com
   CORS_ORIGINS=https://hrms.yourcompany.com
   ```
6. Restart stack:
   ```bash
   docker compose --env-file .env.production --profile tunnel up -d
   ```

### Verify
- Open `https://hrms.yourcompany.com` from phone (mobile data, not Wi-Fi)
- Login: `superadmin` / `Super@123` — **change password immediately**
- API: `https://hrms.yourcompany.com/api/v1/health`

---

## Phase 4 — Let's Encrypt (Alternative to Cloudflare)

If you prefer direct VPS HTTPS without Cloudflare:

```bash
# Point DNS A record: hrms.yourdomain.com → VPS public IP
# Open firewall ports 80 and 443
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable

# In .env.production:
PUBLIC_HTTP_PORT=80
PUBLIC_HTTPS_PORT=443

chmod +x deploy/certbot/init-letsencrypt.sh
./deploy/certbot/init-letsencrypt.sh hrms.yourdomain.com admin@yourdomain.com

docker compose --env-file .env.production --profile ssl up -d
```

Certificates auto-renew via the `certbot` container every 12 hours.

---

## Phase 5 — Auto-start on Server Reboot

```bash
sudo cp deploy/systemd/eitf-hrms.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable eitf-hrms
sudo systemctl start eitf-hrms
```

After reboot: `systemctl status eitf-hrms`

---

## Phase 6 — Database & Backups

### Persistence
All data stored in Docker volumes:
- `eitf_postgres_data` — database
- `eitf_uploads` — documents
- `eitf_db_backups` — daily pg_dump archives

Survives: `docker compose restart`, server reboot, container rebuild.

### Manual backup
```bash
docker exec eitf-hrms-db-backup /usr/local/bin/backup-db.sh
docker run --rm -v eitf_hrms_eitf_db_backups:/backups alpine ls -lh /backups
```

### Restore
```bash
gunzip -c backup.sql.gz | docker exec -i eitf-hrms-postgres psql -U eitf -d eitf_hrms
```

### Migrations
Run automatically on API container start via `docker-entrypoint.sh`:
```bash
npx prisma migrate deploy
```

---

## Phase 7 — Security Checklist

| Control | Status |
|---------|--------|
| Helmet (HTTP headers) | ✅ NestJS |
| JWT auth | ✅ |
| bcrypt password hashing | ✅ |
| Rate limiting (120/min) | ✅ ThrottlerGuard |
| Input validation | ✅ ValidationPipe |
| SQL injection | ✅ Prisma parameterized queries |
| CORS | ✅ PUBLIC_APP_URL / CORS_ORIGINS |
| Secrets in env | ✅ .env.production (not committed) |
| nginx security headers | ✅ |
| HTTPS only (public) | ✅ Cloudflare / Let's Encrypt |

---

## Phase 8 — Monitoring & Logs

### Health endpoints
| URL | Purpose |
|-----|---------|
| `/api/v1/health` | API + DB + Redis + memory |
| `/nginx-health` | Reverse proxy alive |

### Cron monitor (every 5 min)
```bash
crontab -e
*/5 * * * * cd /opt/eitf-hrms && node scripts/monitor-health.mjs >> /var/log/eitf-monitor.log 2>&1
```

### Logs
```bash
docker compose logs -f api          # API errors
docker compose logs -f nginx         # Access / proxy
docker compose logs -f cloudflared   # Tunnel status
docker stats                         # CPU / RAM live
```

Log rotation: configured via `json-file` driver (20 MB × 5 files per container).

---

## Phase 9 — Load & Soak Testing

### Load test (10 / 15 / 20 users)
```bash
node scripts/load-test.mjs https://hrms.yourcompany.com 10
node scripts/load-test.mjs https://hrms.yourcompany.com 15
node scripts/load-test.mjs https://hrms.yourcompany.com 20
```

Simulates: login, dashboard, attendance punch, leave, payroll, CRM leads/tasks, profile.

### Soak test (stability)
```bash
# 1 hour locally
node scripts/soak-test.mjs https://hrms.yourcompany.com 60 30

# 24 hours on VPS (background)
nohup node scripts/soak-test.mjs https://hrms.yourcompany.com 1440 60 >> soak.log 2>&1 &
```

### 15–25 day office validation
Run soak test via systemd timer or cron during pilot period. Monitor:
```bash
docker stats --no-stream
node scripts/monitor-health.mjs
```

---

## Phase 10 — Performance Targets

| Metric | Target | How to verify |
|--------|--------|---------------|
| Dashboard load | < 2 s | Browser DevTools / load-test web-dashboard |
| API avg latency | < 500 ms | `scripts/load-test.mjs` |
| 10 concurrent users | 0 failures | load-test concurrency=10 |
| 15 concurrent users | 0 failures | load-test concurrency=15 |
| 20 concurrent users | 0 failures | load-test concurrency=20 |

### Optimizations applied
- PostgreSQL connection pooling (`connection_limit=20`)
- Prisma indexes on hot tables (employees, attendance, CRM)
- nginx gzip compression
- Next.js standalone build + static asset caching
- Redis session/cache layer
- API pagination on list endpoints
- Throttler rate limiting

---

## Project Structure (Production)

```
eitf-hrms/
├── docker-compose.yml          # Full production stack
├── .env.production.example     # Environment template
├── .dockerignore
├── apps/
│   ├── api/Dockerfile          # NestJS API
│   └── web/Dockerfile          # Next.js frontend
├── deploy/
│   ├── nginx/                  # Reverse proxy config
│   ├── cloudflare/             # Tunnel reference config
│   ├── certbot/                # Let's Encrypt init
│   ├── systemd/                # Auto-start on reboot
│   ├── up.sh / up.ps1          # Deploy scripts
├── scripts/
│   ├── backup-db.sh            # Daily pg_dump
│   ├── load-test.mjs           # Concurrent user test
│   ├── soak-test.mjs           # Long-running stability
│   ├── monitor-health.mjs      # Cron health probe
│   └── startup-verify.sh       # Post-deploy checks
└── docs/
    └── PRODUCTION-DEPLOYMENT.md
```

---

## Final Validation Checklist

Before going live with 10–15 employees:

- [ ] `docker compose up -d --build` succeeds on VPS
- [ ] `https://YOUR_DOMAIN` loads from mobile data (laptop off)
- [ ] Login works for all 4 roles
- [ ] Attendance punch in/out works
- [ ] CRM leads and tasks work
- [ ] Payroll pages load
- [ ] File upload works
- [ ] `/api/v1/health` returns `"status":"ok"`
- [ ] `docker compose restart` — app recovers
- [ ] VPS reboot — app auto-starts (systemd)
- [ ] Database backup file exists in volume
- [ ] Load test 15 users — PASS
- [ ] Passwords changed from defaults

---

## Support Commands

```bash
# Restart single service
docker compose restart api

# Rebuild after code update
git pull && docker compose --env-file .env.production --profile tunnel up -d --build

# View resource usage
docker stats --no-stream

# Shell into database
docker exec -it eitf-hrms-postgres psql -U eitf -d eitf_hrms

# Emergency stop
docker compose down

# Emergency stop (keep data)
docker compose stop
```

---

**Your permanent URL:** Set `PUBLIC_APP_URL` in `.env.production` after Cloudflare Tunnel hostname is configured. The application runs 24×7 on VPS — your laptop can be off.
