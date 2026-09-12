# CONVENTIONS — patterns actually used here

Copy the cited file when doing the same kind of work.

| Pattern | Rule | Copy from |
|---|---|---|
| **Page = RSC** | `export default async function`, read `db` directly, no client fetching for reads. Add `export const dynamic = "force-dynamic"`. | `app/(app)/leads/page.tsx` |
| **Tenant scope** | EVERY query filtered by `s.tenantId` from `await requireSession()`. Never query unscoped. | `app/(app)/opportunities/page.tsx` |
| **Mutations = server actions** | Separate `actions.ts` with top `"use server"`; after write call `revalidatePath(...)` then `emit({...})`. Verify row's `tenantId` before mutating. | `app/(app)/opportunities/actions.ts` |
| **Client interactivity** | Co-located `"use client"` component using `useTransition`; calls the server action. | `app/(app)/leads/LeadRowActions.tsx` |
| **UI primitives** | Use `PageHeader`, `StatCard`, `MoneyStat`, `Badge`, `Empty` from `components/ui.tsx`. | `components/ui.tsx` |
| **CSS classes** | `.card .th .td .btn .btn-ghost .input .label .badge` — defined once. Don't invent new ones. | `app/globals.css` |
| **Money / dates** | `inr()` `inrLakh()` `shortDate()` — never hand-format. | `lib/format.ts` |
| **RBAC field masking** | `fieldHidden(session, "payslip.netPay")` to hide a value per role; `can(session, mod, "read"\|"write")` for access. | `app/(app)/payroll/[id]/page.tsx` |
| **Events** | `emit({tenantId, type:"noun.verb", entity, entityId, payload?, actorId?})` after meaningful writes. | `lib/events.ts` |
| **AI calls** | Import from `lib/ai.ts` (`scoreLead`/`draftFollowUp`/`summarizeCall`). They self-degrade to local heuristics — never wrap in required try/throw. Gate live-only UI on `aiEnabled`. | `lib/ai.ts` |
| **Auth** | `getSession()` / `requireSession()`; the `(app)/layout.tsx` already redirects unauthenticated users. | `lib/auth.ts` |
| **Prisma access** | Singleton `db` (camelCase models: `db.payrollRun`, `db.eventLog`). | `lib/db.ts` |
| **Statutory maths** | Never inline PF/ESI/GST formulas — call helpers. | `lib/compliance/payroll.ts`, `gst.ts` |
| **Nav** | New page → add one entry to the `NAV` array. | `lib/nav.ts` |

Naming: files kebab-case or PascalCase for components; server-action files always `actions.ts`; intents/events `noun.verb`.
