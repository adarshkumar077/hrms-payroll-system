#!/usr/bin/env -S npx tsx
/**
 * Orbit Tally connector CLI.
 *
 * Standalone, no imports from the Orbit app. Talks to Orbit only over the
 * documented HTTP protocol under /api/connector/tally/* (see
 * docs/ai/design/wave-d-contracts.md, "Connector HTTP protocol"), and to
 * Tally only over its local HTTP/XML port.
 *
 * Run once:      SYNC_INTERVAL_SEC=0 npx tsx connector/index.ts
 * Run on a loop: npx tsx connector/index.ts        (uses SYNC_INTERVAL_SEC, default 300s)
 */
import { loadDotEnv, readConfig, type ConnectorConfig } from "./lib/config";
import { OrbitClient, postXmlToTally, chunk, TallyUnreachableError, type PendingVoucherDTO } from "./lib/http";
import { buildLedgerExportRequest, parseLedgerExportResponse, buildSalesVoucherXml, parseVoucherImportResponse } from "./lib/tally-xml";

const CLI_VERSION = "1.0.0";
const LEDGER_BATCH_SIZE = 500;
const MAX_VOUCHER_PAGES_PER_CYCLE = 20; // guards against an unbounded loop; 20 * 50 = 1000 vouchers/cycle ceiling
const TALLY_FAILURE_BACKOFF_THRESHOLD = 3;

function log(msg: string): void {
  console.log(`[connector] ${new Date().toISOString()} ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pulls every ledger out of Tally and pushes them to Orbit in <=500-record batches. */
async function syncLedgers(orbit: OrbitClient, config: ConnectorConfig): Promise<void> {
  const requestXml = buildLedgerExportRequest({ companyName: config.companyName });
  const responseXml = await postXmlToTally(config.tallyUrl, requestXml);
  const ledgers = parseLedgerExportResponse(responseXml);

  if (ledgers.length === 0) {
    log("Tally returned 0 ledgers (empty company, or the ledger collection TDL wasn't accepted) — nothing to push.");
    return;
  }

  const batches = chunk(ledgers, LEDGER_BATCH_SIZE);
  let totalUpserted = 0;
  for (const [i, batch] of batches.entries()) {
    const result = await orbit.pushLedgers(
      batch.map((l) => ({
        name: l.name,
        group: l.group,
        closingBalance: l.closingBalance,
        tallyGuid: l.tallyGuid,
        raw: l.raw,
      }))
    );
    totalUpserted += result.upserted ?? 0;
    log(`Pushed ledger batch ${i + 1}/${batches.length} (${batch.length} records) -> ${result.upserted} upserted`);
  }
  log(`Ledger sync complete: ${ledgers.length} pulled from Tally, ${totalUpserted} upserted in Orbit`);
}

/** Builds + posts a Sales voucher import for one pending invoice, then acks the result back to Orbit. */
async function pushOneVoucher(orbit: OrbitClient, config: ConnectorConfig, voucher: PendingVoucherDTO): Promise<void> {
  const xml = buildSalesVoucherXml(voucher, config.ledgerNames, config.companyName);
  try {
    const responseXml = await postXmlToTally(config.tallyUrl, xml);
    const result = parseVoucherImportResponse(responseXml);
    if (result.ok) {
      await orbit.voucherAck({ invoiceId: voucher.invoiceId, ok: true, tallyGuid: result.tallyGuid });
      log(`Voucher ${voucher.number} (invoice ${voucher.invoiceId}) imported into Tally${result.tallyGuid ? ` [${result.tallyGuid}]` : ""}`);
    } else {
      await orbit.voucherAck({ invoiceId: voucher.invoiceId, ok: false, error: result.error ?? "unknown Tally error" });
      log(`Voucher ${voucher.number} (invoice ${voucher.invoiceId}) REJECTED by Tally: ${result.error}`);
    }
  } catch (err) {
    if (err instanceof TallyUnreachableError) {
      // Tally itself is down mid-batch — don't ack (leave pending for next cycle), bubble up so the
      // caller can trip the connectivity backoff instead of treating this as a per-voucher business error.
      throw err;
    }
    // Anything else (e.g. a malformed voucher shape) is this voucher's problem, not Tally's reachability.
    const message = err instanceof Error ? err.message : String(err);
    await orbit.voucherAck({ invoiceId: voucher.invoiceId, ok: false, error: message });
    log(`Voucher ${voucher.number} (invoice ${voucher.invoiceId}) failed locally: ${message}`);
  }
}

/** Drains /pending-vouchers (paged, cap 50/page per the contract) and pushes each into Tally. */
async function syncVouchers(orbit: OrbitClient, config: ConnectorConfig): Promise<void> {
  let page = 0;
  let totalSeen = 0;
  while (page < MAX_VOUCHER_PAGES_PER_CYCLE) {
    const { vouchers } = await orbit.pendingVouchers();
    if (!vouchers || vouchers.length === 0) {
      if (page === 0) log("No pending vouchers.");
      break;
    }
    totalSeen += vouchers.length;
    log(`Pending vouchers page ${page + 1}: ${vouchers.length} to push`);
    for (const voucher of vouchers) {
      await pushOneVoucher(orbit, config, voucher);
    }
    // /pending-vouchers is defined as "finalized invoices with tallyPushedAt: null" (cap 50) — once we've
    // acked a page, the next fetch naturally returns the next slice. A short page means we've drained it.
    if (vouchers.length < 50) break;
    page += 1;
  }
  if (totalSeen > 0) log(`Voucher sync complete: ${totalSeen} vouchers processed this cycle`);
}

interface CycleState {
  consecutiveTallyFailures: number;
  skipCyclesRemaining: number;
}

async function runCycle(orbit: OrbitClient, config: ConnectorConfig, state: CycleState): Promise<void> {
  if (state.skipCyclesRemaining > 0) {
    state.skipCyclesRemaining -= 1;
    log(`Skipping this cycle (backoff after repeated Tally failures) — ${state.skipCyclesRemaining} more skip(s) queued.`);
    return;
  }

  try {
    await orbit.handshake(CLI_VERSION, config.companyName);
  } catch (err) {
    // Orbit being unreachable is a hard stop for the cycle (nothing else can proceed without it), but not
    // a Tally connectivity issue, so it doesn't feed the Tally backoff counter.
    log(`Handshake with Orbit failed, skipping this cycle: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  try {
    await syncLedgers(orbit, config);
    await syncVouchers(orbit, config);
    state.consecutiveTallyFailures = 0;
  } catch (err) {
    if (err instanceof TallyUnreachableError) {
      state.consecutiveTallyFailures += 1;
      log(`Tally unreachable (${state.consecutiveTallyFailures}/${TALLY_FAILURE_BACKOFF_THRESHOLD}): ${err.message}`);
      if (state.consecutiveTallyFailures >= TALLY_FAILURE_BACKOFF_THRESHOLD) {
        state.skipCyclesRemaining = 1;
        state.consecutiveTallyFailures = 0;
        log(`Reached ${TALLY_FAILURE_BACKOFF_THRESHOLD} consecutive Tally failures — backing off for 1 cycle.`);
      }
    } else {
      // Orbit-side error mid-cycle (rate limit, 5xx, etc.) — log and move on, never crash the process.
      log(`Cycle error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const config = readConfig();
  const orbit = new OrbitClient(config.orbitUrl, config.connectorKey);
  const state: CycleState = { consecutiveTallyFailures: 0, skipCyclesRemaining: 0 };

  log(`Starting. Orbit=${config.orbitUrl} Tally=${config.tallyUrl} interval=${config.syncIntervalSec}s`);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Received ${signal}, shutting down after current cycle.`);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  if (config.syncIntervalSec <= 0) {
    await runCycle(orbit, config, state);
    log("SYNC_INTERVAL_SEC=0 — ran a single cycle, exiting.");
    return;
  }

  while (!shuttingDown) {
    await runCycle(orbit, config, state);
    if (shuttingDown) break;
    await sleep(config.syncIntervalSec * 1000);
  }
  log("Stopped.");
}

main().catch((err) => {
  // Last-resort guard: the CLI should never crash from an unhandled promise rejection — log and exit
  // non-zero so a process supervisor (systemd/Task Scheduler/pm2) can restart it if desired.
  console.error(`[connector] Fatal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exitCode = 1;
});
