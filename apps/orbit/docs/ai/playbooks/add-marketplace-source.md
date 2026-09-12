# Playbook: add a lead-capture source

Extends inbound marketplace capture. Everything lives in `lib/marketplace.ts` + the webhook route.

## Steps
1. In `lib/marketplace.ts`:
   - Add the source name to the `SOURCES` tuple.
   - Add a case in `normalize(source, raw)` mapping the provider's real payload fields → `{name, company, email, phone, enquiry}` (see the IndiaMART `SENDER_*` / JustDial mappings already there; document the real field names in comments).
   - Add a realistic fixture in `samplePayload(source)` for the simulate button.
   - `ingestLead` already dedups (same phone/email, non-Dead, 24h) and auto-scores via `scoreLead` + `emit("lead.captured")` — no change needed.
2. The webhook `app/api/marketplace/[source]/route.ts` validates `source ∈ SOURCES` automatically — no route change.
3. The `/integrations` console renders a card per source automatically from `SOURCES`.

## Files to touch
`lib/marketplace.ts` only (route + console are data-driven).

## Verify
`npm run build`; open `/integrations`, click **Simulate incoming lead** on the new source, then check `/leads` for the created, auto-scored lead. Or:
`curl -X POST http://localhost:3000/api/marketplace/<Source> -H "Content-Type: application/json" -d '<payload>'` → `{ok:true, leadId:...}`.
