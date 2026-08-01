# Backup & Recovery

## What the product stores

1. **PostgreSQL** — system of record (employees, payroll, leave, workflows, audit, …).
2. **In-app JSON backups** — `POST /security/backups/run` writes snapshots under `data/backups/<companyId>/` (gitignored). Includes company settings, employees, users (no password hashes beyond what’s selected), recent payroll, leave balances, recent audit.
3. **Scheduled backups** — hourly cron checks `security.backup_enabled` + `security.backup_hour_utc` and runs one successful schedule backup per day per company.

## Operator runbook

### Daily
- Confirm Postgres backups (pg_dump / cloud snapshot) succeed.
- Optionally open Security → Backups and confirm latest `SUCCESS`.

### Manual JSON backup

```http
POST /api/v1/security/backups/run
Authorization: Bearer <CEO/HR token>
```

Or Dashboard → **Security** → **Run backup now**.

### Restore Postgres
1. Stop API.
2. Restore DB from the chosen snapshot/dump.
3. Run `prisma migrate deploy` if schema drift.
4. Start API; verify `GET /health` and CEO login.

### Using JSON snapshots
JSON backups are **forensic / config recovery**, not a full substitute for Postgres restore. Use them to rehydrate settings or investigate after an incident.

## Retention
Configure OS/cloud retention (e.g. 30 daily, 12 monthly). Prune old files under `data/backups/` periodically.
