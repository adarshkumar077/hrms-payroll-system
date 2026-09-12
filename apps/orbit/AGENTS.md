# AGENTS.md — Orbit Business OS

**Purpose:** AI-native all-in-one business OS for Indian SMBs (CRM + HR + Payroll + Inventory + GST-native Finance + CEO cockpit + AI layer), built to surpass SangamCRM. **Status:** runnable MVP — all 7 modules + cockpit + NL copilot work end-to-end on seed data; AI runs live on Groq. Mocks remain for IRP e-invoicing, marketplace tenant-routing, telephony. Single-tenant demo. Not a git repo.

## Tech stack (exact, from package-lock.json)
| Dep | Version | Dep | Version |
|---|---|---|---|
| next | 14.2.5 | @prisma/client · prisma | 5.22.0 |
| react · react-dom | 18.3.1 | typescript | 5.9.3 |
| tailwindcss | 3.4.19 | tsx | 4.22.5 |
| @anthropic-ai/sdk | 0.27.3 | jose | 5.10.0 |
| bcryptjs | 2.4.3 | zod | 3.25.76 |
| node | v24.18.0 (dev machine) | npm | 11.16.0 |

DB: SQLite (dev) / Postgres (prod). AI: any OpenAI-compatible endpoint via `LLM_*` env (currently Groq).

## Repo map (top level — ⛔ = do not touch without asking)
| Path | Owns |
|---|---|
| `app/` | Next.js App Router. `app/(app)/` = authed module pages (the `(app)` group is NOT in the URL). `app/api/` = route handlers |
| `lib/` | Business logic: db, auth, rbac, events, ai, copilot, irp, marketplace, format, nav |
| `lib/compliance/` | ⛔ Statutory maths (PF/ESI/PT/TDS, GST). Legal correctness — review required |
| `components/` | Shared UI: `Sidebar.tsx`, `ui.tsx` (primitives) |
| `prisma/` | `schema.prisma` (sqlite/dev) + ⛔`schema.postgres.prisma` (prod, keep in sync) + `seed.ts` + `dev.db` (⛔ generated) |
| `docs/ai/` | This doc system (Layer 2) |
| `public/` | Static assets (only `.gitkeep`) |
| `.claude/` `.cursor/` | Preview launch config / Cursor rules |
| root `*.md` | `product-spec-prd.md`, `product-blueprint.md`, `sangamcrm-portal-audit.md`, `product-test-guide.md`, `DEPLOY.md` |
| `Dockerfile` `docker-compose.yml` `docker-entrypoint.sh` | ⛔ Deploy — review required |
| `node_modules/` `.next/` `tsconfig.tsbuildinfo` | ⛔ Generated |

## Commands (all verified working unless marked)
| Task | Command | Notes |
|---|---|---|
| install | `npm install` | ✅ |
| db setup (first run) | `npm run setup` | ✅ prisma generate + db push + seed |
| dev | `npm run dev` | ✅ → http://localhost:3000 |
| build | `npm run build` | ✅ prisma generate + next build. **Stop any running server first** (Windows DLL lock) |
| reset demo data | `npm run db:reset` | ✅ **destructive** — wipes & reseeds |
| test | — | **None. No test framework or `test` script exists.** |
| lint | `npm run lint` | ⚠️ UNVERIFIED: no eslint config present; first run prompts for setup. Build ignores lint anyway |

**Logins (seed):** `ceo@demo.orbit` / `orbit123` (CEO, sees all) · `sales@demo.orbit` / `orbit123` (restricted).

## Definition of done
1. `npm run build` completes (real gate — TS/ESLint errors are config-ignored, so this proves compile + all routes generate).
2. App runs (`npm run dev`) and every route you touched returns 200 with real content (no test suite exists — verify manually; see `product-test-guide.md`).
3. If you changed the data model: both Prisma schemas updated + `npm run db:push` succeeds.
4. Code changed → update `docs/ai/STATE.md`; decision made → append `docs/ai/DECISIONS.md`.

## Boundaries — NEVER without asking
- Change `prisma/schema.prisma` (data model/migrations) — and if you do, **mirror to `schema.postgres.prisma`**.
- Touch `lib/auth.ts`, `lib/rbac.ts` (session/RBAC) or `lib/compliance/*` (statutory maths).
- Change public contracts: `app/api/marketplace/[source]` payload shape, `app/api/health`.
- Edit `.env`/secrets, deploy files, or anything ⛔ above.

## INDEX — Layer 2 (`docs/ai/`), load on demand
| File | Read when |
|---|---|
| `docs/ai/PRODUCT.md` | Deciding scope/priorities or whether to build something |
| `docs/ai/STATE.md` | Starting a session — what's done / half-built / planned |
| `docs/ai/ARCHITECTURE.md` | Changing data flow, auth, events, or cross-module logic |
| `docs/ai/CONVENTIONS.md` | Writing any page, server action, or component |
| `docs/ai/GOTCHAS.md` | Something behaves oddly, or before "fixing" a quirk |
| `docs/ai/DECISIONS.md` | Questioning why something is built the way it is |
| `docs/ai/playbooks/new-module-page.md` | Adding a module / list page |
| `docs/ai/playbooks/add-prisma-field.md` | Changing the data model |
| `docs/ai/playbooks/add-ai-capability.md` | Adding an AI feature |
| `docs/ai/playbooks/add-marketplace-source.md` | Adding a lead-capture source |
