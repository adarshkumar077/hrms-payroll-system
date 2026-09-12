import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { authenticateConnector, mergeMeta } from "@/lib/connector";

// POST /api/connector/tally/handshake  { version, companyName } → { ok, tenant }
// First call the CLI makes each cycle. Stores companyName (+ connector
// version, + timestamp) into ConnectorState.meta so /integrations can show
// what the connector last reported.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { ok: withinLimit, retryAfter } = rateLimit(`connector:handshake:${clientKey(req)}`, 30, 60_000);
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

  const tenant = await db.tenant.findUnique({ where: { id: auth.tenantId } });
  if (!tenant) return NextResponse.json({ ok: false, error: "Tenant not found." }, { status: 503 });

  const state = await db.connectorState.findUnique({ where: { id: auth.stateId } });
  const nextMeta = mergeMeta(state?.meta, {
    companyName: typeof body?.companyName === "string" ? body.companyName : null,
    version: typeof body?.version === "string" ? body.version : null,
    lastHandshakeAt: new Date().toISOString(),
  });
  await db.connectorState.update({ where: { id: auth.stateId }, data: { meta: nextMeta } });

  return NextResponse.json({ ok: true, tenant: tenant.name });
}
