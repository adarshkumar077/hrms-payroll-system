# Wave D design contracts (D1) — CTO, 2026-07-12

The pinned contract for all Wave D builders. Research basis: Tally XML/JSON-over-HTTP is vendor-sanctioned (port 9000, native JSON from TallyPrime 7.0, Tally must be running → on-prem connector); Exotel/MyOperator sell voice+WhatsApp from one platform; BSP market is volatile → everything behind adapters (ROADMAP-V2.md §2).

## D0 — Models (one schema pass, BOTH prisma files)

- **`Call`**: id, tenantId, direction String ("inbound"|"outbound"), fromNumber, toNumber, status String (normalized: "initiated"|"answered"|"completed"|"missed"|"failed"), durationSec Int?, providerCallId String?, ownerId String?, leadId String?, contactId String?, accountId String? (all scalar, matched by phone at ingest), notes String?, summary String? (AI later), startedAt DateTime, endedAt DateTime?, createdAt. @@index([tenantId, startedAt]), @@index([tenantId, providerCallId]).
- **`MessageLog`**: id, tenantId, channel String ("whatsapp"|"sms"), direction String, toNumber, templateKey String?, body String, providerMsgId String?, deliveryStatus String ("queued"|"sent"|"delivered"|"read"|"failed") default "queued", error String?, entity String?, entityId String? (polymorphic-lite), createdAt, updatedAt. @@index([tenantId, createdAt]), @@index([tenantId, providerMsgId]).
- **`TallyLedger`** (mirror, read-only in-app): id, tenantId, name, tallyGuid String?, group String?, closingBalance Float @default(0), outstanding Float @default(0), raw String @default("{}"), lastSyncedAt DateTime. @@unique([tenantId, name]).
- **`ConnectorState`**: id, tenantId, kind String ("tally"), keyHash String (SHA-256 hex of the connector token — plaintext shown ONCE at generation, never stored), status String @default("never-connected"), lastSeenAt DateTime?, lastLedgerSyncAt DateTime?, lastVoucherPushAt DateTime?, meta String @default("{}"), createdAt, updatedAt. @@unique([tenantId, kind]).
- **Invoice** gains `tallyPushedAt DateTime?` (stamped by voucher-ack).

## Connector HTTP protocol (app side, D3)

All under `app/api/connector/tally/*`. Auth on EVERY route: header `x-connector-key`; compare `sha256(key)` against ConnectorState.keyHash with `crypto.timingSafeEqual`; miss → 401; no ConnectorState → 503. Rate-limit per key like /api/cron. Every hit updates lastSeenAt + status "connected".

- `POST /handshake` `{version, companyName}` → `{ok, tenant}` (stores companyName in meta).
- `POST /ledgers` `{ledgers: [{name, group?, closingBalance?, outstanding?, tallyGuid?, raw?}]}` → batch upsert TallyLedger by (tenantId,name), stamps lastLedgerSyncAt → `{upserted: n}`. Cap 500/batch (413 above).
- `GET /pending-vouchers` → Finalized invoices with `tallyPushedAt: null`: `{vouchers: [{invoiceId, number, date, accountName, lines: [{description, qty, rate, amount, taxRate}], cgst, sgst, igst, grandTotal}]}` (cap 50).
- `POST /voucher-ack` `{invoiceId, ok: true, tallyGuid?} | {invoiceId, ok: false, error}` → stamp tallyPushedAt / record error in meta.lastErrors (ring of 20), emit "tally.voucher_pushed"|"tally.voucher_failed".

Key management UI on /integrations (Tally card): generate/regenerate token (plaintext once), status pill from lastSeenAt (<10 min = connected), counts, ledger mirror link (/integrations/tally — table of TallyLedger).

## Connector CLI (D2, `connector/` — standalone, NO app imports)

Node 18+ single-file-ish CLI, own package.json (deps: none beyond node stdlib; XML built/parsed with small hand-rolled helpers — no heavy deps). Env: `ORBIT_URL`, `ORBIT_CONNECTOR_KEY`, `TALLY_URL` (default http://localhost:9000), `SYNC_INTERVAL_SEC` (default 300; 0 = run once).
Loop: (1) handshake → (2) pull ledgers from Tally (XML envelope `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>...` Ledgers collection incl. closing balance) → POST /ledgers in batches → (3) GET /pending-vouchers → for each, build a Sales voucher XML (`<TALLYREQUEST>Import Data</TALLYREQUEST>`, voucher type "Sales", ledger entries: party Dr grandTotal / sales Cr subtotal / CGST-SGST-IGST output Cr each when > 0) → POST to Tally → parse response (`<CREATED>1</CREATED>` = ok, `<LINEERROR>` = error) → voucher-ack per invoice.
Resilience: Tally unreachable → log + skip cycle (never crash); per-voucher errors ack'd individually; simple backoff (skip 1 cycle after 3 consecutive Tally failures). Pure XML builders/parsers in `connector/lib/*.ts` with vitest tests IN THE MAIN REPO's test run (verify vitest's include glob picks them up; if not, place tests under lib/connector-xml.test.ts importing from connector/lib). README.md with setup steps (Tally: enable ODBC/HTTP server, company open).

## Adapter interfaces (D4 telephony, D6 whatsapp) — mock-or-live like lib/irp.ts

- `lib/telephony.ts`: `telephonyConfigured` (EXOTEL_SID+EXOTEL_TOKEN+EXOTEL_PHONE set), `clickToCall({to, userPhone?})` → live: Exotel connect API (Basic auth), mock: fake sid; `parseCallWebhook(query/body)` → normalized `{providerCallId, direction, from, to, status, durationSec?, startedAt, endedAt?}` — pure + unit-tested. Route `POST+GET /api/webhooks/telephony?token=<WEBHOOK_TOKEN>`: token query param compared timingSafeEqual against `TELEPHONY_WEBHOOK_TOKEN` env (Exotel passthru webhooks don't sign; token-in-URL is the documented v1 auth), 503 unconfigured / 401 bad token; upsert Call by providerCallId (create on first event, update status/duration on later ones), match lead/contact/account by normalized phone (reuse the dedupe engine's India phone normalization), emit "call.logged" once on terminal status.
- `lib/whatsapp.ts`: `whatsappConfigured` (WHATSAPP_PROVIDER + creds), `sendTemplate({to, templateKey, body, entity?, entityId?})` → creates MessageLog "queued" then live-send (provider "exotel" v1: their WhatsApp send API; "mock": flips to "sent" immediately) and updates providerMsgId; `parseDeliveryWebhook(body)` → `{providerMsgId, status}` pure + tested. Route `/api/webhooks/whatsapp?token=` same token auth (`WHATSAPP_WEBHOOK_TOKEN`) → update MessageLog.deliveryStatus (monotonic: never downgrade delivered→sent), emit "message.status".
- UI: click-to-call button next to every phone display goes through ONE shared client component `components/CallButton.tsx` (renders tel: link when !telephonyConfigured — graceful); WhatsApp send button on record pages arrives with templates in Wave F — Wave D exposes send ONLY from the Calls/Messages surfaces (v1: a simple "Send WhatsApp" form on /messages using free-form body, templateKey optional).

## Module registration
New nav entries: "Calls" → /calls (module "calls"), "Messages" → /messages (module "messages") under CRM; "Tally Sync" lives inside /integrations (existing module). DEFAULT_MODULES += calls, messages. Role grants: seed + DEFAULT_MEMBER_PERMISSIONS (2 data lines, pre-approved same as C2's ruling).

## Sanctioned literals for Wave D
Call.status and MessageLog.deliveryStatus normalized sets are PROVIDER-domain values (like Invoice.status) — plain strings, NOT picklists; documented here as the exception. Everything tenant-semantic stays config-driven.
