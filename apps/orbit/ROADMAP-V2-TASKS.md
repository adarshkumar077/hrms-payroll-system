# ROADMAP-V2 Execution Plan — team, tasks, model assignments (2026-07-12)

CEO/CTO sign-off doc. Scope = the six waves in [ROADMAP-V2.md](ROADMAP-V2.md). Same delivery machine that shipped Studio v1 (11 waves, 400 vitest + 10 e2e green): CTO orchestrates in the main loop, agents build in parallel with **pinned contracts**, every wave ends at a QA gate. Nothing merges without the gate.

## 1. The tech team (agents) and the model policy

Token rule learned from Studio v1: **the expensive model plans and reviews; it never types.** Sonnet builds; Haiku sweeps. No Opus/Fable subagents anywhere.

| Role | Agent | Model | Does | Never does |
|---|---|---|---|---|
| CTO / orchestrator | main loop | Fable (this session) | contracts, task cuts, integration review, unblocking | write feature code via subagent-sized dumps |
| Schema owner | `schema-eng` | Sonnet | ALL Prisma edits — **both schema files** + db push + numbering/config seeds; one task per wave, first | UI |
| Feature builders | `feat-1..3` | Sonnet | pages, actions, libs per conventions (copy cited exemplar file) | schema edits, statutory maths, GL by hand |
| Sweep/mechanical | `sweep-1..2` | **Haiku** | pattern replication across files, label/audit sweeps, test scaffolds from a pinned template, docs (STATE.md) | anything requiring a design decision |
| QA gate | `qa-gate` | Sonnet | `npm test` + `npx tsc --noEmit` + Playwright + live smoke of the wave's golden path; convention guards (no literal statuses — `valuesByCategory` only) | fixing beyond 5-line trivials (files a defect task instead) |
| Integration/security reviewer | CTO (main loop) | Fable | webhook signatures, tx boundaries, tenant scoping, dual-schema diff | — |

**Standing contracts pinned into every builder prompt** (violations = rejected at gate):
1. Every query `where: { tenantId }`; verify row tenantId before mutating.
2. Picklist semantics via `valuesByCategory` — never literal strings.
3. Mutations = server actions; after write: `revalidatePath` + `emit`. `"use server"` files export async fns only (constants in sibling `constants.ts`).
4. Money via `lib/gl.ts postJournal`/helpers; statutory via `lib/compliance/*`. Numbers via `allocateNumber`.
5. New page → `lib/nav.ts` + `can()` guard + copy `app/(app)/leads/page.tsx`. Record pages copy the RecordShell pattern.
6. Custom values through `parseCustom/validateCustom`. New models: JSON as `String @default("{}")`.
7. Agents return a summary of changes, not file dumps.

**Wave cadence (repeats A→F):** ① CTO cuts contracts → ② `schema-eng` lands models (both files, db push, seed) → ③ 2–4 builders in parallel (disjoint file sets — no worktree cost) → ④ Haiku sweeps → ⑤ `qa-gate` → ⑥ CTO review + commit + Haiku updates STATE.md. One wave = one session ≈ one commit train.

**Token budget (subagent output, est.):** A ~500k · B ~800k · C ~900k · D ~1.2M · E ~600k · F ~1.0M ≈ **5M total**, spread over 6 sessions. Haiku handles ≈30% of task-count at ≈5% of cost. Abort rule: any agent >2 retries on the same failure → return to CTO, don't grind.

## 2. Task board

IDs are stable — reference them in commits (`feat(A2): ...`). ⛔ = blocked-by. Owner = role above.

### Wave A — Work-the-day core (~8d) · tasks board group "Wave A"
| ID | Task | Owner | Model | Notes / exemplar |
|---|---|---|---|---|
| A1 | Schema: `Tag`+`TagLink` models; `followUpAt/followUpType/lostReason/updatedById` on Lead+Opportunity; both files + push | schema-eng | Sonnet | ✅ 2026-07-12 — also updatedById on Account/Contact/Ticket/Product; `lost_reason`+`follow_up_type` picklists; ensureStudioDefaults now tops-up new picklist keys for existing tenants |
| A2 | Activities/Tasks UI: list + **My Day** view + create/complete/reassign + timeline emit ⛔A1 | feat-1 | Sonnet | ✅ 2026-07-12 — /activities live (My Day + FilterBar list, ?relatedTo=Module:id deep-link); note: non-CEO roles need "activities" granted (A5); activity_type picklist migration → A5 |
| A3 | Follow-ups end-to-end: fields on 4 record pages (InlineField), overdue block on /dashboard + copilot intent, opp **TAT** metric ⛔A1 | feat-2 | Sonnet | ✅ 2026-07-12 — lead+opp follow-up/lostReason (category-gated: dead/lost), TAT via source lead createdAt→now (updatedAt when closed; no closedAt col — documented), dashboard card + 14th copilot intent, InlineField gains date type |
| A4 | Tags UI: chips on RecordShell, add/remove action, tag filter param on lists ⛔A1 | feat-3 | Sonnet | ✅ 2026-07-12 — lib/tags.ts + TagChips on account/ticket records; ?tag= filter on leads/accounts lists (batch-loaded row badges, no N+1); leads/opps chips land in A5 sweep |
| A5 | Sweep: stamp `updatedById` in every update action; Lost-Reason select on lead close; STATE.md | sweep-1 | **Haiku** | ✅ 2026-07-12 — also tag chips on lead/opp, activity_type via config, seed role grant |
| A6 | Gate: vitest (+new unit: TAT calc, tag filter) + tsc + e2e "create task→complete", smoke My Day | qa-gate | Sonnet | ✅ 2026-07-12 — ALL GREEN (432 vitest, 10/10 e2e, live smoke); caught+fixed defaults.ts top-up gate bug (count→missing-keys check); caveat: pre-existing tenants grant "activities" via /admin roles |

**WAVE A SHIPPED 2026-07-12** — commits 1a11a59 · 2317187 · f60edf4 · 9d45b2f · 68ef6f0 + gate fix.

### Wave B — Quotation builder (~12d)
| ID | Task | Owner | Model | Notes |
|---|---|---|---|---|
| B1 | Schema: `QuotationLine`, charges/adjustment/validUntil/revisionNo/termsId cols, `QuoteTerms` model; both files | schema-eng | Sonnet | ✅ 2026-07-12 — 7f355bc; quotation_stage picklist (7 stages, legacy values 1:1); dormant quotation_status key left in place (decision: standardize on quotation_stage) |
| B2 | Pure totals engine `lib/quote.ts` (line disc/tax, charges, tax-on-charges, adjustment, margin) + **unit tests first** ⛔B1 | feat-1 | Sonnet | ✅ 2026-07-12 — a166afd; 25 tests; header discount spread proportionally pre-tax; optional-line preview; exact-sum rounding |
| B3 | Builder UI: create/edit w/ product-master picker, line grid, copy-to-shipping, stage lifecycle from config, revision via `allocateNumber` ⛔B2 | feat-2 | Sonnet | ✅ 2026-07-12 — new/detail/list + LineGrid/TotalsPanel shared client-server; lock rule: converted=full lock, won/lost=lines locked+stage revertible; layouts orderFields wiring deferred |
| B4 | Convert-to-Invoice into existing finance chain + Quotes panel on Account 360 + print/PDF route ⛔B2 | feat-3 | Sonnet | ✅ 2026-07-12 — 6c05279; discounts baked into unitPrice via taxableBase/qty, charges/adjustment as lines, computeGst reused, Draft invoice, atomic re-check in tx |
| B5 | T&C/payment-terms template CRUD (rich text) + seed defaults; e2e "quote→invoice"; STATE.md | sweep-1 | **Haiku** | ✅ 2026-07-12 — 0936f0a /studio/terms (B5a); quote→invoice e2e spec moved into B6 gate |
| B6 | Gate + CTO review of B4 tx | qa-gate | Sonnet | ✅ 2026-07-12 — ALL GREEN (457 vitest, 11/11 e2e incl. new quote.spec.ts, live quote→invoice math hand-checked); Defect 1 (2-paise convert drift) fixed by CTO via untaxed Round-off invoice line; leftover Draft invoice INV-2026-508 (no invoice delete action exists) |

**WAVE B SHIPPED 2026-07-12** — commits 7f355bc · a166afd · 0936f0a · 6c05279 · 3c8c1dd + round-off fix. Quote→invoice→GL chain complete (the moat-bridge: SangamCRM stops at quotation).

### Wave C — Service & AMC suite (~14d)
| ID | Task | Owner | Model | Notes |
|---|---|---|---|---|
| C1 | Schema: `Contract` (period/value/visitQuota/renewalAt), `InstalledProduct` (serial/warranty/installedAt), ticket cols (typeKey/contractId/charges/feedback); both files | schema-eng | Sonnet | |
| C2 | Contracts module: list w/ renewal tiles, detail (RecordShell), create; expiry/renewal notices in `/api/cron` ⛔C1 | feat-1 | Sonnet | ✅ 2026-07-12 dae0028 — + module/nav/seed/rbac-template registration for contracts+installed (rbac.ts 2 data lines, CTO-reviewed) |
| C3 | Installed-base: module page + panel on Account 360 + link from invoice lines ⛔C1 | feat-2 | Sonnet | ✅ 2026-07-12 1d0a9ad — warranty-expiry strip; invoice-line link deferred |
| C4 | Ticket depth: `ticket_type` picklist (defaults incl. AMC Visit/Breakdown), contract link + end-date badge, charges, feedback form ⛔C1 | feat-3 | Sonnet | ✅ 2026-07-12 172c05f — feedback gated on closed category, account-filtered installed picker |
| C5 | Contract automation v1: event-bus consumer — renewal ticket N days pre-expiry, PMS visit tickets from quota; SLA **config** in Studio (per-priority) + escalation notify ⛔C2,C4 | feat-1 | Sonnet | ✅ 2026-07-12 2aaed0a — runs directly in /api/cron (Job rows dormant); SLA via ticket_priority meta + /studio/sla; 30 tests; CTO event-loop review passed |
| C6 | Deepen `it-services-amc` pack into Service edition; unit tests (renewal date maths, SLA resolve); STATE.md | sweep-1 | **Haiku** | ✅ 2026-07-12 — NO pack change: 6-field cap already hit; ruling = vertical depth ships as platform modules, packs stay curated (DECISIONS.md) |
| C7 | Gate: e2e "contract→auto renewal ticket" | qa-gate | Sonnet | ✅ 2026-07-12 — ALL GREEN (487 vitest, 12/12 e2e incl. new service.spec.ts, live cron + idempotency proof); 2 low flags fixed by CTO (priority-tone map → optionTone; module top-up missing-keys gate) |

**WAVE C SHIPPED 2026-07-12** — commits 8404c02 · 172c05f · 1d0a9ad · dae0028 · 2aaed0a + gate fixes. SangamCRM's AMC heartland matched, with automation they do manually.

### Wave D — Ecosystem bridge (~18d) · the hard one
| ID | Task | Owner | Model | Notes |
|---|---|---|---|---|
| D1 | **CTO designs first** (main loop, no agent): Tally connector protocol contract + telephony/WA adapter interfaces + webhook auth spec | CTO | Fable | ✅ 2026-07-12 a1a5613 — docs/ai/design/wave-d-contracts.md (the pinned spec) |
| D2 | Tally connector: standalone Node CLI in `connector/` — XML/JSON gateway client (port 9000), pull ledgers+outstanding, push sales vouchers, offline queue+retry, `.env` config ⛔D1 | feat-1 | Sonnet | ✅ 2026-07-12 781a5a4 — zero-dep CLI, 48 XML tests, per-voucher acks, backoff |
| D3 | App side: `/api/connector/*` (keyed), ledger-mirror table + `/integrations` Tally card w/ sync status ⛔D2 schema via schema-eng | feat-2 | Sonnet | ✅ 2026-07-12 e862cdc — sha256 key auth (plaintext once), 4 routes, batch caps, error ring; D0 schema ca09335 |
| D4 | `lib/telephony.ts` adapter (Exotel first, mock-or-live like lib/irp.ts): click-to-call action, call-lifecycle webhook route (HMAC) ⛔D1 | feat-3 | Sonnet | ✅ 2026-07-12 1a10074 — token-in-URL auth (Exotel passthru unsigned), 25 parser tests, CallButton on 3 pages |
| D5 | Calls module: log list + timeline entries from webhook + `Call` model (schema-eng) ⛔D4 | feat-2 | Sonnet | ✅ 2026-07-12 — folded into D4 commit; phone-matched to lead/contact/account, emit-once terminal guard |
| D6 | `lib/whatsapp.ts` adapter + template send from record page + `MessageLog` w/ delivery-state webhook ⛔D1 | feat-3 | Sonnet | ✅ 2026-07-12 06b5605 — real Exotel v2 shape, monotonic delivery upgrades, /messages module, 44 tests |
| D7 | Sweep: 16 unit tests for both webhook parsers (copy razorpay-webhook.test pattern); connector README; STATE.md | sweep-1 | **Haiku** | ✅ 2026-07-12 9948553 — .env.telephony.example, GAPS/DEMO/STATE notes (parser tests landed with D4/D6) |
| D8 | Gate + CTO security review (all 3 webhook surfaces) | qa-gate+CTO | Sonnet | ✅ 2026-07-12 — PASS: 627 vitest, 12/12 e2e, all security items green, live connector cycle + replay-idempotency proven; minor finding (whatsapp webhook rate limit) fixed by CTO |

**WAVE D SHIPPED 2026-07-12** — commits a1a5613 · ca09335 · e862cdc · 06b5605 · 781a5a4 · 1a10074 · 9948553 + rate-limit fix. The adoption unlock: Tally sync, calls, WhatsApp — all adapter-gated, all mock-mode demoable.

### Wave E — List/record tail + import wizard (~10d)
| ID | Task | Owner | Model | Notes |
|---|---|---|---|---|
| E1 | Framework core: extend `lib/list.ts` + FilterBar — per-column filters, page-size, `SavedSearch` model (schema-eng), column-chooser + multi-select components | feat-1 | Sonnet | design once; sweep replicates |
| E2 | Bulk actions (assign/status/tag/delete) w/ tenant-checked server action ⛔E1 | feat-2 | Sonnet | |
| E3 | **Rollout sweep across all list pages** ⛔E1,E2 | sweep-1+sweep-2 | **Haiku ×2** | pure replication of E1 pattern — the plan's biggest Haiku win |
| E4 | Attachments panel on RecordShell (Attachment model + /api/upload exist) + comment attribution | feat-3 | Sonnet | |
| E5 | Import mapping wizard: column-map UI, create/update modes, saved mappings, dedupe preview ⛔E1 | feat-1 | Sonnet | extends lib/csv.ts + dedupe engine |
| E6 | Gate: e2e saved-search + bulk assign + import w/ mapping | qa-gate | Sonnet | |

### Wave F — Automation + marketing + reports v1 (~16d)
| ID | Task | Owner | Model | Notes |
|---|---|---|---|---|
| F1 | Schema: `WorkflowRule`, `MessageTemplate`, `Campaign`+`CampaignSend`, `SavedReport`; both files | schema-eng | Sonnet | |
| F2 | Auto-distribution: round-robin/least-busy assign on lead.created/ticket.created, business-hours aware, Studio config ⛔F1 | feat-1 | Sonnet | |
| F3 | Approvals (quote discount % → pending→approve/reject) + workflow rules v1 (condition→action/notify) on event bus ⛔F1 | feat-2 | Sonnet | CTO reviews loop-guard |
| F4 | `lib/templates.ts` merge-field renderer (`{{module.field}}`, custom fields incl.) + tests + template CRUD ⛔F1 | feat-3 | Sonnet | pure lib first |
| F5 | Campaigns v1: audience by tag/filter → send via Wave-D adapters → delivery tracking + test-send ⛔F4, D6 | feat-1 | Sonnet | |
| F6 | Inbound email → lead/ticket (one provider, mock pattern) + reports builder v1 (module+filters+group-by+chart+CSV+schedule) ⛔F1 | feat-2 | Sonnet | reports on list framework from E |
| F7 | Sweep: e2e campaign test-send + report export; STATE.md + DECISIONS.md | sweep-1 | **Haiku** | |
| F8 | Gate + CTO integration review | qa-gate | Sonnet | |

## 3. Definition of done (every wave)
`npm test` green (incl. new units) · `npx tsc --noEmit` clean on root app · Playwright golden paths green · live smoke of the wave's flow · both Prisma schemas in sync (CI job guards) · conventions contract upheld · STATE.md updated · one commit train on `studio/s0-foundations` (or `roadmap/wave-X` branches once the GitHub remote exists).

## 4. Kickoff order
A → B → C → D (C∥D possible) → E → F. Waves A–F are registered on the session task board (IDs 17–22) with dependencies. **Say "start Wave A" to begin** — schema-eng goes first, then 3 builders fan out.
