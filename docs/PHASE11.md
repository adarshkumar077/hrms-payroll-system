# Phase 11 — Hardening (Security & Compliance)

## Status: COMPLETE

| Module | Item | Status |
|---|---|---|
| 26 | Security settings API + password policy / session / 2FA / IP keys | Done |
| 26 | IP allow-list guard + require-2FA guard for CEO/HR | Done |
| 26 | Audit log viewer API (`GET /security/audit`) + CSV | Done |
| 26 | Backup runs (manual + hourly cron check) | Done |
| 26 | Statutory compliance pack (PF/ESIC/PT/LWF/TDS/Form16/24Q/registers) | Done |
| UI | `/security`, `/security/audit`, `/compliance` | Done |

## API

- `GET/PUT /security/settings`
- `GET /security/audit` · `GET /security/audit/export/csv`
- `GET /security/backups` · `POST /security/backups/run`
- `GET /security/compliance/:kind` · `…/export/csv`  
  kinds: `pf|esic|pt|lwf|tds|form16|form24q|salary_register|attendance_register`

## Verified

- Migration `20260713220000_phase11_security`
- CEO login → settings, audit, manual backup SUCCESS, compliance PF

## Try it

1. Dashboard → **Security** (settings, 2FA QR, run backup)
2. **Audit Log** link on that page
3. Dashboard → **Compliance** (Finance/CEO/HR)

## Next

**Phase 12 — Integrations / AI:** Module 27 — see `docs/PHASE12.md` (COMPLETE)
