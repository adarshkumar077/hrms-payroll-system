import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { emit } from "@/lib/events";
import { authenticateConnector, pushErrorRing } from "@/lib/connector";

// POST /api/connector/tally/voucher-ack
//   { invoiceId, ok: true, tallyGuid? } | { invoiceId, ok: false, error }
// Success: stamps Invoice.tallyPushedAt + ConnectorState.lastVoucherPushAt, emits "tally.voucher_pushed".
// Failure: records the error in ConnectorState.meta.lastErrors (ring of 20), emits "tally.voucher_failed".
// The invoice is looked up scoped to the AUTHENTICATED tenant (never trust a tenantId in the payload —
// there isn't one here, but invoiceId alone could belong to any tenant without this scoping).

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { ok: withinLimit, retryAfter } = rateLimit(`connector:voucher-ack:${clientKey(req)}`, 30, 60_000);
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

  const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : "";
  if (!invoiceId) return NextResponse.json({ ok: false, error: "\"invoiceId\" is required." }, { status: 400 });

  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, tenantId: auth.tenantId } });
  if (!invoice) return NextResponse.json({ ok: false, error: "Invoice not found for this tenant." }, { status: 404 });

  const success = body?.ok === true;
  const now = new Date();

  if (success) {
    await db.invoice.update({ where: { id: invoice.id }, data: { tallyPushedAt: now } });
    await db.connectorState.update({ where: { id: auth.stateId }, data: { lastVoucherPushAt: now } });

    await emit({
      tenantId: auth.tenantId,
      type: "tally.voucher_pushed",
      entity: "Invoice",
      entityId: invoice.id,
      payload: {
        note: `${invoice.number} pushed to Tally`,
        tallyGuid: typeof body?.tallyGuid === "string" ? body.tallyGuid : null,
      },
    });
  } else {
    const error = typeof body?.error === "string" && body.error.trim() ? body.error.trim() : "Unknown error";
    const state = await db.connectorState.findUnique({ where: { id: auth.stateId } });
    const nextMeta = pushErrorRing(state?.meta, { invoiceId: invoice.id, error, at: now.toISOString() });
    await db.connectorState.update({ where: { id: auth.stateId }, data: { meta: nextMeta } });

    await emit({
      tenantId: auth.tenantId,
      type: "tally.voucher_failed",
      entity: "Invoice",
      entityId: invoice.id,
      payload: { note: `${invoice.number} failed to push to Tally`, error },
    });
  }

  return NextResponse.json({ ok: true });
}
