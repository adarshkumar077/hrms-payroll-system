# Final Launch Guide — HRMS + Payroll + CRM (Web + Mobile + VPS)

## Honest status (read first)

| Item | Status |
|------|--------|
| Application code (web + API + CRM + security) | ✅ Ready in repo |
| Docker production stack | ✅ Ready — `docker-compose.yml` |
| Mobile app (Android/iOS via Expo) | ✅ Ready — needs `eas build` with your HTTPS URL |
| **Permanent HTTPS URL** | ⏳ **You must provide domain + VPS + Cloudflare** |
| **24×7 without laptop** | ⏳ **Requires VPS deploy** (steps below) |
| **25-day soak test** | ⏳ **Not run** — use `scripts/soak-test.mjs` on VPS after launch |

**I cannot create your live HTTPS URL from this laptop.** Follow the steps below on a cloud VPS to get `https://hrms.yourdomain.com`.

---

## Architecture (production)

```
Users (Web / Android / iOS)
        │
        ▼ HTTPS
Cloudflare Edge (Tunnel or DNS)
        │
        ▼
VPS Docker: nginx → web (Next.js) + api (NestJS)
                    postgres + redis + db-backup
```

- **No localhost, no 192.168.x.x** in production config
- Database **not** exposed to internet
- Same API for web and mobile: `https://hrms.yourdomain.com/api/v1`

---

## Step 1 — Cloud VPS (4 GB RAM minimum)

Providers: Hetzner CX22, DigitalOcean 4GB, Contabo VPS S.

```bash
ssh root@YOUR_VPS_IP
curl -fsSL https://get.docker.com | sh
```

---

## Step 2 — Deploy application

```bash
mkdir -p /opt/eitf-hrms && cd /opt/eitf-hrms
# Upload project (git clone or scp)
git clone YOUR_REPO_URL .

cp .env.production.example .env.production
nano .env.production
```

**Required in `.env.production`:**

```env
POSTGRES_PASSWORD=<openssl rand -base64 32>
JWT_ACCESS_SECRET=<openssl rand -base64 32>
JWT_REFRESH_SECRET=<openssl rand -base64 32>
PUBLIC_APP_URL=https://hrms.yourcompany.com
CORS_ORIGINS=https://hrms.yourcompany.com
CLOUDFLARE_TUNNEL_TOKEN=<from Cloudflare dashboard>
PUBLIC_HTTP_PORT=8080
```

**Start (one command):**

```bash
chmod +x deploy/up.sh scripts/*.sh
./deploy/up.sh
# or:
docker compose --env-file .env.production --profile tunnel up -d --build
```

**Auto-start on reboot:**

```bash
sudo cp deploy/systemd/eitf-hrms.service /etc/systemd/system/
sudo systemctl enable --now eitf-hrms
```

---

## Step 3 — Cloudflare Tunnel (permanent HTTPS)

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com) → **Networks → Tunnels → Create**
2. Connector: **Docker** → copy token → `CLOUDFLARE_TUNNEL_TOKEN` in `.env.production`
3. Public hostname: `hrms.yourcompany.com` → Service: **`http://nginx:80`**
4. Restart: `docker compose --env-file .env.production --profile tunnel up -d`

**Your permanent URL:** `https://hrms.yourcompany.com`

---

## Step 4 — Mobile (Android + iOS)

Same backend as web. **No localhost in production builds.**

```bash
cd apps/mobile
cp .env.production.example .env.production
# Set EXPO_PUBLIC_API_URL=https://hrms.yourcompany.com/api/v1

npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile production   # APK/AAB
eas build -p ios --profile production       # requires Apple Developer account
```

Update `eas.json` production `env.EXPO_PUBLIC_API_URL` to your domain before building.

**Test logins on mobile:** same User IDs as web (`superadmin`, `emp001`, etc.).

---

## Step 5 — Pre-launch verification

```bash
# On VPS after HTTPS is live:
node scripts/smoke-test.mjs https://hrms.yourcompany.com
node scripts/security-pentest.mjs https://hrms.yourcompany.com
node scripts/load-test.mjs https://hrms.yourcompany.com 15
```

### Launch checklist

- [ ] HTTPS works from mobile data (laptop OFF)
- [ ] All 4 roles login: superadmin, admin, hr001, emp001
- [ ] HRMS: employees, attendance, leave, payroll
- [ ] CRM: leads, tasks, assign, complete, verify
- [ ] Backups: `docker volume ls | grep eitf_db_backups`
- [ ] Restore test: `scripts/restore-db.sh` (on staging copy)
- [ ] Change default passwords after first login
- [ ] Remove demo data if any

---

## Step 6 — 15–25 day stability (measured, not assumed)

On VPS after go-live:

```bash
# 24-hour soak (repeat during pilot)
nohup node scripts/soak-test.mjs https://hrms.yourcompany.com 1440 60 >> /var/log/eitf-soak.log 2>&1 &

# Monitor every 5 min
*/5 * * * * cd /opt/eitf-hrms && node scripts/monitor-health.mjs >> /var/log/eitf-monitor.log 2>&1

# Resource usage
docker stats --no-stream
```

Record results in `docs/PERFORMANCE-REPORT.md`. **Do not claim 25-day stability until 25 days of logs exist.**

---

## Approved test accounts (change passwords after launch)

| Role | User ID | Password |
|------|---------|----------|
| Super Admin | `superadmin` | `Super@123` |
| Admin | `admin` | `Admin@123` |
| HR | `hr001` | `HR@123` |
| Employee | `emp001` | `Emp@123` |

---

## Exact production commands (summary)

```bash
# VPS — full deploy
cd /opt/eitf-hrms
docker compose --env-file .env.production --profile tunnel up -d --build
docker compose ps
node scripts/smoke-test.mjs https://hrms.yourcompany.com

# Update after code change
git pull
docker compose --env-file .env.production --profile tunnel up -d --build

# Backup manually
docker exec eitf-hrms-db-backup /usr/local/bin/backup-db.sh

# Logs
docker compose logs -f api nginx cloudflared
```

---

## Known limitations

1. **Permanent URL** requires your domain + VPS — not available until you complete Step 2–3.
2. **Mobile store publish** requires Apple/Google developer accounts (EAS builds the apps; you submit to stores).
3. **Some CRM features** (Kanban drag-drop, call logs module) are partial — core leads/tasks/pipeline work in existing HRMS UI.
4. **25-day test** must be run on production VPS; results not pre-generated.

---

## Related docs

- [PRODUCTION-DEPLOYMENT.md](./PRODUCTION-DEPLOYMENT.md) — detailed VPS/Docker/SSL
- [SECURITY-REPORT.md](./SECURITY-REPORT.md) — security audit & fixes
- [PERFORMANCE-REPORT.md](./PERFORMANCE-REPORT.md) — load/soak results template
