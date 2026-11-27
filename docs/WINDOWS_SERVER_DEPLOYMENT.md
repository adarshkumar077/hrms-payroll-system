# Deploying on your Windows server (16 GB RAM, static IP, Google Workspace)

This adds Windows-specific steps to `PRODUCTION_DEPLOYMENT_GUIDE.md`. **None of it has been run on
your server yet.** The server isn't reachable from the machine this release was built on.

## Step 0: run the readiness check and send the output

On the server, in PowerShell (Administrator), from the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\server-check.ps1
```

It changes nothing. It reports the OS support status, hardware, network/CGNAT, power settings,
Docker, listening ports, firewall and Defender.

## 1. Windows 10: upgrade before going public (blocker)

Windows 10 reached **end of support on 14 Oct 2025**. The free/consumer Extended Security Updates
ended on 13 Oct 2026. Unless the PC has a **paid commercial ESU** licence, it gets no security fixes,
and a machine holding salaries, PAN and bank details must not be exposed to the internet in that
state.

| Option | Effort | Notes |
|---|---|---|
| **Windows 11 Pro** (free in-place upgrade if the hardware is eligible: TPM 2.0, supported CPU) | Low | Keeps files and apps. Check with *PC Health Check*. Recommended if eligible |
| **Ubuntu Server 24.04 LTS** | Medium (clean install) | Best for a 24/7 Docker server: no Docker Desktop, systemd unit already in `deploy/systemd/`, updates until 2029 (2034 with Pro). Follow `PRODUCTION_DEPLOYMENT_GUIDE.md` directly |
| Windows Server 2022/2025 | Medium, licence cost | Docker on Windows Server needs extra setup for Linux containers; not recommended here |
| Stay on Windows 10 + commercial ESU | Licence cost | Acceptable only while ESU is active; plan the upgrade anyway |

Before any upgrade: back up the disk, and export `.env.production` and the backup key.

## 2. Install Docker

1. Enable **virtualization** (Intel VT-x / AMD-V) in the BIOS, then install WSL 2 from an
   Administrator PowerShell: `wsl --install`, and reboot.
2. Install **Docker Desktop**. Settings:
   * *Use the WSL 2 based engine*: on.
   * *Start Docker Desktop when you sign in*: on.
   * *Expose daemon on tcp://localhost:2375 without TLS*: **off**.
   * Resources: give WSL about 10 GB RAM (`%UserProfile%\.wslconfig` → `[wsl2]` `memory=10GB`).
   * Licensing: Docker Desktop is free for companies with fewer than 250 employees **and** less
     than USD 10 M annual revenue; above that a paid subscription is required.
3. Check: `docker version` and `docker compose version`.

## 3. Unattended 24/7 operation

Docker Desktop runs only while a user is signed in, so the server must sign in by itself after a
reboot or power cut:

| Setting | How |
|---|---|
| Power on after power loss | BIOS: *Restore on AC power loss = Power On* |
| Never sleep | `powercfg /change standby-timeout-ac 0` and `powercfg /change hibernate-timeout-ac 0` |
| Automatic sign-in | Use a dedicated local account (e.g. `hrms-svc`) and Microsoft Sysinternals **Autologon** (stores the password encrypted, not in plain text). Lock the screen automatically after sign-in (screen-saver lock 1 min) |
| Containers come back | Every service in `docker-compose.yml` has `restart: unless-stopped`, so they start as soon as Docker Desktop does |
| Updates | Settings → Windows Update → *Active hours* 07:00–22:00; install updates monthly in a maintenance window, after a backup |
| UPS | At least 30 minutes, with USB shutdown signalling |

Test: pull the power cable, plug it back in, and check that `https://<domain>/api/v1/health`
answers within about 5 minutes without anyone touching the server.

## 4. Get the release and configure it

```powershell
git clone https://github.com/adarshkumar077/hrms-payroll-system.git C:\eitf-hrms
cd C:\eitf-hrms
git checkout release/2026-11-production-hardening   # or main after the PR is merged
copy .env.production.example .env.production
notepad .env.production
```

`.gitattributes` keeps shell scripts in LF format, which the containers need. Do not convert them
to CRLF.

Generate each secret in PowerShell (run once per value):

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

Use one for each of `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `INTEGRATION_SECRET_KEY`, `OTP_HASH_SECRET` and `STORAGE_SIGNING_SECRET`.
`deploy\up.ps1` refuses to start while any `CHANGE_ME` remains.

Restrict the file to Administrators and the service account:

```powershell
icacls .env.production /inheritance:r /grant:r "Administrators:F" "hrms-svc:R"
```

## 5. Google Workspace SMTP (email OTP)

Choose **one**:

**A. A sending mailbox with an App Password (simplest)**
1. Create a mailbox such as `hrms-noreply@yourcompany.com` (a licensed user, or an alias of one).
2. Turn on 2-Step Verification for it, then create an **App Password** (Google Account → Security →
   App passwords). If that option is missing, your Workspace admin has disabled app passwords; use
   option B.
3. Settings:
   ```ini
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=hrms-noreply@yourcompany.com
   SMTP_PASSWORD=<16-character app password, no spaces>
   SMTP_FROM_EMAIL=hrms-noreply@yourcompany.com
   SMTP_FROM_NAME=EITF HRMS
   ```
   Limit: about 2,000 messages per day per mailbox, which is plenty for OTPs.

**B. Workspace SMTP relay (admin console)**
1. Admin console → Apps → Google Workspace → Gmail → Routing → **SMTP relay service** → Add:
   allowed senders *Only addresses in my domains*; authentication *Only accept mail from the
   specified IP addresses* → your static public IP (and/or *Require SMTP authentication*);
   *Require TLS encryption* on.
2. Settings: `SMTP_HOST=smtp-relay.gmail.com`, `SMTP_PORT=587`, and `SMTP_USER`/`SMTP_PASSWORD`
   only if you chose SMTP authentication.

For both options: `SMTP_FROM_EMAIL` must be an address in your domain. Gmail rewrites any other
From address. Make sure SPF (`include:_spf.google.com`) and **DKIM** (Admin console → Gmail →
Authenticate email) are on for the domain. Then follow `EMAIL_OTP_SETUP.md` §4 to send a real test
OTP.

## 6. Start the stack

```powershell
$env:ENABLE_SSL = 'false'
powershell -ExecutionPolicy Bypass -File deploy\up.ps1
```

`deploy\up.ps1` starts the stack with `.env.production` and waits for the health check. For HTTPS
by domain follow `PRODUCTION_DEPLOYMENT_GUIDE.md` §5–7 (the certbot container works the same way on
Docker Desktop). After the certificate is issued, use `$env:ENABLE_SSL = 'true'`.

Only nginx publishes ports. PostgreSQL and Redis are on the internal Docker network only, and
`server-check.ps1` should show no listener on 5432/6379.

## 7. Firewall and router

```powershell
powershell -ExecutionPolicy Bypass -File deploy\windows\firewall.ps1          # review the plan
powershell -ExecutionPolicy Bypass -File deploy\windows\firewall.ps1 -Apply   # apply (Administrator)
```

This allows 80/443 and blocks Postgres, Redis, the Docker API and the raw app ports. It does not
touch RDP: leave RDP off or LAN-only, **never** forward 3389, and use a VPN (Tailscale / WireGuard)
for remote administration. Undo with `-Remove`.

On the router, forward **only** TCP 80 and 443 to the server's reserved LAN IP
(`SERVER_CONFIGURATION.md` §3–4, including the CGNAT check).

## 8. Backups, monitoring and recovery

These are the same as on Linux: `DATABASE_BACKUP_AND_RESTORE.md` (the `db-backup` container
encrypts and uploads every night), `SERVER_CONFIGURATION.md` §8 (alerts to `ALERT_EMAILS`), and
`DISASTER_RECOVERY_PLAN.md`. Windows-specific extras:

* Turn on **BitLocker** for the system disk and store the recovery key with the other secrets.
* Docker's data lives inside the WSL virtual disk (`%LocalAppData%\Docker\wsl\…\ext4.vhdx`). Back up
  through `db-backup`, not by copying that file while it runs.
* Add an external uptime monitor on `https://<domain>/api/v1/health`, so a full power or internet
  outage still reaches you.
