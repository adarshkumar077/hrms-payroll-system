# Orbit v2 Roadmap (2026-07-12)

What to build next, ranked by evidence. Inputs: the SangamCRM video catalog ([product-sangamcrm-video-gaps.md](product-sangamcrm-video-gaps.md)), the shipped-wave record ([docs/ai/STATE.md](docs/ai/STATE.md)), and a 104-agent deep-research run on the 2026 Indian SMB CRM market (23 verified claims, adversarially checked; findings below marked **[V]** verified / **[U]** unverified single-source). Full styled version: claude.ai artifact "Orbit v2 Roadmap".

## 1. Where Orbit stands vs the video (coverage matrix summary)

Of ~45 capabilities in the SangamCRM walkthrough: **8 built, 12 partial, 21 missing.**

| Suite | Built ✅ | Partial 🟡 | Missing ❌ |
|---|---|---|---|
| Sales | Contacts UI, record pages w/ inline edit, Convert w/ mapping | lead/opp field depth (followups, TAT, lost reason) | **quotation builder**, Activities/Tasks UI, Tags, Calls |
| Service | — | ticket depth, fixed SLA (no config) | **Contracts/AMC**, installed-base, contract automation |
| Marketing | — | — | campaigns, templates, WhatsApp/message logs |
| Platform | record numbers + formats, scorecard tiles (2 lists) | import (no mapping wizard), comments (no attribution), attachments (not per-record) | column filters, saved searches, bulk actions, **reports builder** |
| Admin | **Studio (exceeds Sangam)**: fields/picklists/layouts/dedupe/packs/AI onboarding | field-masking (no UI) | auto-distribution, inbound email, SLA config, approvals, workflows, teams |
| Ecosystem | marketplace lead capture, Razorpay verified webhook | email (mock) | **Tally bridge**, telephony, WhatsApp BSP |

Moat with no Sangam equivalent (do not regress): Studio config-as-data + AI onboarding, full GST finance with double-entry GL, payroll, inventory, AI spine, fail-closed RBAC.

## 2. What the market research says (drives the ranking)

1. **[U→strong] Integration is the adoption barrier, not features.** The organically-grown Indian MSME stack is Tally + WhatsApp Business + manual invoicing; double data entry is the strongest predictor of CRM abandonment (30–70% failure rates cited). Native Tally/WhatsApp hooks are *table-stakes*, not differentiators.
2. **[V] Tally sync is vendor-sanctioned, not a hack.** Official path: XML/JSON over Tally's HTTP gateway (port 9000), bidirectional, native JSON from TallyPrime 7.0; ODBC read-only for ledgers/outstanding. Caveat: needs an on-prem connector (Tally must be running); voucher-level custom data needs TDL work.
3. **[V] Telephony and WhatsApp have converged.** Exotel (official WhatsApp BSP) and MyOperator both sell voice + WhatsApp from one platform, with documented CTI table-stakes: click-to-call, call-lifecycle webhooks (HMAC-verified), auto call logging. One vendor integration can deliver Calls *and* WhatsApp. (Refuted 1-2: don't assume MyOperator custom payload mapping.)
4. **[U] The standalone BSP market is real but volatile.** AiSensy ~₹1,500/mo entry, Wati ₹1,999–13,499 (sources conflict), Gallabox ₹799–14,999 (sources conflict), Interakt ₹2,499+, per-message markups ₹1.04–1.12 over Meta rates — and BSPs are moving up-stack into CRM-lite. **Partner, never build; abstract behind an adapter.**
5. **[V] Verticalization is the winning GTM.** Sell.do (real-estate-only: unit-level inventory, cost sheets, demand letters, channel-partner onboarding, site-visit check-in) and Corefactors (8+ industry editions) — and verifiers confirmed these "editions" are *configurations of one platform*, exactly what Orbit Studio packs already are. Real-estate table-stakes: property-portal lead ingestion (99acres/MagicBricks) + field-agent geo-tracking.
6. **[U→strong] AMC/service vertical has quantified pain.** Service companies lose 15–25% of AMC revenue to missed renewals/Excel tracking; needed chain = contract → scheduled ticket → parts consumption → renewal. Existence proof: ServewellCRM (India, IT-hardware AMC CRM). This is SangamCRM's own heartland (6,038 tickets, AMC vocabulary throughout the video).
7. **[V] AI differentiation is voice/call-centric.** Sell.do markets a 30-second AI voice-agent callback; Corefactors AI call-sentiment + lead scoring. Orbit's AI spine already covers scoring/drafting; call intelligence becomes possible once telephony lands.
8. **[V] Pricing models are an axis** (Kylas flat ₹12,999/mo unlimited users vs Bigin ₹400/user/mo) — context for /billing later, out of scope here.

Research gaps to note honestly: no verified claims survived on Wati/AiSensy/Gallabox/Interakt specifics, Knowlarity, Privyr, or TeleCRM (its one claim was refuted 0-3), and trading/distribution vertical evidence is thin (generic-CRM pain: reorder cycles, credit limits, ERP sync).

## 3. Ranking rule

Each wave scored on: **(a)** market demand evidence (research), **(b)** video-proven parity gap, **(c)** Orbit leverage — what our existing spine (Studio config, event bus, GL, AI, RecordShell) makes cheap. Dev-days calibrated to the actual velocity of the 11 shipped Studio waves (multi-agent, ~1–2 days wall-clock per ~10 dev-day wave).

| Wave | Demand | Parity gap | Leverage | Days |
|---|---|---|---|---|
| A. Work-the-day core | H (table-stakes everywhere) | H (video: followups/My Tasks) | H (Activity model exists) | ~8 |
| B. Quotation builder + sales depth | H (video: 2,020 quotes) | H (read-only today) | H (feeds existing invoice→GL chain) | ~12 |
| C. Service & AMC suite | H (15–25% renewal loss [U]; Sangam heartland) | H (whole module missing) | M-H (tickets+SLA+packs exist) | ~14 |
| D. Ecosystem bridge (Tally + telephony/WhatsApp) | H (abandonment evidence [U]; convergence [V]) | H (video: 672 Tally ledgers, 171k calls) | M (webhook/adapter patterns exist; on-prem connector is new) | ~18 |
| E. List/record framework tail + import wizard | M (UX table-stakes) | H (video framework spec) | H (FilterBar/list.ts base) | ~10 |
| F. Automation + templates + campaigns + reports v1 | M-H (team-size differentiator) | H (whole admin layer) | M-H (event bus + tags + BSP from D) | ~16 |

## 4. The waves

### Wave A — Work-the-day core (~8 days)
Everything else needs this. **Activities/Tasks UI** (list + My Day view + create/complete; model already exists) · native **follow-up date/type** on Lead/Opportunity (+ overdue surfacing on dashboard/copilot) · **Tags** (new model, both schemas; chips on records, filter on lists — prerequisite for campaign audiences) · lead **Lost Reason** + opportunity **Lead-Created TAT** metric · **updatedBy** audit stamp (wired into the existing timeline). AI counter-move (cheap): "draft my follow-up plan" on overdue leads via existing lib/ai.ts.

### Wave B — Quotation builder + sales depth (~12 days)
The video's biggest single artifact (2,020 quotations in Sangam's tenant) and our best moat-bridge: **quote → invoice → GL is a chain nobody in the researched set has** (SangamCRM stops at quotation; Tally does their money). Full builder: product-master line items, per-line discount/tax, charges + adjustment, T&C/payment-terms templates (rich text), validity, 7-stage lifecycle from config picklists, revision numbers via allocateNumber, billing/shipping w/ copy-to, **"Convert to Invoice"** into the existing finance chain, PDF via the print-route pattern. Quotes panel on Account 360.

### Wave C — Service & AMC suite (~14 days)
SangamCRM's heartland, quantified pain, and our it-services-amc pack already speaks the vocabulary. **Contracts/AMC module** (period, value, per-year visit quota, covered products, renewal date; renewal + expiry notices via cron) · **installed-base** (serial/warranty/install-date per account, distinct from Product master) · **ticket depth** (type picklist incl. AMC-visit/breakdown, contract link + end-date display, charges, feedback) · **contract automation v1** (auto-create renewal ticket N days before expiry; scheduled PMS visit tickets from the visit quota — event-bus driven) · SLA **config** (per-priority targets in Studio, replacing the fixed 4–48h) with breach escalation notification. Deepen the it-services-amc pack into a marketable "Service edition" (research finding 5: editions = configs, our packs literally are this).

### Wave D — Ecosystem bridge: Tally + telephony/WhatsApp (~18 days)
The adoption unlock (research findings 1–4). **Tally connector**: small on-prem Node agent (documented XML/JSON-over-HTTP, port 9000) syncing ledger masters + outstanding (read, via ODBC/XML) first, pushing sales vouchers (invoices) second; queue + retry because Tally must be running; ships as a download from /integrations. **Telephony + WhatsApp via ONE converged vendor** (Exotel or MyOperator — both give calls + WhatsApp): click-to-call on every phone, call-lifecycle webhook → **Calls log module** + timeline entries, WhatsApp template send + **message log with delivery states**. Adapter pattern like lib/irp.ts — mock mode without keys; BSP-specific quirks isolated so a Gallabox/Wati adapter can be added later (finding 4: volatile market, abstract it). AI counter-move: call-note summarization once call data flows (finding 7).

### Wave E — List/record framework tail + import wizard (~10 days)
Parity polish that makes demos land and migrations possible. Extend lib/list.ts + FilterBar: **per-column filters, column chooser, multi-select + bulk actions (assign/status/tag/delete), saved searches**, page-size selector, scorecard tiles on all lists · record pages gain **attachments panel** (Attachment model + /api/upload exist) and comment attribution · **import mapping wizard** (column-mapping UI, create/update modes, saved mappings, dedupe preview — the migration path off SangamCRM/Excel; extends lib/csv.ts + dedupe engine).

### Wave F — Automation, templates, campaigns, reports v1 (~16 days)
The "runs itself" layer, on the event bus that already exists. **Auto-distribution** (round-robin/least-busy lead & ticket assignment, business-hours aware) · **approval rules** (discount % on quotes from Wave B) · **workflow rules v1** (condition → action/notify, Studio-configured) · **inbound email → lead/ticket** (one provider, mock pattern) · **Templates** (Email/WhatsApp/SMS/print with `{{module.field}}` merge fields) · **Campaigns v1** (audience by tag/filter from Waves A+E, send via Wave D channels, delivery tracking, test send) · **reports builder v1** (saved report = module + filters + group-by + chart + CSV export + optional email schedule — on the list framework, not a BI engine).

**Sequencing note:** A→B→C are independent after A; D can start in parallel with C (different surface area); E anytime; F last (depends on tags, BSP, quotes). Total ≈ 78 dev-days — at demonstrated multi-agent velocity, roughly 6 build sessions.

## 5. Not building (and why)

- **A BSP / chat-inbox product** — BSPs (₹799–₹15k/mo, moving up-stack) are partners-slash-competitors; we integrate via adapter, never rebuild their inbox.
- **AI voice agent (30-sec callback)** — verified competitor feature, but efficacy unverified and telephony must land first; revisit post-Wave D as a partner integration.
- **Full BI/report designer** — reports v1 (group-by + chart + schedule) covers the video; a drag-drop BI engine is a year-2 bet.
- **Checklists, Announcements, My Firms/Branches UI** — P2 in the video catalog, no research demand signal; Branches partially arrives free with Tally ledger sync.
- **Native mobile app** — PWA + responsive record pages first; geo Check-In rides on the existing attendance geofence primitive when field-service demand is proven.
- **20-year clutter** — 9 ticket statuses, 16 call types, modal-on-modal UI (explicit "do NOT copy" list from the video analysis).
- **GST portal auto-filing, Power BI/Drive connectors** — unchanged P2.

## 6. Verification & provenance

Every ranking cites a video line (product-sangamcrm-video-gaps.md), a shipped wave (docs/ai/STATE.md), or a research claim (verified 3-0/2-1 votes; [U] items single-source, flagged). Coverage matrix spot-checked against the live route tree (21 module pages under app/(app)/; no activities/contracts/calls/campaigns/templates routes; no Tag model in schema). Research caveats: TeleCRM/Privyr/Knowlarity and BSP specifics unverified; pricing figures carry billing-period caveats; all facts as of July 2026.
