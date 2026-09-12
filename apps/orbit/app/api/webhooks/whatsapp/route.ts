import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { parseDeliveryWebhook, isStatusUpgrade, verifyWebhookToken } from "@/lib/whatsapp";

// Exotel WhatsApp status-callback receiver.
//
// Auth: Exotel's status-callback webhooks aren't signed — the documented v1
// pattern (mirrors app/api/webhooks/telephony) is a shared secret appended as
// `?token=` on the callback URL you register in the Exotel dashboard,
// compared timing-safe against WHATSAPP_WEBHOOK_TOKEN.
//
// Tenant resolution: the MessageLog row (found by providerMsgId) already
// carries tenantId — there's no tenant to guess, and no row to match means
// nothing to do (ack harmlessly so Exotel doesn't retry forever).
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Same limiter as the sibling telephony webhook (D8 gate consistency finding).
  const { ok, retryAfter } = rateLimit(`wa-webhook:${clientKey(req)}`, 60, 60_000);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const expectedToken = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!expectedToken) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const url = new URL(req.url);
  const givenToken = url.searchParams.get("token") || "";
  if (!verifyWebhookToken(givenToken, expectedToken)) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    // Not parseable JSON — nothing we can act on, ack so Exotel stops retrying.
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  const parsed = parseDeliveryWebhook(json);
  if (!parsed) {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  // No unique constraint on providerMsgId (see prisma schema) — findFirst is
  // fine since it's provider-issued and effectively unique in practice.
  const log = await db.messageLog.findFirst({ where: { providerMsgId: parsed.providerMsgId } });
  if (!log) {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  if (!isStatusUpgrade(log.deliveryStatus, parsed.status)) {
    // Duplicate/out-of-order/downgrade delivery — no-op, but still 200 so the
    // provider doesn't retry a "failure" that isn't one.
    return NextResponse.json({ ok: true, idempotent: true }, { status: 200 });
  }

  const errorText = parsed.status === "failed" ? extractErrorText(json) : null;

  const updated = await db.messageLog.update({
    where: { id: log.id },
    data: {
      deliveryStatus: parsed.status,
      ...(errorText ? { error: errorText } : {}),
    },
  });

  await emit({
    tenantId: updated.tenantId,
    type: "message.status",
    entity: "MessageLog",
    entityId: updated.id,
    payload: {
      note: `${updated.toNumber} → ${parsed.status}`,
      from: log.deliveryStatus,
      to: parsed.status,
      providerMsgId: parsed.providerMsgId,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

// Best-effort extraction of a human-readable error from whatever shape the
// provider sends alongside a failure status — not part of the pure parser
// (which only promises {providerMsgId, status}) since error text isn't
// normalized/sanctioned the way deliveryStatus is.
function extractErrorText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const candidates = [raw.error, raw.error_message, raw.description, raw.reason, raw.message];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim().slice(0, 500);
  }
  return null;
}
