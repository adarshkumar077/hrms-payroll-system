# GOTCHAS — things that look like bugs but aren't

| Area | Gotcha | Why |
|---|---|---|
| Prisma schemas | `prisma/schema.prisma` (sqlite) and `prisma/schema.postgres.prisma` (postgres) are **two hand-synced copies**. | Prisma `provider` must be a literal; changing one silently diverges prod. Mirror every model edit. |
| DB path | `dev.db` lives at `prisma/dev.db`, not repo root. | `DATABASE_URL="file:./dev.db"` resolves relative to the schema dir. |
| Build on Windows | `npm run build` fails `EPERM ... query_engine-windows.dll.node` if a dev/start server is running. | The running server locks the Prisma engine DLL. Stop it first. |
| "Build passed" | Green build ≠ type-clean. | `next.config.mjs` sets `typescript.ignoreBuildErrors` + `eslint.ignoreDuringBuilds`. Some pages (`hr/leave`, `integrations`) have latent TS errors yet run fine. |
| AI results | An AI answer may be the **local heuristic fallback**, not the model. | `lib/ai.ts`/`lib/copilot.ts` never throw to the user; they degrade silently. Check the header badge / `aiEnabled`. |
| E-invoicing | IRN / Ack / e-way numbers are deterministic **mocks**. | `lib/irp.ts` only calls the real IRP when `IRP_*` env is set; else fabricates realistic-looking values. Not actually filed. |
| Marketplace webhook | Resolves tenant via `db.tenant.findFirst()`. | Demo/single-tenant only — real multi-tenant must map the key→tenant (`app/api/marketplace/[source]/route.ts`). |
| Routing | `(app)` in the path is a **route group** — not part of the URL. `/dashboard` = `app/(app)/dashboard/page.tsx`. | Next.js convention. |
| Seeding | `npm run db:seed` / `db:reset` run `deleteMany` on every table first. | Destructive by design. |
| History | No git repo — `STATE.md` + `DECISIONS.md` are the only project memory. | Keep them current. |
