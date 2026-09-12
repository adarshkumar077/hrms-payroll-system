# Orbit Studio — Build Tasks (CTO plan v1.1, 2026-07-11, post gap-audit)

Source docs: [product-orbit-studio-prd.md](product-orbit-studio-prd.md) (what/why) · CTO plan artifact "Orbit Studio — CTO Build Plan" (full ADRs, calendar, risks). This file is the working checklist. **~60 dev-days; 11 weeks @ 2 engineers** (v1.1 added: git/CI + test harness, query-site refactors, missing module surfaces, numbering seed init, plan entitlements).

## Architecture decisions (summary — full ADRs in the plan artifact)
1. Custom values = `custom Json @default("{}")` on Lead/Account/Contact/Opportunity/Ticket/Product. No EAV, no runtime DDL.
2. Config read = `getStudioConfig(tenantId)` bundle, ≤2 queries, React `cache()` per request; `Tenant.configVersion` bumped on every Studio write.
3. Field codes immutable snake_case (`c_*` for custom); labels display-only. Codes = CSV headers + future merge fields.
4. Picklist behavior binds to option `category` (open/won/lost/converted/dead), never label/value. Existing DB strings become option values → no business-row migration.
5. Layouts = versioned JSON (`LayoutDef.spec`), rendered by shared ConfigForm/ConfigList/RecordPage. v1 editor = structured lists; drag-drop later edits same doc.
6. Numbering = `NumberFormat.nextSeq` incremented inside the creating transaction (kills `count()+1` duplicates).
7. Template packs = repo JSON (`lib/studio/packs/*.json`) + additive merge engine with diff/conflict preview.
8. **Prereq: RBAC fail-closed** (deny on no-role/unknown-role/parse-error in `lib/rbac.ts:10,12,19`) + seeded default role before any Studio ships.
9. Finance modules (invoices/GL/payroll/bank/bills) excluded from custom fields + layout editing in v1 (rename/nav only).
10. All new models mirrored to `prisma/schema.postgres.prisma` in the same PR; extend `schema-sync.test.ts`. Custom-field list filtering = Postgres GIN; SQLite dev unindexed-but-correct.

## New models (both schemas, all tenant-scoped)
`ModuleConfig` (labels, enabled, inNav, navGroup/order, inGlobalSearch) · `FieldDef` (module, code, label, type ×12, system, required, helpText, picklistId, lookupModule, archived, sortOrder; @@unique tenant+module+code) · `PicklistDef`/`PicklistOption` (value immutable, label, tone, **category**, order, isDefault, archived) · `LayoutDef` (module, kind form|record|list|card, spec Json, version) · `ConvertMap` (source/target, enabled, required, mappings Json) · `DedupeRule` (fields Json [["email"],["phone"]] = OR of ANDs, mode warn|block) · `NumberFormat` (format tokens {prefix}{FY}{YYYY}{seq:N}, nextSeq) · `StudioChangeLog` (actor, source ui|ai|template|system, object, action, before/after Json). Plus `custom Json` on 6 entities, `configVersion Int` + `updatedAt` additions.

New lib surface: `lib/studio/{config,labels,validate,convert,dedupe,numbering,packs,changelog}.ts` + `lib/studio/packs/*.json`.

## Refactor map (grep-verified)
- Lead statuses ×3: `app/(app)/leads/page.tsx:12`, `leads/LeadRowActions.tsx:6`, `leads/actions.ts:9` → picklist `lead_status`
- Ticket statuses ×3: `tickets/page.tsx:11`, `tickets/TicketStatusSelect.tsx:6`, `tickets/actions.ts:8` → `ticket_status`
- Stages ×2 + STAGE_PROB: `opportunities/page.tsx:11`, `opportunities/actions.ts:8` → `opportunity_stage` (probability in option metadata; won/lost logic by category)
- Sources: `lib/marketplace.ts:18` → `lead_source`
- Nav: `lib/nav.ts` + `components/Sidebar.tsx` → ModuleConfig ∩ RBAC; icon keys replace emoji
- Module strings in every PageHeader/empty state → `labels.ts` (one module per PR)
- Invoice `INV-2026-${600+count}` / receipt numbering in `finance/invoices/actions.ts` → atomic allocator
- Badge tones in `components/ui.tsx` + per-page tone maps → PicklistOption.tone
- CSV import/export (`import/actions.ts`, `api/export/[model]`) → FieldDef-derived columns + validate + dedupe
- **Query sites (audit add — silent-wrong-numbers class):** `lib/copilot.ts:158` (`stage:"ClosedWon"`), `:205` (stage order), `:243` (`notIn:["Converted","Dead"]`) · `dashboard/page.tsx:27,30,125,140` · `leads/page.tsx:59-60` · `opportunities/page.tsx:54` → category helpers (`stagesByCategory("won")`); lint rule bans literal stage/status/source comparisons
- **AI scoring (audit add):** `lib/ai.ts:122` +20 for literal marketplace names → read source option category (`marketplace|inbound|manual`); LLM prompt gets label + category

## Workstreams
- [ ] **WS0 (4d, S0)**: RBAC fail-closed + default-role seed + nav gating · atomic number allocator (fixed formats; **nextSeq seeded from existing max per tenant** — else day-one collisions) · `updatedAt` on 6 entities
- [ ] **WS0.5 (3d, S0 — audit add)**: **git init + remote + GitHub Actions CI** (npm test, tsc --noEmit, schema-sync) — repo currently has no VCS/CI · Playwright golden-path harness (nav/leads/opps/tickets/dashboard on unconfigured tenant) wired to CI
- [ ] **WS1 (4d, S0)**: 8 models both schemas + schema-sync tests · `ensureStudioDefaults()` (lazy per tenant, ensureChart pattern, idempotent/upsert-guarded) · changelog wrapper
- [ ] **WS2 (4d, S0–S1)**: config bundle loader + cache · labels.ts + mechanical sweep (snapshot-guarded) · Sidebar from config
- [ ] **WS3 (6d, S1)**: picklist editor UI · migrate 8 hardcoded lists · category-anchored stage/status logic · **query-site sweep: copilot + dashboard + stat cards + AI scoring heuristic + lint rule (audit add, 1d)** · server-side membership validation
- [ ] **WS4 (8d, S1)**: custom Json + validate.ts (12 types, plan-tier caps) · field manager UI · ConfigForm/ConfigList · import/export/search/webhook honor FieldDefs (import v1 = per-tenant generated template; mapping wizard stays gap-backlog Wave 2)
- [ ] **WS4.5 (4d, S1–S2 — audit add)**: **Lead + Opportunity create forms (don't exist); minimal Contacts + Products pages (don't exist)** — ConfigForm/ConfigList-driven; also closes two gap-backlog Wave 1 items · default ConvertMap references only existing fields (no Team model)
- [ ] **WS5 (10d, S2)**: layout editors (form/record ≤7-field summary card/list) · **universal RecordPage** (= gap-backlog Wave 1) · ModuleList scorecard tiles + column chooser (= Wave 2 seed)
- [ ] **WS6 (6d, S2)**: ConvertMap editor · transactional convertLead + Convert button + linkage cols + lead.converted event · dedupe editor + matcher wired to create/import/webhook
- [ ] **WS7 (5.5d, S1–S2)**: /studio shell (module table, per-module Fields/Picklists/Layouts/Rules tabs, changelog viewer) · self-describing admin home · **plan-tier entitlements (caps 5/25/50, AI setup paid-only, upgrade CTA) + DPDP export includes config/custom values (audit add, 0.5d)**
- [ ] **WS8 (6d, S3)**: packs merge/diff engine + export-as-pack · author 5 packs (IT Services & AMC, Trading, Manufacturing, Professional Services, Real Estate) · onboarding pack picker + AI interview → approved diff (source=ai, manual fallback)

## Testing
Unit (vitest, pure-logic convention): validate / numbering (incl. concurrency) / dedupe / convert / packs (idempotent round-trip) / labels fallbacks. Golden-path snapshots: unconfigured tenant renders byte-identical after every refactor PR (CI gate). Tenant isolation extended to all 8 config models. Category-semantics regression on cockpit revenue/pipeline with renamed stages. Manual E2E script per phase exit = the demo.

## Phase exits
- **S0 (wk3)**: **repo under git, CI green on every merge** · RBAC denies by default (3 paths tested) · atomic numbers under parallel writes, sequences initialized above existing maxima · zero visible change (snapshot-verified) · schemas in sync
- **S1 (wk6)**: live demo — rename module + 3 custom fields + reshaped stages, respected by forms/lists/kanban/CSV · **a lead can be created in-UI** · cockpit + copilot numbers correct under renamed stages · invalid status rejected server-side
- **S2 (wk9)**: Convert produces mapped Account+Contact+Opportunity (custom values intact, transactional) · dedupe on create+import · RecordPage w/ inline edit + timeline on Leads/Accounts · scorecard tiles filter · plan caps enforced
- **S3 (wk11)**: signup → fitted workspace ≤15 min (AI or manual) · pack export/import round-trips · **Postgres E2E green** (first time ever) · CLAUDE.md/STATE.md/DECISIONS.md updated

## Top risks
1. Label/picklist sweep breaks pages → default-config equivalence + snapshots, one module per PR.
2. Stage/status string comparisons missed → grep-audit during WS3, lint rule banning string-literal stage checks, cockpit regression tests.
3. JSON filter perf → GIN index, 50-field cap, Postgres-only custom filters at launch, 100k-row bench wk8.
4. Fail-closed lockout → seed default role first.
5. If forced to cut: cut S3's AI interview to template picker — **never cut S0 hardening**.
