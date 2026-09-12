// ─────────────────────────────────────────────────────────────
// Pluggable payments adapter (Razorpay).
//
// Same graceful-degradation law as lib/irp.ts / lib/notify.ts / lib/ai.ts:
//   • If real Razorpay keys are configured via env, `createRazorpayOrder`
//     POSTs to the live Razorpay Orders API. { mode: "live" }.
//   • Otherwise it returns a deterministic MOCK order id so the app never
//     breaks in dev / demos. { mode: "mock" }.
//
// `recordPayment` is provider-agnostic: it just writes a Payment row with a
// generated receipt number. It's what both the "Record payment" (manual) flow
// and the verified Razorpay webhook (app/api/webhooks/razorpay/route.ts) call.
//
// Slotting in real creds: fill `.env.payments.example` values into `.env` —
// nothing else needs to change. See `PAYMENTS_SETUP_DOC` below.
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";

/**
 * True only when both Razorpay keys are present. Billing / checkout UI gates on
 * this to decide between the live order call and the manual/mock fallback.
 */
export const razorpayConfigured: boolean = Boolean(
  process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
);

export type PaymentMethod = "Manual" | "UPI" | "Razorpay" | "NEFT" | "Cash";

export type CreateOrderResult = {
  orderId: string;
  amount: number; // in paise (Razorpay's unit)
  currency: string;
  keyId?: string; // public key id — safe to hand to the checkout widget
  mode: "live" | "mock";
};

// ── Record a payment ──────────────────────────────────────────

/**
 * Create a Payment row for an invoice with a generated tenant-scoped receipt
 * number (atomic NumberFormat sequence — safe under concurrent payments).
 * Provider-agnostic — the caller decides the method/reference. Returns the
 * created Payment.
 */
export async function recordPayment(params: {
  tenantId: string;
  invoiceId?: string | null;
  amount: number;
  method?: PaymentMethod;
  reference?: string | null;
  provider?: string | null;
}) {
  const { allocateNumber } = await import("@/lib/studio/numbering");
  const receiptNo = await allocateNumber(params.tenantId, "receipt");

  return db.payment.create({
    data: {
      tenantId: params.tenantId,
      invoiceId: params.invoiceId ?? null,
      amount: params.amount,
      method: params.method ?? "Manual",
      reference: params.reference ?? null,
      receiptNo,
      status: "Success",
      provider: params.provider ?? null,
    },
  });
}

// ── Create a Razorpay order ───────────────────────────────────

/**
 * Create a payment order.
 *
 * Live path (when `razorpayConfigured`): POSTs to the Razorpay Orders API with
 * HTTP Basic auth (`key_id:key_secret`). Razorpay works in paise, so the rupee
 * `amount` is converted here.
 *
 * IMPORTANT — the verified webhook lives at app/api/webhooks/razorpay/route.ts
 * (signature check in lib/razorpay-webhook.ts). It is the ONLY place allowed
 * to call `recordPayment(...)` / mark an invoice Paid / activate a plan for a
 * live order — never do so from the client-side checkout callback. Dispatch
 * there is keyed off the `notes.kind` passed to this function's `opts.notes`:
 * callers MUST set `{ kind: "invoice", tenantId, invoiceId }` for an invoice
 * checkout order, or `{ kind: "plan", tenantId, plan }` for a plan-upgrade
 * order (see app/(app)/billing/actions.ts). Orders with no recognized `kind`
 * are acknowledged and ignored by the webhook, never acted on.
 *
 * Any failure falls back to a deterministic mock order so nothing breaks.
 */
export async function createRazorpayOrder(
  amount: number,
  opts?: { currency?: string; receipt?: string; notes?: Record<string, string> },
): Promise<CreateOrderResult> {
  const currency = opts?.currency ?? "INR";
  const amountPaise = Math.round(amount * 100);

  if (razorpayConfigured) {
    try {
      const auth = Buffer.from(
        `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`,
      ).toString("base64");

      const res = await fetch("https://api.razorpay.com/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency,
          receipt: opts?.receipt,
          notes: opts?.notes,
        }),
        // Fail fast rather than hang the calling server action.
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) throw new Error(`Razorpay HTTP ${res.status}`);

      const json = (await res.json()) as { id?: string; amount?: number; currency?: string };
      if (!json.id) throw new Error("Razorpay response missing order id");

      return {
        orderId: json.id,
        amount: json.amount ?? amountPaise,
        currency: json.currency ?? currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        mode: "live",
      };
    } catch (err) {
      // Never break the caller: log + fall back to the deterministic mock.
      console.error("[payments] live Razorpay order failed, falling back to mock:", err);
    }
  }

  return mockOrder(amountPaise, currency);
}

/** Deterministic mock order — mirrors Razorpay's `order_<id>` shape. */
function mockOrder(amountPaise: number, currency: string): CreateOrderResult {
  const rand = Math.random().toString(36).slice(2, 16).padEnd(14, "0");
  return {
    orderId: `order_MOCK${rand}`,
    amount: amountPaise,
    currency,
    keyId: undefined,
    mode: "mock",
  };
}

// ─────────────────────────────────────────────────────────────
// Setup documentation — surfaced in the billing UI hint and for operators.
// ─────────────────────────────────────────────────────────────
export const PAYMENTS_SETUP_DOC = `Orbit payments — go live with Razorpay

Orbit records payments against invoices and can create Razorpay orders for
online collection. With no keys set, Orbit runs in MANUAL mode: payments are
recorded directly (Manual / UPI / NEFT / Cash) and plan upgrades apply
immediately — a deterministic mock order id stands in for Razorpay.

To go live, set these in your .env (see .env.payments.example):

  RAZORPAY_KEY_ID       Public key id  (rzp_test_* for sandbox, rzp_live_* for prod)
  RAZORPAY_KEY_SECRET   Key secret     (server-only — never ship to the browser)
  RAZORPAY_WEBHOOK_SECRET  HMAC secret for verifying webhooks — required for the
                           webhook to activate anything; without it the endpoint
                           returns 503 and no order is ever settled automatically.

Where to get keys:
  1. Sign up at https://dashboard.razorpay.com and switch to Test Mode.
  2. Settings → API Keys → Generate Test Key → copy the Key Id + Key Secret.
  3. Settings → Webhooks → add https://<your-host>/api/webhooks/razorpay,
     subscribe to "payment.captured", and copy the signing secret into
     RAZORPAY_WEBHOOK_SECRET.

Production note: creating an order is only step 1. The customer's payment is
only ever recorded / the invoice marked Paid / the plan activated by the
verified webhook at app/api/webhooks/razorpay/route.ts (signature check in
lib/razorpay-webhook.ts) — never trust the client-side checkout callback for
that. See the comment on createRazorpayOrder() in lib/payments.ts for the
notes.kind contract the webhook dispatches on.`;
