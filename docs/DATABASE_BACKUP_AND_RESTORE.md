# Database and file backup and restore

## What is backed up

| Item | How | Where |
|---|---|---|
| PostgreSQL database | `pg_dump -Fc`, checked with `pg_restore --list` | `eitf_hrms_<UTC time>.dump.age` |
| Uploaded files (documents, attendance selfies) | `tar.gz` of the uploads volume, checked with `tar -t` | `eitf_uploads_<UTC time>.tar.gz.age` |
| Status of the last run | JSON: sizes, SHA-256, encryption, off-site result | `last_status.json`, read by the API's monitoring |

The work is done by the `db-backup` container (`deploy/backup/backup.sh`). It runs every night at
`BACKUP_HOUR_UTC` (default 20:00 UTC = 01:30 IST), keeps `BACKUP_RETENTION_DAYS` (default 14) on the
server, and exits with an error (raising an alert) if any step fails, including the off-site upload.

Not included: `.env.production`, TLS keys and the age private key. Keep those in your password
manager or offline storage (see `DISASTER_RECOVERY_PLAN.md`).

## Encryption

Backups are encrypted with [age](https://age-encryption.org) to a **public** key. The private key
never lives on the server, so stealing the server or the bucket does not expose the data.

```bash
# On an admin PC (not the server): create the key pair once
age-keygen -o eitf-backup.key      # PRIVATE: store in two safe offline places
grep public eitf-backup.key        # age1…  → BACKUP_AGE_RECIPIENT in .env.production
```

If `BACKUP_AGE_RECIPIENT` is empty, backups are written **unencrypted**, and monitoring reports a
warning every day until it is set.

## Off-site copy

Set `BACKUP_RCLONE_REMOTE` (for example `r2:eitf-hrms-backups`) and put the rclone config in
`deploy/backup/rclone/rclone.conf` (`chmod 600`). Any S3-compatible bucket works (Cloudflare R2,
Backblaze B2, AWS S3, Wasabi). Use a bucket in India if you prefer that for DPDP compliance. Give the
key **write-only** access where the provider allows it, and turn on object lock / versioning so
ransomware on the server cannot delete old copies.

## Monitoring

`GET /api/v1/admin/system-health` (Super Admin) and the 15-minute monitor report:

* **critical**: no backup, last backup failed, or the last success is older than 26 hours;
* **warning**: backup not encrypted, or no off-site copy.

Alerts are emailed to `ALERT_EMAILS`.

## Run a backup now

```bash
docker compose exec db-backup /bin/sh /usr/local/bin/backup.sh once
docker compose exec db-backup cat /status/last_status.json
```

## Restore

`restore.sh` only prints its plan unless you add `--yes`. A database restore **replaces** the target
database, so **always restore into a scratch database first**, check it, and only then into the real
one.

```bash
# 1. Copy the private key into the container temporarily
docker cp eitf-backup.key eitf-hrms-db-backup:/tmp/age.key

# 2. Restore into a scratch database and check it
docker compose exec db-backup psql -d postgres -c "create database eitf_restore_check"
docker compose exec -e BACKUP_AGE_IDENTITY_FILE=/tmp/age.key -e PGDATABASE=eitf_restore_check \
  db-backup sh /usr/local/bin/restore.sh --yes /backups/eitf_hrms_<time>.dump.age
docker compose exec db-backup psql -d eitf_restore_check -c "select count(*) from employees"

# 3. Real restore (production down, after a fresh backup of the current state)
docker compose stop api web
docker compose exec -e BACKUP_AGE_IDENTITY_FILE=/tmp/age.key \
  db-backup sh /usr/local/bin/restore.sh --yes /backups/eitf_hrms_<time>.dump.age
docker compose start api web

# 4. Uploaded files: restore into an EMPTY folder, check it, then swap volumes
docker compose exec -e BACKUP_AGE_IDENTITY_FILE=/tmp/age.key -e UPLOADS_RESTORE_DIR=/tmp/up \
  db-backup sh -c 'mkdir -p /tmp/up && sh /usr/local/bin/restore.sh --yes /backups/eitf_uploads_<time>.tar.gz.age'

# 5. Remove the key again
docker compose exec db-backup rm -f /tmp/age.key
```

To restore straight from the bucket, pass the rclone path, for example
`r2:eitf-hrms-backups/eitf_hrms_<time>.dump.age`.

## Restore test schedule

| When | What |
|---|---|
| Before go-live | Full test (done on the test stack, see below) |
| Monthly | Restore the latest off-site backup into a scratch database and compare row counts |
| Quarterly | Full DR drill on a spare machine (`DISASTER_RECOVERY_PLAN.md`) |

Record every test in `TESTING_RESULTS.md`.

## Last verified test: 27 Nov 2026, isolated test stack `eitf-p2test`

| Step | Result |
|---|---|
| `backup.sh once` with age encryption | OK: database 264 KB (98 tables with data), uploads archive (1 file), both verified and encrypted, SHA-256 recorded |
| Status file | `ok: true`, `encrypted: true`, `offsite: not_configured` (no bucket provided yet) |
| Dry run without `--yes` | Printed the plan only, nothing changed |
| Restore into a scratch DB | Row counts identical to the live test DB (companies 1, users 1, audit logs 19, migrations 28) |
| Uploads restore into an empty folder | File restored byte-for-byte |
| **Not yet tested** | Off-site upload and download: needs your bucket and credentials |
