# Backup & Recovery

## What the product stores

1. **PostgreSQL**: system of record (employees, payroll, leave, workflows, audit, …). Backed up by the `db-backup` service (section below).
2. **In-app JSON backups**: `POST /security/backups/run` writes snapshots under `data/backups/<companyId>/` (gitignored). Includes company settings, employees, users (no password hashes beyond what is selected), recent payroll, leave balances, recent audit.
3. **Scheduled JSON backups**: hourly cron checks `security.backup_enabled` + `security.backup_hour_utc` and runs one successful schedule backup per day per company.

## Postgres backups (`db-backup` service)

Every day at `BACKUP_HOUR_UTC` (default 20:00 UTC = 01:30 IST) the container:

1. runs `pg_dump -Fc` into the `eitf_db_backups` volume at `/backups`;
2. encrypts the dump with **age** to `eitf_hrms_<UTC timestamp>.dump.age` (if `BACKUP_AGE_RECIPIENT` is set);
3. deletes local files older than `BACKUP_RETENTION_DAYS`;
4. uploads the encrypted file with **rclone** to `BACKUP_RCLONE_REMOTE` and deletes remote files older than the same limit.

Behaviour when settings are missing:

| Setting unset | Result |
|---|---|
| `BACKUP_AGE_RECIPIENT` | Dump is kept **unencrypted**, local only, with a `WARNING` in the logs. Uploads are refused. |
| `BACKUP_RCLONE_REMOTE` | Backup stays local, with a `WARNING`. No upload. |

Only a failed `pg_dump` (or failed encryption) makes the run exit non-zero. Upload failures are logged as `ERROR` and the local copy is kept. Check the logs after each night:

```bash
docker compose --env-file .env.production logs --since 26h db-backup | grep -E 'ERROR|WARNING|dump complete|uploading'
```

### Settings

| Variable | Purpose |
|---|---|
| `BACKUP_AGE_RECIPIENT` | age **public** key (`age1…`). Encrypts every dump. |
| `BACKUP_RCLONE_REMOTE` | rclone destination, e.g. `r2:eitf-hrms-backups`. |
| `BACKUP_RCLONE_CONFIG_DIR` | Host folder with `rclone.conf` (default `./deploy/backup/rclone`), mounted read-only at `/config/rclone`. |
| `BACKUP_HOUR_UTC` | Daily run hour, UTC (default 20). |
| `BACKUP_RETENTION_DAYS` | Retention, local and remote (default 14). |

## One-time setup

### 1. Create the age key pair (on your own workstation, not the server)

```bash
brew install age            # or: apt install age / winget install FiloSottile.age
age-keygen -o backup.key
```

- `age-keygen` prints the **public key** (`age1…`) to stderr. Put that line in `.env.production` as `BACKUP_AGE_RECIPIENT=`.
- `backup.key` is the **private key**. Keep it **off the server**: store it in a password manager or an offline medium, and keep a second copy somewhere separate. Without it, off-site backups cannot be decrypted.
- Only the public key ever goes into the server configuration.

### 2. Create an off-site bucket and an rclone remote

Use a bucket dedicated to backups, with credentials limited to that bucket (read, write, list and delete). Retention needs delete permission.

**Cloudflare R2**
1. Dashboard → R2 → create bucket `eitf-hrms-backups` (private).
2. R2 → Manage API tokens → create a token with *Object Read & Write*, limited to that bucket. Note the Access Key ID, the Secret Access Key and your account ID.
3. `rclone.conf` on the server (`deploy/backup/rclone/rclone.conf`):

   ```ini
   [r2]
   type = s3
   provider = Cloudflare
   access_key_id = <R2 access key id>
   secret_access_key = <R2 secret access key>
   endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   region = auto
   acl = private
   ```

   Remote: `BACKUP_RCLONE_REMOTE=r2:eitf-hrms-backups`

**Backblaze B2**
1. Create bucket `eitf-hrms-backups` (private). Create an application key restricted to that bucket with *read, write, list and delete* permissions.
2. `rclone.conf`:

   ```ini
   [b2]
   type = b2
   account = <applicationKeyId>
   key = <applicationKey>
   ```

   Remote: `BACKUP_RCLONE_REMOTE=b2:eitf-hrms-backups`

**AWS S3 (or any S3-compatible service)**
1. Create bucket `eitf-hrms-backups` with public access blocked. Create an IAM user with `s3:ListBucket` on the bucket and `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on its objects.
2. `rclone.conf`:

   ```ini
   [s3]
   type = s3
   provider = AWS
   access_key_id = <access key id>
   secret_access_key = <secret access key>
   region = <bucket region, e.g. ap-south-1>
   ```

   Remote: `BACKUP_RCLONE_REMOTE=s3:eitf-hrms-backups`

You can also generate the file with `rclone config` on your workstation and copy it over. Then lock it down:

```bash
chmod 600 deploy/backup/rclone/rclone.conf
```

`deploy/backup/rclone/` is gitignored. Never commit it.

### 3. Configure the server

In `.env.production`:

```bash
BACKUP_AGE_RECIPIENT=age1…            # public key from step 1
BACKUP_RCLONE_REMOTE=r2:eitf-hrms-backups
BACKUP_HOUR_UTC=20
BACKUP_RETENTION_DAYS=14
```

Then rebuild the backup image and start:

```bash
docker compose --env-file .env.production up -d --build db-backup
```

### 4. Run a first backup by hand and confirm the upload

```bash
docker compose --env-file .env.production exec db-backup /bin/sh /usr/local/bin/backup.sh once
docker compose --env-file .env.production exec db-backup rclone lsf "$BACKUP_RCLONE_REMOTE"
```

The logs should show `encrypted -> …dump.age` and `uploading …`, and the listing should show the new `.dump.age` file. If the listing shows nothing, check that `deploy/backup/rclone/rclone.conf` exists and that the remote name in `BACKUP_RCLONE_REMOTE` matches the section name in that file.

## Restore drill

Run this **before go-live**, then **quarterly**, and after any change to the age key or the rclone remote. An untested backup is not a backup.

The drill restores the newest off-site backup into a **scratch database**, never into production, and checks it.

### Step 1: Pick a backup (workstation with rclone configured)

```bash
rclone lsf r2:eitf-hrms-backups | sort | tail -5
```

### Step 2: Start a scratch Postgres

```bash
docker run -d --name restore-drill -e POSTGRES_PASSWORD=drill -p 55432:5432 postgres:16-alpine
sleep 5
docker exec restore-drill createdb -U postgres eitf_drill
```

### Step 3: Restore into the scratch database

The `db-backup` image contains `restore.sh`, `pg_restore`, `age` and `rclone`. Mount the age private key and the rclone config from your workstation:

```bash
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -v "$HOME/keys/backup.key:/keys/backup.key:ro" \
  -v "$HOME/eitf-rclone:/config/rclone:ro" \
  -e BACKUP_AGE_IDENTITY_FILE=/keys/backup.key \
  -e BACKUP_RCLONE_CONFIG=/config/rclone/rclone.conf \
  -e DATABASE_URL='postgresql://postgres:drill@host.docker.internal:55432/eitf_drill' \
  --entrypoint /usr/local/bin/restore.sh \
  eitf-hrms-db-backup:latest \
  --yes r2:eitf-hrms-backups/eitf_hrms_20261113T200001Z.dump.age
```

Replace the file name with the one from Step 1. Running without `--yes` prints the plan and changes nothing.

### Step 4: Check the result

```bash
docker exec restore-drill psql -U postgres -d eitf_drill -c 'SELECT count(*) AS employees FROM employees;'
docker exec restore-drill psql -U postgres -d eitf_drill -c '\dt' | tail -3
```

Compare with production on the server:

```bash
docker compose --env-file .env.production exec postgres psql -U eitf -d eitf_hrms -c 'SELECT count(*) AS employees FROM employees;'
```

The counts should match, or differ only by rows created after the backup time. Also log in to a restored copy of the API against the scratch DB if you want a full check.

### Step 5: Clean up and record

```bash
docker rm -f restore-drill
```

Record the date, the backup file name, the row counts and the operator in the operations log.

## Emergency restore into production

Use this only when production data must be replaced. The restore **drops and recreates** every object in the target database.

1. **Decide the backup.** Pick the newest good file (`rclone lsf …`). Note the time it covers.
2. **Stop the application** so nothing writes during the restore:
   ```bash
   docker compose --env-file .env.production stop api web
   ```
3. **Take a fresh dump of the current state first**, in case the restore must be reversed:
   ```bash
   docker compose --env-file .env.production exec db-backup /bin/sh /usr/local/bin/backup.sh once
   ```
4. **Put the age key on the server for the restore only**, in RAM, never on disk:
   ```bash
   scp backup.key <server>:/dev/shm/backup.key   # run from your workstation
   ```
5. **Restore** with the backup container, using the server's own settings (`PG*` variables and the mounted rclone config):
   ```bash
   docker compose --env-file .env.production run --rm --no-deps \
     -v /dev/shm/backup.key:/keys/backup.key:ro \
     -e BACKUP_AGE_IDENTITY_FILE=/keys/backup.key \
     --entrypoint /usr/local/bin/restore.sh \
     db-backup --yes r2:eitf-hrms-backups/<file>.dump.age
   ```
6. **Remove the key from the server immediately:**
   ```bash
   rm -f /dev/shm/backup.key
   ```
7. **Bring the schema in line with the code** if needed: `prisma migrate deploy`, as in `docs/PRODUCTION-DEPLOYMENT.md`.
8. **Start the application and verify:**
   ```bash
   docker compose --env-file .env.production up -d api web
   curl -fsS https://<your-host>/api/v1/health
   ```
   Then log in as CEO or HR and spot-check employees, the latest payroll run and leave balances.

## Operator runbook

### Daily
- Check the `db-backup` logs for `ERROR` and `WARNING` lines (see above).
- Optionally open Security → Backups and confirm the latest JSON backup is `SUCCESS`.

### Manual JSON backup

```http
POST /api/v1/security/backups/run
Authorization: Bearer <CEO/HR token>
```

Or Dashboard → **Security** → **Run backup now**.

### Using JSON snapshots
JSON backups are **forensic / config recovery**, not a full substitute for a Postgres restore. Use them to rehydrate settings or investigate after an incident.

## Retention
- Postgres dumps: `BACKUP_RETENTION_DAYS` applies locally and on the off-site remote.
- JSON snapshots: prune old files under `data/backups/` periodically.
- Consider a bucket lifecycle rule as a second safeguard for longer retention (e.g. 30 daily, 12 monthly).
