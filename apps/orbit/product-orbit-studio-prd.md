# Orbit Studio — PRD v1.1 (2026-07-11, post gap-audit)

No-code configurability layer that makes Orbit industry-agnostic: custom fields, picklists, layouts, module naming/visibility, convert mapping, dedupe rules, industry template packs, AI-assisted setup. Inspired by SangamCRM's Developer Studio (evidence: frame-by-frame transcription of its Admin Panel + Studio, 110 frames @ 2s). Full styled PRD: claude.ai artifact "Orbit Studio — PRD".

## Problem
Every field/status/stage/label in Orbit is hard-coded for one imaginary customer. Non-IT verticals can't fit themselves (rename modules, add fields, reshape pipelines) → every industry is a code fork. SangamCRM wins multi-industry deals with exactly this layer (observed: Task→"Activity", Note→"Attachment", TallyBranch→"My Firm / Branch" renames; `_c`-suffixed custom fields everywhere; per-module Web/Mobile/Notification/Global-Search toggles).

## Goals
1. Non-technical admin reaches an industry-fitted workspace ≤ 15 min from signup.
2. Zero code changes to onboard a new industry (5 template packs at launch).
3. Free-text statuses/stages become validated tenant picklists (closes GAPS "no enums").
4. AI-drafted configuration (describe business → reviewable config diff), ≥ 60% accepted unedited.
5. Convert mapping + dedupe become config (simultaneously ships Orbit's missing lead-convert action).

## Non-Goals v1
Custom modules (entity builder — P2) · full drag-drop layout canvas (P1; v1 = structured ordered lists) · workflow/automation builder (separate PRD) · per-tenant DDL (JSON column only) · scripting/formula fields (P2/never) · mobile layouts (no app yet) · **reporting/dashboards on custom fields** (future report builder; P1 exception: custom picklist can drive list scorecard tiles) · **label localization** (per-tenant single-locale in v1; registry design is locale-ready, P2).

## What we adopt from Sangam Studio (observed capabilities)
- **Module Selection List**: rename singular/plural, per-module enabled/in-nav/global-search/notifications toggles, drag order, last-modified audit. (Skip: Mobile toggle, "Send Sync Notification".)
- **Layout Management** per module: form layout, record page (summary card **max 7 fields** — keep the cap), list Display/Available columns; simplified editor in v1, same JSON for drag-drop later.
- **Convert tab**: per-target (Account/Contact/Opportunity) Enable+Required, per-field source→target mapping. Adopt verbatim; runtime Convert button reads it.
- **De-Duplication config**: match fields per module, warn-or-block, applied to create/import/webhook.
- **Dropdown Editor** → Picklist Editor: tenant option lists w/ tone, order, default, archive; option categories preserve semantics (stage category open/won/lost survives renames).
- **Label Editor** (folded into field editor) · **custom fields** (`_c` codes → our `c_` JSON keys) · **Auto Number formats** (P1; also fixes non-atomic invoice numbering) · **Scorecard tile config** (P1, pairs w/ ModuleList framework) · **Lock Records** (P1) · searchable self-describing admin home (P1).
- **Skip/defer**: Parent-Child Filter, CheckIn-CheckOut config, Relation manager, Tab/Panel pixel canvas (v1), and Sangam's uncurated sprawl — ship opinionated defaults + guardrails (usage counts before delete, archive-not-delete, additive template merges).

## P0 requirements (v1)
1. **Config data model** (both Prisma schemas + seed defaults = zero visible change unconfigured): ModuleConfig, FieldDef, PicklistDef/Option, LayoutDef, ConvertMap, DedupeRule, NumberFormat, StudioChangeLog (actor + before/after on every write).
2. **Custom fields** on Lead/Account/Contact/Opportunity/Ticket/Product — 12 types incl. picklist + lookup; stored in `custom Json` column; server-side validation; on forms/record/list/import/export (import v1 = per-tenant generated template) + DPDP export; archive retains values; **caps are plan-tier entitlements (Free 5 / Growth 25 / Scale 50 per module)**. **Rendering surfaces in scope**: Lead/Opp create forms + minimal Contacts/Products pages (don't exist today — build plan WS4.5).
3. **Picklist editor** — all statuses/stages/sources/types migrate to tenant picklists; invalid writes rejected server-side. **Every consumer migrates to category-based logic**: copilot intents, cockpit metrics, stat cards, AI lead-scoring heuristic (source category `marketplace|inbound|manual` replaces literal source names).
4. **Module naming & visibility** — one label registry (`lib/studio/labels.ts`), no hardcoded module strings; disabled module 404s + leaves nav/search.
5. **Form/list layout config** (structured editor) + summary-card ≤ 7 fields; guarded un-hideable system fields.
6. **Convert mapping + transactional Convert action** (links convertedAccountId/ContactId/OpportunityId + convertedAt, emits lead.converted, blocks re-convert; default mapping uses only existing Orbit fields — no Team model exists).
7. **Duplicate rules** (AND/OR match fields, warn/block) on create + import + webhook (migrate existing 24h webhook dedupe onto it).
8. **Industry template packs** (IT Services & AMC, Trading & Distribution, Manufacturing, Professional Services, Real Estate) — apply at signup or later; additive diff w/ conflicts; export-config-as-pack.
9. **AI-assisted setup** — onboarding interview → config proposal as reviewable diff (AI drafts, human approves; ChangeLog source=ai; graceful manual fallback when aiEnabled=false).

## P1
Auto-number formats (atomic sequence table) · scorecard tile config (incl. custom picklists) · drag-drop layout canvas · field-level RBAC integration (prereq: fail-closed RBAC) · record-locking rules · NL config ("add a field…" → drafted change) · sandbox/preview-as-role · searchable admin home · **plan-tier entitlement surface in Studio (limits + upgrade CTA via lib/billing; AI onboarding paid-only — pricing needs owner sign-off)** · optimistic-lock warning on concurrent Studio edits.

## P2 (design for, don't build)
Custom modules · formula/rollup fields + field dependencies · template marketplace · config rollback UI · per-role layouts.

## Architecture constraints
- **JSON column, not EAV, not runtime DDL** (dual-schema rule). Postgres GIN index for filtering; SQLite dev = unindexed-but-correct.
- **Immutable snake_case field codes** (`c_vehicle_number`) = merge-field + import/export API; labels change freely.
- **Label registry refactor first** (biggest mechanical change).
- **Layouts = versioned JSON** rendered by shared ConfigForm/ConfigList/record-page components — same components as gap-analysis Waves 1–2 (one effort, not two).
- **Config bundle cached per request**, invalidated on Studio writes.
- **Prereq: fix fail-open RBAC before shipping Studio.**
- Recommend excluding finance modules (statutory surfaces) from custom fields in v1.

## Success metrics (90 days)
Median time-to-configured-workspace ≤ 15 min · ≥ 70% new tenants apply a template, ≥ 40% make a manual Studio change in 30 days · ≥ 60% AI proposals accepted unedited, < 5% reverted · ≥ 3 non-IT industries with ≥ 5 active tenants · zero engineering tickets for tenant fields/labels/statuses · zero invalid-status writes.

## Phasing (~10 weeks total)
- **S0 Foundations (~2w)**: config models both schemas, label registry, default seed, RBAC fail-closed. Exit: zero visible change.
- **S1 Object Studio (~3w)**: custom fields, picklists, naming/visibility, change log. Exit: live logistics demo (rename module + 3 fields + reshaped stages).
- **S2 Layout + Rules (~3w)**: layouts, convert, dedupe — built WITH the universal record page + ModuleList from product-sangamcrm-video-gaps.md Waves 1–2. Exit: lead→convert→mapped records incl. custom fields.
- **S3 Templates + AI (~2w)**: 5 packs, AI onboarding, pack export. Exit: signup→fitted workspace ≤ 15 min.
- **S4**: P1 wave.

## Open questions
- Eng: SQLite custom-field filter strategy (non-blocking) · label registry vs RSC caching (blocking S0 design).
- Product: custom fields on finance modules? (recommend: no in v1; blocking scope sign-off) · who validates the 4 non-IT packs (2 design partners each; blocking launch).
- Design: single /studio + existing /admin vs one panel (recommend former; non-blocking).
- Legal: DPDP review of consent-field defaults in packs (blocking launch).

## Positioning
SangamCRM: "we can be configured to fit you" (by their team, over weeks). Orbit: "describe your business and watch it fit itself — then change anything yourself," with guardrails they don't have and the finance spine they can't match.
