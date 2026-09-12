# Audit, Clone, Merge & Billing Fix — Status

## Phase 1 — Audit of `D:\CRM` (Orbit Business OS)

| Area | Finding |
|------|---------|
| Stack | Next.js 14 App Router, Prisma, Tailwind 3, SQLite/Postgres |
| Auth | JWT cookie `orbit_session` |
| CRM modules | leads, opportunities, accounts, contacts, quotations, tickets, contracts, installed, calls, messages, products, activities |
| Setup nav | Studio, Integrations, Documents, Import/Export, Admin, **Billing** (`lib/nav.ts`) |
| Billing | `app/(app)/billing/` + `lib/billing.ts` + Razorpay payments |
| Config | `tailwind.config.ts`, `postcss.config.mjs`, `next.config.mjs`, `.env*` |
| Source status | Untouched (`git status` clean on `studio/s0-foundations`) |

## Phase 2–3 — Clone `CRM-CLONE`

| Check | Result |
|-------|--------|
| Path | `C:\Users\Aadarsh\Projects\CRM-CLONE` |
| Method | Prior `robocopy /MIR` from `D:\CRM` |
| Items (excl `.next`) | **15154 = 15154** (exact match) |
| Markers | `.git`, `.env`, `package.json`, `app`, `lib`, `prisma`, `node_modules` on both |
| `.git` | Present; branch `studio/s0-foundations` |
| `D:\CRM` | Untouched (clean `git status`) |

## Phase 4 — Merge into HRMS

| Item | Location |
|------|----------|
| Host | `C:\Users\Aadarsh\Projects\eitf-hrms` |
| Vendor CRM tree | `vendor/orbit-crm/` |
| Runtime CRM | `/crm/*` + Nest `/api/v1/crm/*` |
| Single login | HRMS JWT |
| HRMS modules | Preserved (Employees, Attendance, Leave, Payroll, Reports, Settings) |

## Phase 5 — Billing sidebar fix

| Change | Detail |
|--------|--------|
| Page | `apps/web/src/app/billing/page.tsx` (plans UI from Orbit catalogue) |
| Plans lib | `apps/web/src/lib/billing-plans.ts` |
| Nav group **Setup** | Studio, Integrations, Documents, Import/Export, Admin & Users, **Billing** |
| Icon | Credit-card SVG (`billing`) |
| Route | `/billing` — admin/HR/super-admin |
| Access | `canAccessPath` allows `/billing` |
| Production build | Passed; `/billing` artifact present in `.next` |

## Phase 6 — How to verify

1. Open HRMS (prefer http://localhost:3005 if 3000 is Orbit).
2. Login: `superadmin` / `Super@123`
3. Sidebar → **Setup → Billing** → `/billing`
4. CRM → CRM Dashboard and modules still work
5. Attendance / Payroll / Employees unchanged
