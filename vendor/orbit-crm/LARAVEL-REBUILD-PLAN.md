# Rebuilding Orbit as Laravel (PHP) + Next.js static — complete plan

## Short answer: yes, it *can* run on your PHP shared host — but it's a full rewrite, not a port.

A **Laravel API + static frontend + MySQL** is a classic LAMP-compatible architecture, and Laravel does run on many Bluehost shared plans. The catch: **almost none of the current codebase transfers.** Orbit today is Next.js server actions + Prisma + TypeScript business logic. Moving to PHP means re-implementing the backend and re-architecting the frontend from server-rendered to client-only. This is a **second implementation of the app**, roughly **2–4 months for one competent PHP dev**, versus **~$5/mo and zero rewrite** to run the existing Node app on a small host.

Below is the real plan so you can decide with eyes open.

## Target architecture (runs on pure PHP shared hosting)

```
Bluehost shared host (Apache + PHP 8.2 + MySQL)
├── /public_html               → Next.js STATIC export (HTML/JS/CSS) — the SPA
│                                 (calls the API via fetch; no Node needed to serve it)
└── /api  (Laravel, docroot = laravel/public)
        ├── REST controllers (replace all server actions + /api routes)
        ├── Sanctum auth (replace the JWT-cookie session)
        ├── Eloquent models + migrations (replace Prisma; 36 tables → MySQL)
        ├── Services: compliance (PF/ESI/GST), GL, payments, e-invoice, OCR, AI
        ├── Mail (native PHP — reset/invite emails become trivial)
        ├── Scheduler/Queue (replace the /api/cron job runner)
        └── dompdf (replace the print/PDF routes)
```
The frontend and API talk only over HTTPS/JSON, so the frontend can be dumb static files.

## What has to be rebuilt (current → Laravel)

| Current (Next.js/TS) | Laravel/PHP equivalent | Effort |
|---|---|---|
| Prisma schema (36 models, 2 files) | Eloquent **migrations + models** (MySQL) | High — re-model everything |
| 27 server-action files + 9 API routes | **REST controllers + routes/api.php** | High — the bulk of the work |
| `lib/auth.ts` (JWT cookie, 2FA TOTP) | **Laravel Sanctum** + a 2FA package (pragmarx/google2fa) | Medium |
| `lib/rbac.ts` | Laravel **Gates/Policies** | Medium |
| `lib/compliance/*` (PF/ESI/PT/TDS, GST) | PHP service classes (port the maths 1:1) | Medium — logic is small but must match exactly |
| `lib/gl.ts` double-entry ledger | PHP service + DB transaction | Medium |
| `lib/ai.ts` / `copilot` / `ocr` | PHP HTTP calls (Guzzle) to the same LLM endpoints | Low–Medium |
| `lib/payments`/`irp`/`marketplace`/`sso` | PHP adapters (Razorpay PHP SDK, cURL) | Medium |
| `lib/notify` + email | **Laravel Mail + Notifications** (native, easier than now) | Low |
| `/api/cron` + `lib/jobs` | **Laravel Scheduler + Queues** (cPanel cron → `artisan schedule:run`) | Low–Medium |
| `app/print/*` (window.print PDFs) | **barryvdh/laravel-dompdf** | Low |
| 42 RSC pages + server components | **Client-only** React pages fetching the API (see below) | **Very High** — every page re-written |
| Multi-tenant `scopedDb` + `tenantId` | Eloquent **global scopes** (BelongsToTenant trait) | Medium |
| 218 vitest tests | Re-write as **PHPUnit/Pest** (the pure logic ports cleanly) | Medium |

## The frontend catch (don't underestimate this)

Orbit's pages are **React Server Components** that read the DB directly and use server actions. A static export **cannot** do that. So every page must be converted to:
- a **client component** that `fetch()`es a Laravel JSON endpoint, with loading/error states, client-side auth token handling, and forms posting to the API.

That's a rewrite of the entire UI data layer. Two realistic sub-options:
- **A. Next.js `output: "export"`** — keep the components/Tailwind, convert all data access to client-side `fetch`. Serve the exported `out/` folder from `public_html`.
- **B. Plain React SPA (Vite)** — arguably cleaner for a pure-SPA-on-PHP target; reuse the Tailwind + component look, drop Next entirely.

Either way it's a large frontend effort — the current server-first design is exactly what makes it small; a client-SPA rewrite gives that back.

## Phased plan (if you go this route)

1. **DB (week 1):** translate `prisma/schema.*` → Laravel migrations; seed parity with `prisma/seed.ts`.
2. **Auth (week 1–2):** Sanctum login/signup/reset/invite + 2FA + RBAC gates.
3. **Core API (weeks 2–5):** CRUD + business endpoints for CRM, HR, Payroll, Inventory, Finance — porting `lib/compliance/*` and `lib/gl.ts` **with tests first** (they must match the current numbers exactly).
4. **Integrations (week 5–6):** AI (Guzzle→LLM), payments, e-invoice, marketplace, email, PDF, scheduler/queue.
5. **Frontend (weeks 4–9, parallel):** rebuild pages as client components hitting the API; static export.
6. **Multi-tenant + hardening (week 9–10):** global scopes, rate limiting, headers, backups.
7. **Deploy to Bluehost shared (week 10):** upload Laravel (point docroot to `laravel/public`), MySQL via cPanel, `public_html` = the static export, cPanel cron → `artisan schedule:run`.

**Realistic: 8–12 weeks solo**, faster with a 2-person split (one API, one frontend).

## Bluehost-shared gotchas for Laravel (real)
- PHP **8.2+** and required extensions must be enabled (cPanel → MultiPHP / PHP selector).
- **Composer** often isn't available on shared SSH — you may `composer install` locally and upload `vendor/`.
- Laravel needs **writable** `storage/` and `bootstrap/cache/` (chmod), and the docroot must point at `laravel/public` (or move its contents + patch paths).
- **Queues:** shared hosts have no daemon — use the `database` queue driver + a cPanel cron running `artisan queue:work --stop-when-empty` and `schedule:run` every minute.
- **File uploads** land on the shared disk (persists — fine), same as today.

## Honest recommendation

| | Laravel rebuild | Run current app on a $5 Node host |
|---|---|---|
| Runs on your PHP shared host | ✅ | ❌ (needs Node) |
| Work required | **8–12 weeks rewrite** | **~1 hour**, zero code change |
| Throws away | The working Node app + 218 tests | Nothing |
| Ongoing cost | Your existing Bluehost | +~$5/mo (VPS/Render) + free Postgres |
| Risk | Re-deriving statutory/GL maths in a 2nd language (must match exactly) | Low — already built & tested |

**Only choose the Laravel rebuild if** you have a hard, permanent ban on *any* Node hosting **and** in-house PHP/Laravel capacity. For essentially everyone, **spending ~$5/mo to run the app you already have** (see `BLUEHOST-HOSTING.md`, keeping the domain on Bluehost) is dramatically cheaper, faster, and safer than a 2–3 month rewrite. The maths is the moat — porting it to a second language is where rewrites quietly introduce compliance bugs.

*If you still want to proceed, start with Phase 1–3 (DB + auth + the compliance/GL services with tests) — that's the risky core; the rest is mechanical.*
