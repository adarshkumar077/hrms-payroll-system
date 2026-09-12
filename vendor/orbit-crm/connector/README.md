# Orbit Tally Connector

Standalone CLI that keeps a local Tally Prime / Tally.ERP 9 install and the
Orbit app in sync:

- **Pull**: reads every ledger (name, group, closing balance, GUID) out of
  Tally and pushes it to Orbit's `TallyLedger` mirror.
- **Push**: reads finalized-but-not-yet-pushed invoices from Orbit
  (`GET /pending-vouchers`), builds a Tally Sales voucher import XML for
  each, posts it into Tally, and reports the per-voucher result back to
  Orbit so it can stamp `Invoice.tallyPushedAt`.

It is a plain Node 18+ script with **zero runtime dependencies** — no app
imports, no npm packages beyond `tsx`/`typescript` for running TypeScript
directly. It only ever talks to two things over HTTP: the Orbit app's
`/api/connector/tally/*` endpoints, and Tally's own local HTTP/XML port.

## 1. Enable Tally's HTTP server

Tally must be running, on the machine (or LAN) the connector can reach, with
the target **company open**, and with its HTTP/XML server turned on:

1. Open Tally, then `F1` (Help) → `Settings` → `Connectivity` (menu path
   varies slightly by version — in older Tally.ERP 9 it's
   `Gateway of Tally → F12: Configure → Advanced Configuration`).
2. Set **"Enable ODBC / Enable HTTP server"** (the client/server / ODBC
   option) to **Yes**.
3. Note the **port** — default is `9000`. This must match `TALLY_URL` below.
4. Open the company you want to sync (`Gateway of Tally → Select Company`).
   Tally's XML interface only serves data for the currently open company;
   there is no way to sync a closed company.
5. Leave Tally running for as long as the connector needs to sync. If Tally
   is closed or the company isn't open, every request will fail — the
   connector logs this and retries on the next cycle (see "Resilience"
   below), it does not crash.

## 2. Configure the connector

```bash
cd connector
cp .env.example .env
```

Fill in `.env`:

| Var | Required | Default | Notes |
|---|---|---|---|
| `ORBIT_URL` | yes | — | Base URL of the running Orbit app, e.g. `http://localhost:3000` |
| `ORBIT_CONNECTOR_KEY` | yes | — | Plaintext token from the Tally card on `/integrations` — **shown once at generation**, copy it immediately |
| `TALLY_URL` | no | `http://localhost:9000` | Tally's HTTP/XML port |
| `TALLY_COMPANY_NAME` | no | (whatever's open) | Pins requests to a specific company if more than one might be open |
| `SYNC_INTERVAL_SEC` | no | `300` | Seconds between cycles. `0` = run once and exit |
| `TALLY_LEDGER_SALES` | no | `Sales` | Ledger name credited for the voucher subtotal |
| `TALLY_LEDGER_CGST` | no | `Output CGST` | Ledger name credited for CGST (only when CGST > 0) |
| `TALLY_LEDGER_SGST` | no | `Output SGST` | Ledger name credited for SGST (only when SGST > 0) |
| `TALLY_LEDGER_IGST` | no | `Output IGST` | Ledger name credited for IGST (only when IGST > 0) |

The `TALLY_LEDGER_*` names must match your Tally chart of accounts **exactly**
— every installation names its output-tax ledgers differently. If a name is
wrong, Tally will reject that voucher with a `LINEERROR` ("Ledger ... does
not exist"), which the connector reports back to Orbit as a per-invoice
failure (the invoice stays pending and is retried next cycle once you fix
the name).

On the Orbit side: generate the connector token from the Tally card on
`/integrations` (CEO login). The plaintext key is shown once — paste it into
`ORBIT_CONNECTOR_KEY` immediately, it can't be recovered afterward
(only regenerated).

## 3. Run it

From the repo root (uses the root checkout's `tsx`, no separate install
needed):

```bash
# One-off sync, then exit
SYNC_INTERVAL_SEC=0 npx tsx connector/index.ts

# Continuous sync on the configured interval (default 300s)
npx tsx connector/index.ts
```

Or from inside `connector/`:

```bash
cd connector
npx tsx index.ts
```

To run this folder as a fully standalone deployment (copied outside the
Orbit monorepo, no root `node_modules` to borrow from), install its own
tooling first:

```bash
cd connector
npm install
npm start
```

For a long-running deployment, run it under a process supervisor
(`pm2`, `systemd`, Windows Task Scheduler, NSSM, etc.) so it restarts if the
machine reboots or the process exits unexpectedly. For a scheduled one-shot
instead of a daemon, set `SYNC_INTERVAL_SEC=0` and invoke it from cron /
Task Scheduler on whatever cadence you want.

## What one cycle does

1. `POST /handshake` — announces the connector to Orbit (also refreshes the
   "connected" status pill on `/integrations`). If this fails, the whole
   cycle is skipped (nothing else can proceed without it).
2. **Ledger pull**: exports every ledger from Tally, in batches of up to 500,
   `POST`s them to `/ledgers`.
3. **Voucher push**: `GET /pending-vouchers` (Orbit caps this at 50 per
   call — the connector pages through it up to 20 pages/cycle), builds a
   Sales voucher import XML per invoice, posts it to Tally, then
   `POST /voucher-ack`s the result (success + Tally GUID, or failure +
   error message) back to Orbit either way.

## Resilience

- **Tally unreachable** (network error, timeout, non-2xx): the cycle is
  logged and skipped — the process never crashes. After **3 consecutive**
  cycles that can't reach Tally at all, the connector backs off and skips
  **1 additional cycle** before trying again, so a genuinely-down Tally
  doesn't spin the loop uselessly.
- **Orbit unreachable**: same — logged, cycle skipped, loop continues on the
  next interval.
- **Per-voucher failures** (Tally rejects a specific voucher, e.g. a bad
  ledger name) are acked individually as failures — they don't affect the
  other vouchers in the batch or count toward the Tally-unreachable backoff,
  since Tally clearly *was* reachable.
- `Ctrl+C` (`SIGINT`) / `SIGTERM` finish the current cycle, then exit
  cleanly instead of stopping mid-request.

## Layout

```
connector/
  index.ts              CLI entrypoint — the handshake/pull/push loop
  package.json           own manifest, zero runtime deps
  tsconfig.json           standalone type-check config (not used by the root app's tsc)
  .env.example
  README.md               this file
  lib/
    config.ts             env loading (+ hand-rolled .env parser) and validation
    http.ts                fetch wrappers: OrbitClient (JSON) + postXmlToTally (XML)
    xml.ts                  generic hand-rolled XML build/escape/parse helpers
    tally-xml.ts             Tally-specific envelope builders/parsers (pure functions)
    tally-xml.test.ts        table-driven vitest tests for xml.ts + tally-xml.ts
                              (picked up automatically by the root repo's `npm test`)
```

## Why no XML library

Tally's dialect is flat and predictable for the two things this connector
does (export a Ledger collection, import a Sales voucher) — a couple of
regex-based tag readers in `lib/xml.ts` cover it without pulling in a
dependency. If a future wave needs richer XML (nested repeating groups,
mixed content, namespaces), swap `lib/xml.ts` out; nothing else needs to
change since `lib/tally-xml.ts` is the only consumer.
