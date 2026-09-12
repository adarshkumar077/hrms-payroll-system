# Security Audit Report — EITF HRMS + Payroll + CRM

**Date:** 2026-08-28  
**Scope:** Authentication, RBAC, IDOR/BOLA, data exposure, transport security, logging, uploads  
**Status:** Remediated (pre-deployment verification required on your VPS)

---

## Executive summary

A full security review identified **19 findings** across API authorization, data exposure, CORS, logging, and frontend route guards. **All critical and high-severity issues have been fixed** in code. Run `node scripts/security-pentest.mjs https://YOUR_DOMAIN` after deployment to verify.

---

## Findings & remediation

| Severity | Finding | Remediation | Status |
|----------|---------|-------------|--------|
| **CRITICAL** | OTP codes logged to console | Removed plaintext OTP logging; dev-only debug without code | ✅ Fixed |
| **CRITICAL** | Leave calendar IDOR (`employeeId` query) | Non-privileged users forced to own `employeeId`; 403 on mismatch | ✅ Fixed |
| **CRITICAL** | Internal docs SSR without auth (`/docs/*`) | Client-only page + `GET /help-docs/:slug` (SUPER_ADMIN/HR JWT) | ✅ Fixed |
| **CRITICAL** | CRM routes open to all employees | `canAccessPath` limited to `/crm/leads` + `/crm/tasks` for EMPLOYEE | ✅ Fixed |
| **HIGH** | Plaintext passwords in API JSON | Removed from create/reset responses; HR sets password in UI | ✅ Fixed |
| **HIGH** | Onboarding IDOR (null `employeeId` bypass) | `assertEmployeeScope()` on all employee-scoped routes | ✅ Fixed |
| **HIGH** | ESD balance IDOR | `assertEmployeeScope()` — employees see own data only | ✅ Fixed |
| **HIGH** | CRM lead activities IDOR | Activities require lead ownership via `getLead()` | ✅ Fixed |
| **HIGH** | Performance goals leak (no employee link) | 403 if employee lacks profile; block cross-employee query | ✅ Fixed |
| **HIGH** | JWT in export URL (`esd/page.tsx`) | Bearer header + blob download | ✅ Fixed |
| **HIGH** | CORS `*` with credentials | Wildcard rejected in production; explicit allowlist only | ✅ Fixed |
| **MEDIUM** | No auth rate limiting | `@Throttle` on login, OTP, refresh, setup (5–20/min) | ✅ Fixed |
| **MEDIUM** | Swagger public in production | Disabled when `NODE_ENV=production` | ✅ Fixed |
| **MEDIUM** | File upload — no type validation | Allowlist MIME/ext + magic-byte check | ✅ Fixed |
| **MEDIUM** | Storage path traversal | `safePath()` resolves and validates under root | ✅ Fixed |
| **MEDIUM** | Sensitive data in logs | `sanitizeForLog()` on errors + audit metadata | ✅ Fixed |
| **MEDIUM** | Admin reset skips force password change | `forcePasswordChange: true` on admin reset | ✅ Fixed |
| **MEDIUM** | Leave balance for invalid employeeId | 404 before upsert | ✅ Fixed |
| **LOW** | Client-only RBAC (localStorage) | Middleware security headers; API is authoritative | ⚠ Mitigated |

---

## Security controls in place

### Authentication & secrets
- **bcrypt** (cost 12) for all passwords — never stored plain-text
- JWT access + refresh tokens; secrets only in server `.env` (never `NEXT_PUBLIC_*`)
- Account lockout after failed login attempts
- Optional TOTP 2FA
- Protected super-admin account (cannot be deleted/deactivated by others)

### Authorization (RBAC + IDOR prevention)
- Global `JwtAuthGuard` + `RolesGuard` on API
- `@Roles()` on privileged endpoints
- `assertEmployeeScope()` — employees cannot access another employee's payroll, attendance, ESD, onboarding, leave calendar
- CRM `ownerFilter()` / task assignee scoping
- Company-scoped queries (`companyId`) on all tenant data

### Transport & headers
- HTTPS via Cloudflare Tunnel / Let's Encrypt (production)
- Helmet on API; nginx + Next.js middleware security headers
- CORS explicit allowlist in production (`PUBLIC_APP_URL`, `CORS_ORIGINS`)
- Database **not** exposed publicly (Docker internal network only)

### Input validation & injection
- `ValidationPipe` (whitelist, forbid unknown fields)
- Prisma parameterized queries (SQL injection protection)
- Upload allowlist + magic bytes; blocked `.html`, `.svg`, executables
- Path traversal protection on file storage

### Logging & errors
- Client responses: `statusCode`, `message`, `requestId` only — **no stack traces or SQL**
- Server logs sanitized (passwords, tokens, salary fields redacted)
- Audit log metadata sanitized

### Rate limiting
- Global: 120 req/min
- Auth endpoints: 5–20 req/min

### Backups
- Daily encrypted-at-rest `pg_dump` to Docker volume (`db-backup` service)
- 14-day retention; volume not publicly accessible

---

## Penetration-style tests

Run after deployment:

```bash
node scripts/security-pentest.mjs https://hrms.yourcompany.com
```

| Test | Expected |
|------|----------|
| `/employees` without token | 401 |
| Leave calendar IDOR without token | 401 |
| `/help-docs/deployment` without token | 401 |
| 12 failed logins | 429 rate limit |
| CORS evil origin | No `Access-Control-Allow-Origin: *` |
| Health endpoint | No stack/SQL in body |

### Manual tests (recommended)
- [ ] Employee A cannot open Employee B payslip URL
- [ ] Employee cannot access `/crm/customers` or `/admin/users`
- [ ] HR can access employee list; Employee cannot
- [ ] Password never appears in Network tab API responses
- [ ] `.env` not in git (`git check-ignore .env.production`)

---

## Production checklist

```env
# Required — never use * in production
CORS_ORIGINS=https://hrms.yourcompany.com
PUBLIC_APP_URL=https://hrms.yourcompany.com
JWT_ACCESS_SECRET=<32+ random chars>
JWT_REFRESH_SECRET=<32+ random chars>
POSTGRES_PASSWORD=<strong>
```

- [ ] Change all default seed passwords
- [ ] Set explicit CORS (no `*`)
- [ ] Cloudflare Tunnel or TLS enabled
- [ ] Firewall: only 22 (+ 80/443 if direct HTTPS)
- [ ] Run security pentest script
- [ ] Restrict backup volume access to ops only

---

## Residual risks & recommendations

1. **Client-side JWT in localStorage** — XSS could steal tokens. Mitigate with CSP, input sanitization, and short access TTL (15m). Future: httpOnly cookies + CSRF tokens.
2. **Biometric webhook** — Ensure strong webhook secret in production; consider IP allowlist for devices.
3. **15–25 day soak** — Monitor audit logs and failed auth during office pilot.

---

## Sign-off

| Role | Status |
|------|--------|
| Code remediation | Complete |
| Automated pentest script | `scripts/security-pentest.mjs` |
| Production verification | **Pending your VPS deploy** |

**Conclusion:** The application meets enterprise security requirements for a 10–15 user HRMS deployment when deployed with HTTPS, explicit CORS, strong secrets, and default passwords changed. API authorization is the source of truth; frontend RBAC is defense-in-depth.
