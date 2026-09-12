# Hosting Orbit when your Bluehost plan can't run Node

## Read this first — the hard truth

Orbit is a **Next.js server application** (server-side rendering + server actions + API routes + a live Prisma database). It **requires a running Node.js process**. Concretely, this codebase has:
- 27 files with server actions (`"use server"`)
- 9 API route handlers
- 42 server-rendered pages
- 54 files that query the database at request time

**A "simple" Bluehost shared plan (Apache + PHP + MySQL, no Node) physically cannot run this.** There is no workaround that keeps the app working:
- **Static export (`next export`) will NOT work.** It would strip login, the database, every server action, and every API route — you'd be left with dead HTML shells. The app would not function at all.
- **Uploading the files to public_html does nothing** — Apache/PHP can't execute a Node server.

So the question isn't "how do I make Node run on a PHP host" (you can't) — it's **"where do I run the Node app, and how do I keep using Bluehost for the domain."** That's below, and it's cheap and simple.

## Step 0 — 60-second check (you might already have Node)
Some Bluehost cPanel plans include a **"Setup Node.js App"** tool (CloudLinux Passenger). Log into cPanel and look under **Software** for **"Setup Node.js App."**
- **If it's there** → you *can* host on Bluehost directly. Follow **[SHARED-HOSTING-SETUP.md](SHARED-HOSTING-SETUP.md)** + **[LAUNCH.md](LAUNCH.md)** and ignore the rest of this file.
- **If it's not there** (your case) → continue below.

## The recommended setup: Bluehost for the domain, a Node host for the app

Keep Bluehost for what it's good at (your domain, email, any marketing/landing site). Run the **app** on a host that runs Node, and connect them with one DNS record. Users go to `app.yourdomain.com` and never know it's elsewhere.

```
yourdomain.com          → stays on Bluehost (marketing site / email)
app.yourdomain.com      → DNS A record → your Node host (runs Orbit)
```

### Pick a Node host

| Option | Cost | Effort | Best when |
|---|---|---|---|
| **Render** (Web Service) | Free tier / ~$7 mo | Lowest — no server admin | You want it live fast, git-based deploys |
| **Railway / Fly.io** | ~$5 mo | Low | Similar to Render |
| **Small VPS** (Hetzner ~€4, DigitalOcean/Vultr $6) | ~$5 mo | Medium — you run the box | Cheapest, full control, best for SQLite |
| **Bluehost VPS/Dedicated** | $$$ | Medium | You want to stay 100% within Bluehost (upgrade from shared) |

**Database:** on any multi-instance/managed host, use **external Postgres** (Neon or Supabase free tier) rather than the bundled SQLite. On a single VPS, SQLite is fine.

---

## Path A — Render (easiest, no server admin)

1. Put the repo on GitHub (Render deploys from git). If you don't use git, Render also supports Docker image or manual deploy — but git is simplest.
2. Create a **Neon** (or Supabase) free Postgres DB → copy its connection string.
3. Locally, prepare the Postgres schema + seed:
   ```bash
   set DATABASE_URL=postgres://…           # your Neon string (use `export` on mac/linux)
   npm run db:migrate:deploy               # applies prisma/migrations to Neon
   npm run db:postgres:seed                # optional demo data
   ```
4. On Render → **New → Web Service** → connect the repo. Set:
   - **Build command:** `npm install && npm run build`
   - **Start command:** `npm start`
   - **Environment variables:** `AUTH_SECRET` (strong 48-char), `DATABASE_URL` (the Neon string), `NODE_ENV=production`, plus optional `LLM_*` / `OCR_MODEL` / `CRON_SECRET`.
5. Deploy. Render gives you `https://orbit-xxxx.onrender.com`. Verify `…/api/health` → `{"status":"ok","db":true}`.
6. **DNS:** in Render add a custom domain `app.yourdomain.com`; in **Bluehost cPanel → Zone Editor**, add the CNAME/A record Render shows you.
7. **Cron** (reminders): Render → add a **Cron Job** hitting `POST /api/cron` with the `x-cron-secret` header.

*Note: Render's free tier sleeps on inactivity (cold starts). Use the paid Starter (~$7) for an always-on client app.*

---

## Path B — Cheap VPS (most control, ~$5/mo, SQLite works)

On a fresh Ubuntu VPS (Hetzner/DigitalOcean/Vultr):

```bash
# 1. Install Node 20 + a process manager + nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm i -g pm2

# 2. Upload the deploy artifact you built locally (npm run package → ./deploy),
#    OR clone the repo and run: npm install && npm run build
#    Put it at /var/www/orbit

# 3. Env + start (SQLite: use an ABSOLUTE DATABASE_URL)
cd /var/www/orbit
export AUTH_SECRET="<48-char random>"
export DATABASE_URL="file:/var/www/orbit/prisma/dev.db"
export NODE_ENV=production PORT=3000
pm2 start server.js --name orbit     # (if using the standalone artifact)
pm2 save && pm2 startup              # survive reboots
```

```nginx
# 4. /etc/nginx/sites-available/orbit — reverse proxy 80→3000, then enable + certbot for HTTPS
server {
  server_name app.yourdomain.com;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/orbit /etc/nginx/sites-enabled/ && sudo nginx -s reload
sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d app.yourdomain.com
# 5. cron for reminders:
crontab -e   # add:  0 * * * * curl -s -X POST https://app.yourdomain.com/api/cron -H "x-cron-secret: YOURSECRET"
```

**DNS:** point `app.yourdomain.com` (A record) at the VPS IP — set this in **Bluehost cPanel → Zone Editor**. `yourdomain.com` stays on Bluehost.

---

## Path C — Stay on Bluehost: upgrade to their VPS/Dedicated
If you must keep everything under one Bluehost bill, upgrade from **shared** to **Bluehost VPS or Dedicated** (root access). Then follow **Path B** on that box. Shared → no Node; VPS → Node works.

## Bottom line
- Your current Bluehost **shared** plan **cannot** run Orbit. No file layout, no static export, no PHP shim changes that.
- Cheapest working setup: **~$5/mo** (a small VPS or Render Starter) + **free** Postgres (Neon), with the domain still on Bluehost via one DNS record.
- Everything else (build artifact, env vars, engines, absolute-SQLite rule) is already solved in **[LAUNCH.md](LAUNCH.md)** / **[SHARED-HOSTING-SETUP.md](SHARED-HOSTING-SETUP.md)** — the only change is *where the Node process runs.*
