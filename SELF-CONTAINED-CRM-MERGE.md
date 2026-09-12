# Self-Contained CRM → HRMS Merge

## Goal

Everything runs from `C:\Users\Aadarsh\Projects\eitf-hrms` on **http://localhost:3000**.  
`C:\CRM` is read-only and is **not** a runtime dependency.

## Layout (in-repo)

| Path | Role |
|------|------|
| `apps/web` | HRMS Next.js 15 — public UI on **:3000** |
| `apps/api` | NestJS HRMS API on **:3001** |
| `apps/orbit` | Full Orbit CRM (physical copy) on **127.0.0.1:3010**, proxied via web |

## Start

```bash
cd C:\Users\Aadarsh\Projects\eitf-hrms
npm run db:up          # once
npm run start:localhost
```

Open **http://localhost:3000** — login `superadmin` / `Super@123`.

## Routing

- CRM short paths (`/leads`, `/finance/*`, …) → redirect → `/orbit/...`
- `/orbit/*` rewritten to in-repo Orbit module
- HRMS keeps `/dashboard`, `/tickets`, `/admin`, `/billing`, `/integrations`
- CRM equivalents: `/orbit/dashboard`, `/orbit/tickets`, `/orbit/admin`, `/orbit/billing`, `/orbit/integrations`
- Auth: one HRMS login → `/sso/orbit` → Orbit session cookie

## No C:\CRM runtime

- No junctions/symlinks to `C:\CRM`
- No absolute imports from `C:\CRM`
- CRM source lives under `apps/orbit`
