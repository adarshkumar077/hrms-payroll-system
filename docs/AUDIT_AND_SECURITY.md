# Audit & Security Framework

## Controls in place

| Control | Implementation |
|---|---|
| Auth | OTP, password, JWT access/refresh, TOTP 2FA |
| Lockout | `security.max_failed_logins` / `security.lockout_minutes` |
| Password policy | Min length + upper/number/special toggles |
| Session timeout | Access token TTL from `security.session_timeout_minutes` |
| IP allow-list | `IpAllowlistGuard` + `security.ip_allowlist` (localhost always allowed) |
| Admin 2FA | `Require2faGuard` when `security.require_2fa_for_admins` |
| RBAC | Roles on every secured endpoint (`RolesGuard`) |
| Audit trail | `AuditLog` + `GET /security/audit` (+ CSV) |
| Rate limit | Nest Throttler |
| Multi-tenant | `company_id` on tenant tables |

## Review cadence

- Weekly: sample audit log (logins, settings changes, password resets).
- Monthly: review IP allow-list and inactive users.
- Quarterly: rotate JWT secrets; re-test backup restore.

## Related screens

- Security Settings / Audit / Backups → `/security`
- Company Settings → `/settings/company`
