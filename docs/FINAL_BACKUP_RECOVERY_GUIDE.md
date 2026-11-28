# Final backup and recovery guide

## What is protected

| Data | Backup | Encryption | Off-site | Verified |
|---|---|---|---|---|
| PostgreSQL database (all HR, attendance, payroll, audit) | Nightly `pg_dump` (automatic); run one by hand before payroll approval and updates | age (public key on server, private key offline) | rclone to your bucket | `pg_restore --list` + SHA-256 on every run |
| Uploaded files (documents, selfies) | Nightly tar.gz | age | rclone | `tar -t` + SHA-256 |
| Secrets (`.env.production`, age private key, rclone config) | Password manager + sealed offline copy | — | — | Checked at each quarterly drill |

Retention is 14 days on the server (configurable) plus whatever your bucket keeps; turn on
versioning/object lock there. The last result is in `last_status.json`, and monitoring raises a
**critical** alert if a backup is missing, failed or older than 26 hours, and a **warning** if it is
unencrypted or not off-site.

## Status

| Check | Result |
|---|---|
| Encrypted backup on the production-identical test stack | ✅ passed (see `FINAL_TEST_RESULTS.md` for this run's numbers) |
| Restore into a scratch database, row counts identical | ✅ passed |
| Uploads restore into an empty folder | ✅ passed (earlier run) |
| Off-site upload/download | ⛔ **not tested: no bucket provided** |
| On your server | ⛔ not deployed yet |

## Daily operation

```powershell
# backup now (also before every payroll approval and update)
docker compose --env-file .env.production exec db-backup /bin/sh /usr/local/bin/backup.sh once
docker compose --env-file .env.production exec db-backup cat /status/last_status.json
```

## Restore (always into a scratch database first)

Full commands: `DATABASE_BACKUP_AND_RESTORE.md`. In short: copy the age private key into the backup
container temporarily, restore into a new database, compare counts, and only then stop the API and
restore into the real database. Remove the key afterwards. `restore.sh` does nothing without `--yes`.

## Recovery targets

* **RPO** 24 h (nightly), lower if you run a backup before each payroll approval.
* **RTO** 4 h on spare hardware: rebuild procedure in `DISASTER_RECOVERY_PLAN.md` §A.

## Drills

Monthly: restore the latest off-site backup into a scratch database. Quarterly: full rebuild on a
spare PC. Record each one in `FINAL_TEST_RESULTS.md`.

## Needed from you

1. An S3-compatible bucket (Cloudflare R2, Backblaze B2, AWS S3, Wasabi; an India region if you
   prefer) with an access key limited to that bucket.
2. An age key pair made on an admin PC (`age-keygen`). The public key goes on the server, the
   private key goes into two safe offline places.
