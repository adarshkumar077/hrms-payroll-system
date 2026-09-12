/**
 * Env loading for the connector. Hand-rolled .env parsing (no `dotenv`
 * dependency) — reads connector/.env if present, without overriding any
 * variable already set in the process environment (so `FOO=x node index.ts`
 * always wins over the file).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONNECTOR_ROOT = path.resolve(__dirname, "..");

export function loadDotEnv(filePath: string = path.join(CONNECTOR_ROOT, ".env")): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export interface LedgerNameConfig {
  sales: string;
  cgst: string;
  sgst: string;
  igst: string;
}

export interface ConnectorConfig {
  orbitUrl: string;
  connectorKey: string;
  tallyUrl: string;
  syncIntervalSec: number;
  companyName?: string;
  ledgerNames: LedgerNameConfig;
}

/** Reads + validates config from process.env (after loadDotEnv has run). Exits(1) with a clear message if required vars are missing. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ConnectorConfig {
  const orbitUrl = env.ORBIT_URL;
  const connectorKey = env.ORBIT_CONNECTOR_KEY;

  const missing: string[] = [];
  if (!orbitUrl) missing.push("ORBIT_URL");
  if (!connectorKey) missing.push("ORBIT_CONNECTOR_KEY");
  if (missing.length > 0) {
    console.error(
      `[connector] Missing required env var(s): ${missing.join(", ")}. Copy connector/.env.example to connector/.env and fill them in.`
    );
    process.exit(1);
  }

  const syncIntervalSec = Number(env.SYNC_INTERVAL_SEC ?? "300");

  return {
    orbitUrl: (orbitUrl as string).replace(/\/+$/, ""),
    connectorKey: connectorKey as string,
    tallyUrl: (env.TALLY_URL || "http://localhost:9000").replace(/\/+$/, ""),
    syncIntervalSec: Number.isFinite(syncIntervalSec) ? syncIntervalSec : 300,
    companyName: env.TALLY_COMPANY_NAME || undefined,
    ledgerNames: {
      sales: env.TALLY_LEDGER_SALES || "Sales",
      cgst: env.TALLY_LEDGER_CGST || "Output CGST",
      sgst: env.TALLY_LEDGER_SGST || "Output SGST",
      igst: env.TALLY_LEDGER_IGST || "Output IGST",
    },
  };
}
