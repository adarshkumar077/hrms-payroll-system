# CLAUDE.md

Operational guide for a Claude Code session. Architecture → [PROJECT.md](PROJECT.md). Known issues → [GAPS.md](GAPS.md). Deep-dive docs load on demand from `docs/ai/` per the index in [AGENTS.md](AGENTS.md).

**Orbit** = AI-native business OS for Indian SMBs (CRM + HR + Payroll + Inventory + GST Finance + AI cockpit). Next.js 14 (App Router/RSC) + Prisma + Tailwind. Single-tenant demo, runs on SQLite with no infra. **Not a git repo.**

## Commands
| Task | Command | Notes |
|---|---|---|
| First-time setup | `npm run setup` | prisma generate + db push + seed |
| Dev | `npm run dev` | → http://localhost:3000 |
| Build | `npm run build` | **Stop any running server first** (Windows locks the Prisma DLL → EPERM) |
| Test | `npm test` | vitest, pure-logic units (compliance/gl/bank/ap/totp/list) |
| Reset demo data | `npm run db:reset` | **destructive** — wipes & reseeds |
| Lint | `npm run lint` | ⚠️ no eslint config — first run prompts; build ignores lint anyway |
| Deploy | see `DEPLOY.md` | Docker (SQLite default / Postgres profile) |

**Logins:** `ceo@demo.orbit` / `orbit123` (CEO, sees all) · `sales@demo.orbit` / `orbit123` (restricted — payroll net pay masked).

## Conventions (follow these — copy the cited file)
- **Pages are async RSCs**, read `db` directly, **always** `where: { tenantId: (await requireSession()).tenantId }`. Add `export const dynamic = "force-dynamic"`. → copy `app/(app)/leads/page.tsx`.
- **Mutations = server actions** in `actions.ts` (`"use server"`); after a write: `revalidatePath(...)` then `emit({...})`; verify the row's `tenantId` before mutating. → `app/(app)/opportunities/actions.ts`.
- **Client bits** = co-located `"use client"` component with `useTransition`. → `app/(app)/leads/LeadRowActions.tsx`.
- **UI**: `PageHeader/StatCard/MoneyStat/Badge/Empty` from `components/ui.tsx`; classes `.card .th .td .btn .input .label .badge` from `app/globals.css`. Money via `inr`/`inrLakh`, dates via `shortDate` (`lib/format.ts`). New list? use `FilterBar`/`Pagination` + `parseListParams` (`lib/list.ts`, `components/ListControls.tsx`).
- **RBAC**: `can(session, module, "read"|"write")`, `fieldHidden(session, "payslip.netPay")` (`lib/rbac.ts`).
- **AI**: import from `lib/ai.ts`/`lib/copilot.ts`/`lib/ocr.ts` — they self-degrade to a local fallback; never wrap in required try/throw. Gate live-only UI on `aiEnabled`/`ocrConfigured`.
- **Statutory maths**: never inline PF/ESI/GST — call `lib/compliance/*`. **GL postings**: use `lib/gl.ts` `postJournal` (throws if Dr≠Cr) / auto-post helpers; never write `JournalLine`s by hand.
- **New page** → add one entry to `lib/nav.ts`. Full recipes in `docs/ai/playbooks/`.

## Gotchas (look like they should work one way, don't)
- **Two Prisma schemas** — edit `prisma/schema.prisma` AND mirror to `prisma/schema.postgres.prisma`, or prod diverges silently.
- **`dev.db` is at `prisma/dev.db`**, not repo root.
- **Green build ≠ type-clean** — `next.config.mjs` ignores TS+ESLint errors. Run `npx tsc --noEmit` to see real errors.
- **AI results can be the local heuristic**, not the model — check `aiEnabled`/provider badge.
- **`(app)` is a route group** — not in the URL (`/dashboard` = `app/(app)/dashboard/`).
- **Pluggable-and-mock pattern**: IRP e-invoice, Razorpay, SSO, email/SMS/WhatsApp, and OCR all run in mock/manual mode until their `*_*` env vars are set (see `.env.*.example`). `lib/irp.ts` is the template.

## Rules (change with care)
- ⛔ **Never** edit `prisma/schema.*` , `lib/auth.ts`, `lib/rbac.ts`, or `lib/compliance/*` without understanding the blast radius (data model / auth / legal correctness). Data-model changes must touch **both** schema files + `npm run db:push`.
- ⛔ **Generated / don't edit**: `node_modules/`, `.next/`, `prisma/dev.db`, `tsconfig.tsbuildinfo`.
- ✅ **Safe to change casually**: individual module list/detail pages, UI copy, seed data, `docs/ai/`.
- Keep `npm test` green; if a test fails, decide test-bug vs code-bug (the compliance/gl/bank suites have caught real bugs — trust them).
- **Before ending any session where code changed**: update `docs/ai/STATE.md`; if a decision was made, append to `docs/ai/DECISIONS.md`.

## Pointers
- [PROJECT.md](PROJECT.md) — architecture, stack rationale, critical paths, what's safe to change.
- [GAPS.md](GAPS.md) — ranked code-quality issues (tenant-scoping, dual schema, ignored TS errors, plaintext secrets, thin tests).
- [AGENTS.md](AGENTS.md) — the always-loaded index into `docs/ai/` task docs & playbooks.
- `product-*.md` — feature spec, market blueprint, incumbent audit, manual test guide.
