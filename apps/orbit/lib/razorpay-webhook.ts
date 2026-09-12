// ─────────────────────────────────────────────────────────────
// Razorpay webhook — pure, testable helpers.
//
// Signature verification and payload parsing live here with zero DB/Next
// dependencies so they're cheap to unit test. The actual side effects
// (recordPayment, invoice/subscription writes, notify, emit) live in the
// route handler at app/api/webhooks/razorpay/route.ts, which is the only
// caller that needs a live request + database.
// ─────────────────────────────────────────────────────────────

import crypto from "node:crypto";

/**
 * Verify a Razorpay webhook signature.
 *
 * Razorpay signs the *raw* request body with HMAC-SHA256 keyed by the
 * webhook secret configured in the dashboard, hex-encoded, and sends it in
 * the `X-Razorpay-Signature` header. Verification must run against the raw
 * bytes — never a re-serialized JSON.parse(body) round-trip, which can
 * reorder keys or change whitespace and silently break the comparison.
 *
 * Uses a timing-safe comparison to avoid leaking signature bytes via
 * response-time side channels. crypto.timingSafeEqual requires equal-length
 * buffers, so a length mismatch is treated as an outright failure rather
 * than thrown.
 */
export function verifyRazorpaySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const givenBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== givenBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

export type ParsedWebhookEvent = {
  event: string;
  paymentId?: string;
  orderId?: string;
  /** Rupees (converted from Razorpay's paise). */
  amount?: number;
  notes: Record<string, string>;
};

/**
 * Defensively parse a Razorpay webhook payload.
 *
 * Expected shape (trimmed to what we use):
 *   {
 *     event: "payment.captured",
 *     payload: {
 *       payment: { entity: { id, amount, order_id, notes, ... } },
 *       order?:  { entity: { id, notes, ... } },
 *     },
 *   }
 *
 * `notes` are read from the payment entity first (that's what Razorpay
 * echoes back for a captured payment); if absent, falls back to the order
 * entity's notes. Returns null for anything that doesn't look like a real
 * Razorpay event — corrupt JSON, missing `event`, or a missing payment
 * entity (every event we care about is payment-scoped).
 */
export function parseWebhookEvent(rawBody: string): ParsedWebhookEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;

  const root = json as Record<string, unknown>;
  const event = typeof root.event === "string" ? root.event : null;
  if (!event) return null;

  const payload = isRecord(root.payload) ? root.payload : null;
  const paymentEntity = payload && isRecord(payload.payment) && isRecord(payload.payment.entity) ? payload.payment.entity : null;
  if (!paymentEntity) return null;

  const orderEntity = payload && isRecord(payload.order) && isRecord(payload.order.entity) ? payload.order.entity : null;

  const paymentId = typeof paymentEntity.id === "string" ? paymentEntity.id : undefined;
  const orderId =
    typeof paymentEntity.order_id === "string"
      ? paymentEntity.order_id
      : typeof orderEntity?.id === "string"
        ? orderEntity.id
        : undefined;

  // Razorpay amounts are always in the smallest currency unit (paise for INR).
  const amount = typeof paymentEntity.amount === "number" ? round2(paymentEntity.amount / 100) : undefined;

  const rawNotes = isRecord(paymentEntity.notes)
    ? paymentEntity.notes
    : isRecord(orderEntity?.notes)
      ? orderEntity!.notes
      : {};

  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawNotes)) {
    if (typeof v === "string") notes[k] = v;
    else if (v != null) notes[k] = String(v);
  }

  return { event, paymentId, orderId, amount, notes };
}

function isRecord(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
