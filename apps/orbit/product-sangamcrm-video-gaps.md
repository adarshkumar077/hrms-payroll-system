# SangamCRM Video Gap Backlog (2026-07-11)

Source: 14-min screen recording of live SangamCRM v124.6.2 tenant (Enjay's own — 2,751 accounts, 6,038 tickets, 171,956 calls, 2,020 quotations, 672 Tally ledgers), fully transcribed frame-by-frame and compared against Orbit's schema + routes. Full analysis with per-entity field tables: claude.ai artifact "Orbit vs SangamCRM — Video Gap Analysis".

## Modules Orbit lacks entirely
- **P0**: Contacts UI · Activities/Tasks UI (model exists) · Contracts/AMC (renewal engine, expiration notice, per-year visits) · Tags (cross-cutting, drives campaign segments)
- **P1**: Calls (telephony log: direction/status/duration/source number) · Products installed-base (serial, warranty, install date — distinct from Product Master) · Campaigns (multi-channel, audience by tag, test send) · Templates (Email/SMS/WhatsApp/In-App/Print, merge fields `{::Module_field::}`) · Reports builder (group-by, chart, schedule, export) · WhatsApp/Message logs with delivery states
- **P2**: Checklists (campaign send queue) · Announcements · My Firms/Branches (Tally ledger mirror w/ per-account receivable/payable)

## Field gaps (top items per entity; full list in artifact)
- **Lead** (9 fields → need ~30): record number, Account/Contact links, **Followup Date + Type + change count**, Lost Reason, Product Category, Industry, Hierarchy, Account Relationship, campaign attribution, multi phone/email + verified-at, threaded Comments/History, address grid, Assigned To + Team, **Convert tab with Lead→Account/Contact/Opportunity field mapping** (video shows the exact mapping spec).
- **Account**: Account Relationship (Customer/Partner/Vendor/Other — doubles as Orbit's missing vendor master), Referred By, parent account, PAN, Customer Code/Category, related panels (Leads/Opps/Quotes/Tickets/Products/Contracts + counts), History Panel (unified comms timeline), Check In (geo visit).
- **Opportunity**: number, contact/email/phone, quantity, priority, opportunity type, configurable stages + lost reason, followup date/type, expected close date, **Lead-Created TAT auto-metric** ("12 Days, 2 Hours"), latest comment.
- **Quotation** (Orbit read-only → full builder): auto number w/ configurable format, valid-until days, 7 stages, billing/shipping account+contact+address w/ copy-to-shipping, product-master line items w/ groups, UOM, per-line discount/tax, optional-item flag, charges + tax-on-charges + adjustment, margin, T&C/payment-terms templates (rich text), bank details tab, PDF config, revision no.
- **Ticket**: contact/phone/email, Problem Observed body, ticket type (AMC visit/breakdown/delivery/survey…), contract link + end date, support mode, ticket charges, feedback response/suggestion.
- **Activity**: related-to (18 entity types), end datetime, expected vs actual duration, spare/other cost → total cost.

## Framework gaps (build once, apply everywhere)
- **List framework (P0)**: clickable scorecard KPI tiles (count + ₹ per status) · per-column filter row (text/select/date/₹) · column chooser · multi-select + bulk actions · saved searches + AND/OR advance-search builder · show 10/25/50/100 · favorite star + inline edit · import wizard (mapping UI, create/update modes, duplicate check, saved mappings).
- **Record framework (P0)**: edit forms (Orbit has NONE) · tags · attributed comments w/ history · attachments panel per record · related-record panels w/ counts · merged activity timeline · audit block (updatedAt/updatedBy/Auto Updated By "Automation") · verified badges + SMS/WhatsApp quick actions on phones · Check In.

## Admin/platform gaps
- **P0 automation subset**: auto-distribution (round-robin/least-busy/business-hours), inbound email → lead/ticket, SLA/TAT config + escalation matrix, approval rules (discount %), workflow (condition → action/alert), dedupe config.
- **P1**: custom fields + dropdown/label editors (skip full Studio layout designer), phone/email masking admin UI (Orbit has `fieldHidden` primitive), password/IP/working-hours policies, teams management, employee cost → activity cost analysis, contract automation (auto-create on opp close, renewal tickets, PMS visits).
- **P2**: white-label logo, currency/timezone formats, business hours, mobile app config (geofence, attendance, call logging, layouts).

## Integrations
- **P1**: Tally bridge (ledger + outstanding sync as migration path — 90% of target customers run Tally; also "Update Sales Order in Tally" equivalent) · one telephony provider (Exotel/Knowlarity/MyOperator) · one WhatsApp BSP (they use Gallabox) · SendGrid + suppression list.
- **P2**: Google Maps on addresses, Google Calendar, Drive export, Power BI.

## Do NOT copy
20-year clutter (9 ticket statuses, 16 call types, typo'd picklists), Studio-level everything-configurable, dense modal-on-modal UI. SangamCRM has **zero AI** and **no finance of its own** (stops at quotation; Tally does the money). Orbit's counter-position: "SangamCRM tells Tally what you sold. Orbit is where the money actually lives."

## Build order
1. **Wave 1**: universal record page (edit/tags/comments/timeline/related) + create forms + Lead Convert w/ mapping + followup dates + My Tasks + owner/team + record numbers + updatedAt.
2. **Wave 2**: ModuleList framework (tiles, column filters, multi-select/bulk, saved views) + import wizard w/ dedupe.
3. **Wave 3**: quotation builder → GST invoice chain + Contracts/AMC + installed-base + ticket fields.
4. **Wave 4**: auto-distribution, inbound email, SLA/escalation, approvals, templates + campaigns (real BSP), report builder.
5. **Wave 5**: Tally bridge, telephony + Calls, custom fields/picklists, mobile/PWA w/ check-in + card scan.
