# ARCHITECTURE

**Shape:** modular monolith — one Next.js 14 app, clean module boundaries by folder. INFERRED: chosen over microservices/ERPNext-fork for SMB scale + a single shared data model (the reason the cockpit can be cross-module). See `DECISIONS.md`.

## Request/data flow
```
Browser
  └─ app/(app)/layout.tsx      → getSession() gate + Sidebar + AI badge
       └─ <module>/page.tsx    (RSC)  read db, scoped by session.tenantId
            └─ <Client>.tsx    "use client" + useTransition
                 └─ actions.ts "use server" → db write → revalidatePath → emit()
                                                              └─ EventLog row
CEO cockpit (app/(app)/dashboard) aggregates across modules + reads recentEvents()
API: app/api/{auth/logout, health, marketplace/[source]} route handlers
```

## Key abstractions (all in `lib/`)
| Module | Role |
|---|---|
| `db.ts` | Prisma singleton (`db`). |
| `auth.ts` | JWT session in an httpOnly cookie via `jose`; bcrypt passwords; `login/getSession/requireSession`. |
| `rbac.ts` | JSON perms per `Role` — module-level (`can`) + field-level (`fieldHidden`). |
| `events.ts` | `emit()` appends to `EventLog` — the event bus the cockpit + activity feed read. |
| `ai.ts` | Provider-agnostic LLM (OpenAI-compatible → Anthropic → local heuristic). All fns self-degrade. |
| `copilot.ts` | NL→fixed-intent classifier; runs a curated tenant-scoped query per intent (LLM never writes SQL). |
| `compliance/payroll.ts`, `gst.ts` | Pure statutory calculators (PF/ESI/PT/TDS; CGST/SGST/IGST, IRN gate). |
| `irp.ts` | Pluggable e-invoice adapter (live IRP if `IRP_*` set, else mock). |
| `marketplace.ts` | Per-source lead normalizers + `ingestLead` (dedup + auto-score). |
| `format.ts`, `nav.ts` | INR/date helpers; sidebar registry. |

## Data model (`prisma/schema.prisma`, 25 models)
Every business table carries `tenantId` (multi-tenant isolation). Hubs: `Tenant` → `User`/`Role`, CRM (`Lead`,`Opportunity`,`Account`,`Quotation`), HR (`Employee`,`SalaryStructure`,`PayrollRun`,`Payslip`), Inventory (`Item`,`StockMove`,`Warehouse`,`PurchaseOrder`), Finance (`Invoice`,`InvoiceLine`), and `EventLog`.

## Major decisions (why)
- **RSC-first + server actions**, no separate API layer for CRUD — INFERRED: least code, colocated, tenant-scoping enforced server-side.
- **Event bus as a DB table** — INFERRED: simplest cross-module "live cockpit" without infra; upgrade path noted to NATS/Kafka in `lib/events.ts`.
- **AI always degrades to heuristics** — so the app is demoable with zero keys (design law in `PRODUCT.md`).
- **Two Prisma schemas** — Prisma provider must be literal; sqlite for zero-config dev, postgres for prod (`GOTCHAS.md`).
- **Auth is a hand-rolled JWT cookie**, not NextAuth — INFERRED: minimal deps for a demo; ⛔ revisit before real multi-tenant prod.

## UNVERIFIED / weak spots
- No automated tests — behavior guarantees are manual (`product-test-guide.md`).
- Cross-schema drift risk between the two Prisma files is unguarded (no CI check).
