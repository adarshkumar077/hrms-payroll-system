import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordPayment } from "@/lib/payments";
import { postPaymentJournal } from "@/lib/gl";
import { notify } from "@/lib/notify";
import { emit } from "@/lib/events";
import { inr } from "@/lib/format";
import { PLANS, type PlanId } from "@/lib/billing";
import { verifyRazorpaySignature, parseWebhookEvent, type ParsedWebhookEvent } from "@/lib/razorpay-webhook";

// The verified Razorpay webhook — the thing that makes billing real.
//
// Razorpay Checkout only ever hands the *client* an order id; trusting the
// browser to tell us "the payment succeeded" would let anyone mark an
// invoice paid or activate a plan for free. This endpoint is the only place
// that's allowed to do either, and only after verifying the HMAC-SHA256
// signature Razorpay computes over the raw webhook body.
//
// Dispatch is keyed off `notes.kind`, set when the order was created:
//   • billing/actions.ts  → { kind: "plan",    tenantId, plan }
//   • finance invoice checkout (future) → { kind: "invoice", tenantId, invoiceId }
// Anything else (missing secret, bad signature, non-capture event, unknown
// kind) is acknowledged harmlessly so Razorpay doesn't retry forever on
// something we'll never be able to handle.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Signature verification MUST run against the exact raw bytes Razorpay
  // signed — read text() first and never JSON.parse-then-reserialize before
  // comparing.
  const rawBody = await req.text();

  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const signature = req.headers.get("x-razorpay-signature") || "";
  if (!verifyRazorpaySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const parsed = parseWebhookEvent(rawBody);
  if (!parsed || parsed.event !== "payment.captured") {
    // Not a shape/event we handle — ack so Razorpay stops retrying.
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  try {
    switch (parsed.notes.kind) {
      case "invoice":
        return await handleInvoicePayment(parsed);
      case "plan":
        return await handlePlanActivation(parsed);
      default:
        // Unknown/missing kind — nothing to do, and nothing sensitive to log.
        return NextResponse.json({ ignored: true }, { status: 200 });
    }
  } catch (err) {
    // Genuine failure (DB down, etc.) → 500 so Razorpay retries the webhook.
    console.error("[razorpay-webhook] handler failed:", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

// ── kind: "invoice" — settle an invoice, mirroring recordPaymentAction in
// app/(app)/finance/invoices/actions.ts (Payment row + receipt, invoice →
// Paid, GL payment journal, notify, emit "payment.recorded"). ──
async function handleInvoicePayment(event: ParsedWebhookEvent) {
  const { tenantId, invoiceId } = event.notes;
  if (!tenantId || !invoiceId) return NextResponse.json({ ignored: true }, { status: 200 });

  const invoice = await db.invoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!invoice) return NextResponse.json({ ignored: true }, { status: 200 });

  if (invoice.status === "Paid") {
    // Razorpay may retry the same webhook — settling twice must be a no-op.
    return NextResponse.json({ ok: true, idempotent: true }, { status: 200 });
  }

  const amount = event.amount && event.amount > 0 ? event.amount : invoice.grandTotal;

  const payment = await recordPayment({
    tenantId,
    invoiceId: invoice.id,
    amount,
    method: "Razorpay",
    reference: event.paymentId ?? null,
    provider: "razorpay",
  });

  await db.invoice.update({ where: { id: invoice.id }, data: { status: "Paid" } });

  // GL auto-posting is additive and must never break payment settlement.
  try {
    await postPaymentJournal(tenantId, { receiptNo: payment.receiptNo, amount, method: "Razorpay" });
  } catch (err) {
    console.error("[razorpay-webhook] postPaymentJournal failed", err);
  }

  await notify({
    tenantId,
    title: "Payment received",
    body: `${inr(amount)} received for ${invoice.number} (Razorpay) — receipt ${payment.receiptNo}.`,
    link: `/finance/invoices/${invoice.id}`,
  });

  await emit({
    tenantId,
    type: "payment.recorded",
    entity: "Payment",
    entityId: payment.id,
    payload: {
      note: `${payment.receiptNo} · ${invoice.number}`,
      invoiceId: invoice.id,
      amount,
      method: "Razorpay",
      receiptNo: payment.receiptNo,
      source: "webhook",
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}

// ── kind: "plan" — activate the paid plan, mirroring the manual branch of
// upgradePlanAction in app/(app)/billing/actions.ts (Subscription + Tenant
// update, notify, emit "billing.plan.activated"). ──
async function handlePlanActivation(event: ParsedWebhookEvent) {
  const { tenantId, plan } = event.notes;
  if (!tenantId || !plan || !(plan in PLANS)) return NextResponse.json({ ignored: true }, { status: 200 });

  const planDef = PLANS[plan as PlanId];

  // Never trust the amount for plan activation beyond a sanity floor — a
  // captured payment below the plan's price doesn't activate anything.
  if (typeof event.amount !== "number" || event.amount < planDef.priceMonthly) {
    await notify({
      tenantId,
      title: "Underpaid order — plan not activated",
      body: `Received ${event.amount != null ? inr(event.amount) : "an unrecognized amount"} for the ${planDef.name} plan (${inr(planDef.priceMonthly)}/mo expected). The plan was not activated.`,
      link: "/billing",
    });
    return NextResponse.json({ ignored: true }, { status: 200 });
  }

  const sub = await db.subscription.upsert({
    where: { tenantId },
    update: { plan, seats: planDef.seats, status: "active", provider: "razorpay", providerRef: event.orderId ?? null },
    create: { tenantId, plan, seats: planDef.seats, status: "active", provider: "razorpay", providerRef: event.orderId ?? null },
  });

  // Keep the denormalized copy on Tenant in sync (schema carries plan/seats too).
  await db.tenant.update({ where: { id: tenantId }, data: { plan, seats: planDef.seats } }).catch(() => {});

  await notify({
    tenantId,
    title: "Plan activated",
    body: `Your workspace is now on the ${planDef.name} plan (${planDef.seats} seats, ${inr(planDef.priceMonthly)}/mo).`,
    link: "/billing",
  });

  await emit({
    tenantId,
    type: "billing.plan.activated",
    entity: "Subscription",
    entityId: sub.id,
    payload: {
      note: `Activated ${planDef.name} via Razorpay`,
      plan,
      seats: planDef.seats,
      paymentId: event.paymentId ?? null,
      orderId: event.orderId ?? null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
