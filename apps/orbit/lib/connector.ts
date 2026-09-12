import crypto from "crypto";
import { db } from "./db";

// Auth + key management for the Tally connector (Wave D3). Contract:
// docs/ai/design/wave-d-contracts.md § "Connector HTTP protocol".
//
// Every connector route authenticates with header `x-connector-key`. We
// sha256 the presented key and look up the ConnectorState row whose keyHash
// equals it (an exact-match lookup — keyHash has no @unique of its own, only
// the compound (tenantId,kind) does, so this is a plain equality query), then
// re-compare the two hash buffers with crypto.timingSafeEqual to keep the
// actual accept/reject decision on a constant-time path. Tenant is ALWAYS
// derived from the matched row — never trust a tenantId in the request body.

export const CONNECTOR_KIND_TALLY = "tally";
const ERROR_RING_CAP = 20;

// ── Pure helpers (unit-tested without touching the DB) ──

/** sha256(key) as lowercase hex. */
export function hashConnectorKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

/** Constant-time equality of two equal-length hex strings (e.g. two sha256 digests). */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export type ConnectorAuthDecision = { ok: true; tenantId: string } | { ok: false; status: 401 | 503 };

/**
 * Pure decision table for connector auth, split out from authenticateConnector()
 * so it's testable without a DB:
 *  - no ConnectorState row of kind "tally" exists ANYWHERE → 503 (connector never configured)
 *  - missing header, or no row's keyHash matches the presented key's hash → 401
 *  - hash matches → ok, tenantId comes from the matched row only
 */
export function decideConnectorAuth(
  presentedKey: string | null | undefined,
  anyStateExists: boolean,
  matched: { tenantId: string; keyHash: string } | null
): ConnectorAuthDecision {
  if (!anyStateExists) return { ok: false, status: 503 };
  if (!presentedKey || !matched) return { ok: false, status: 401 };
  const presentedHash = hashConnectorKey(presentedKey);
  if (!secureCompare(presentedHash, matched.keyHash)) return { ok: false, status: 401 };
  return { ok: true, tenantId: matched.tenantId };
}

/** Parse a ConnectorState.meta JSON blob, tolerating corrupt/empty input. */
function parseMeta(metaJson: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(metaJson || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Shallow-merge a patch into a ConnectorState.meta JSON blob. */
export function mergeMeta(metaJson: string | null | undefined, patch: Record<string, unknown>): string {
  return JSON.stringify({ ...parseMeta(metaJson), ...patch });
}

export type ConnectorErrorEntry = { invoiceId: string; error: string; at: string };

/**
 * Push a voucher-push error onto meta.lastErrors, keeping only the most
 * recent `cap` entries (ring buffer of 20 per spec).
 */
export function pushErrorRing(metaJson: string | null | undefined, entry: ConnectorErrorEntry, cap = ERROR_RING_CAP): string {
  const meta = parseMeta(metaJson);
  const existing = Array.isArray(meta.lastErrors) ? (meta.lastErrors as ConnectorErrorEntry[]) : [];
  const next = [...existing, entry].slice(-cap);
  return JSON.stringify({ ...meta, lastErrors: next });
}

// ── DB-backed operations ──

/**
 * Generate a fresh connector token for a tenant: random 32-byte hex,
 * upserted as the tenant's ConnectorState(kind "tally") keyHash. Returns the
 * PLAINTEXT token — this is the only time it's ever available; only its hash
 * is persisted. Regenerating invalidates any previously issued token.
 */
export async function generateConnectorKey(tenantId: string): Promise<string> {
  const plaintext = crypto.randomBytes(32).toString("hex");
  const keyHash = hashConnectorKey(plaintext);
  await db.connectorState.upsert({
    where: { tenantId_kind: { tenantId, kind: CONNECTOR_KIND_TALLY } },
    create: { tenantId, kind: CONNECTOR_KIND_TALLY, keyHash, status: "never-connected" },
    update: { keyHash, status: "never-connected", lastSeenAt: null },
  });
  return plaintext;
}

export type ConnectorAuthResult =
  | { ok: true; tenantId: string; stateId: string }
  | { ok: false; status: 401 | 503 };

/**
 * Authenticate a connector request by its `x-connector-key` header value.
 * On success, stamps lastSeenAt + status "connected" on the matched row (every
 * authenticated hit counts as a heartbeat, per spec) and returns the tenant.
 */
export async function authenticateConnector(headerKey: string | null | undefined): Promise<ConnectorAuthResult> {
  const anyState = await db.connectorState.count({ where: { kind: CONNECTOR_KIND_TALLY } });

  let matched: { id: string; tenantId: string; keyHash: string } | null = null;
  if (headerKey) {
    const presentedHash = hashConnectorKey(headerKey);
    matched = await db.connectorState.findFirst({
      where: { kind: CONNECTOR_KIND_TALLY, keyHash: presentedHash },
      select: { id: true, tenantId: true, keyHash: true },
    });
  }

  const decision = decideConnectorAuth(headerKey, anyState > 0, matched);
  if (!decision.ok) return decision;

  await db.connectorState.update({
    where: { id: matched!.id },
    data: { lastSeenAt: new Date(), status: "connected" },
  });

  return { ok: true, tenantId: decision.tenantId, stateId: matched!.id };
}
