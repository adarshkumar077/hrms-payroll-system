# Phase 1 status — Foundation + Module 1

## Status: **COMPLETE** (running without Docker)

| Area | Status |
|---|---|
| Monorepo (`apps/api`, `apps/web`, `apps/mobile`) | Done |
| Embedded Postgres (`npm run db:up`, port 5433) | Done |
| Prisma multi-tenant schema + migration | Done |
| Auth (OTP, password, JWT, 2FA TOTP, lockout from settings) | Done |
| RBAC guards (API-enforced) | Done |
| Module 1 Company Setup APIs | Done |
| Web: Login + Dashboard + Company Settings | Done |
| Mobile scaffold (login + company details) | Done |
| Seed: 1 company, 1 CEO, **0 employees** | Done |
| Live login verified | Done |
| Modules 2 & 14 | Skipped (per decision) |

## Run locally (no Docker)

```powershell
# Terminal 1 — database
npm run db:up

# Terminal 2 — API
npm run dev:api

# Terminal 3 — Web
npm run dev:web
```

- Web: http://localhost:3000
- API: http://localhost:3001/api/v1
- Swagger: http://localhost:3001/api/docs

Login: `ceo@eitf.local` / `ChangeMe@123`

## Next phase

**Phase 2 — Core HR:** Employee Master (Module 3) + Document Management (Module 4).
