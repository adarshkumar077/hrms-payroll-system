# Playbook: new module / list page

The dominant pattern — all 14 module pages follow it. **Copy from `app/(app)/leads/`** (page + actions + client component).

## Steps
1. Create `app/(app)/<name>/page.tsx` — RSC:
   - `const s = await requireSession()` then `db.<model>.findMany({ where: { tenantId: s.tenantId }, ... })`.
   - `export const dynamic = "force-dynamic"`.
   - Render `PageHeader` + 2–4 `StatCard`/`MoneyStat` + a `.card` table (`.th`/`.td`). Empty → `<Empty>`.
2. Mutations → `app/(app)/<name>/actions.ts` with top `"use server"`:
   - verify the row's `tenantId === s.tenantId`, write, `revalidatePath("/<name>")`, `emit({tenantId, type:"<name>.<verb>", entity, entityId})`.
3. Interactivity → co-located `"use client"` component (`useTransition`) calling the action. Copy `app/(app)/leads/LeadRowActions.tsx`.
4. Add one entry to the `NAV` array in `lib/nav.ts` (label, href, icon).
5. Money via `inrLakh`/`inr`, dates via `shortDate` (`lib/format.ts`).

## Files to touch
`app/(app)/<name>/page.tsx`, `.../actions.ts`, `.../<Client>.tsx`, `lib/nav.ts`.

## Verify
`npm run build` (stop the dev server first) → then `npm run dev`, open `/<name>`, confirm 200 + real data + the write action persists on refresh.
