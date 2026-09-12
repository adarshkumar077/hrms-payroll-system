import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { authenticateConnector } from "@/lib/connector";

// POST /api/connector/tally/ledgers  { ledgers: [{ name, group?, closingBalance?, outstanding?, tallyGuid?, raw? }] }
// → { upserted: n }
// Batch upsert into TallyLedger by (tenantId, name); stamps ConnectorState.lastLedgerSyncAt.
// Cap 500/batch (413 above).

export const dynamic = "force-dynamic";

const MAX_BATCH = 500;

export async function POST(req: Request) {
  const { ok: withinLimit, retryAfter } = rateLimit(`connector:ledgers:${clientKey(req)}`, 30, 60_000);
  if (!withinLimit) {
    return NextResponse.json(
      { ok: false, error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const auth = await authenticateConnector(req.headers.get("x-connector-key"));
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 503 ? "Connector not configured for any tenant." : "Invalid connector key." },
      { status: auth.status }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const ledgers = Array.isArray(body?.ledgers) ? body.ledgers : null;
  if (!ledgers) return NextResponse.json({ ok: false, error: "\"ledgers\" must be an array." }, { status: 400 });
  if (ledgers.length > MAX_BATCH) {
    return NextResponse.json({ ok: false, error: `Batch too large (max ${MAX_BATCH}).` }, { status: 413 });
  }

  let upserted = 0;
  const now = new Date();
  for (const l of ledgers) {
    const name = typeof l?.name === "string" ? l.name.trim() : "";
    if (!name) continue;

    const raw = typeof l?.raw === "string" ? l.raw : JSON.stringify(l?.raw ?? {});

    await db.tallyLedger.upsert({
      where: { tenantId_name: { tenantId: auth.tenantId, name } },
      create: {
        tenantId: auth.tenantId,
        name,
        tallyGuid: typeof l?.tallyGuid === "string" ? l.tallyGuid : null,
        group: typeof l?.group === "string" ? l.group : null,
        closingBalance: Number(l?.closingBalance) || 0,
        outstanding: Number(l?.outstanding) || 0,
        raw,
        lastSyncedAt: now,
      },
      update: {
        tallyGuid: typeof l?.tallyGuid === "string" ? l.tallyGuid : null,
        group: typeof l?.group === "string" ? l.group : null,
        closingBalance: Number(l?.closingBalance) || 0,
        outstanding: Number(l?.outstanding) || 0,
        raw,
        lastSyncedAt: now,
      },
    });
    upserted++;
  }

  await db.connectorState.update({ where: { id: auth.stateId }, data: { lastLedgerSyncAt: now } });

  return NextResponse.json({ upserted });
}
