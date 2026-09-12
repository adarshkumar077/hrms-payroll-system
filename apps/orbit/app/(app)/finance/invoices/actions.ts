"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedDb } from "@/lib/tenantDb";
import { emit } from "@/lib/events";
import { notify } from "@/lib/notify";
import { recordPayment, createRazorpayOrder, type PaymentMethod } from "@/lib/payments";
import { inr } from "@/lib/format";
import { computeGst, requiresEInvoice } from "@/lib/compliance/gst";
import { generateEInvoice } from "@/lib/irp";
import { postInvoiceJournal, postPaymentJournal } from "@/lib/gl";
import { allocateNumber } from "@/lib/studio/numbering";
import { can } from "@/lib/rbac";

// Tenant home state = GSTIN state code "27" = Maharashtra. Intra-state supply
// (CGST+SGST) when the buyer is in the same state; otherwise inter-state (IGST).
const HOME_STATE = "Maharashtra";
const EWAY_THRESHOLD = 50000; // ₹50k — e-way bill required above this value

// ── Create a GST invoice from an account + product + qty ──
export async function createInvoiceAction(formData: FormData) {
  const s = await requireSession();
  const tdb = scopedDb(s.tenantId);

  const accountId = String(formData.get("accountId") || "");
  const productId = String(formData.get("productId") || "");
  const qty = Math.max(1, Number(formData.get("qty") || 1));
  if (!accountId || !productId) return;

  const [account, product] = await Promise.all([
    tdb.account.findFirst({ where: { id: accountId } }),
    tdb.product.findFirst({ where: { id: productId } }),
  ]);
  if (!account || !product) return;

  const intraState = account.state === HOME_STATE;
  const g = computeGst([{ qty, unitPrice: product.unitPrice, taxRate: product.taxRate }], intraState);

  // Atomic tenant-scoped invoice number (NumberFormat.nextSeq — safe under
  // concurrent creates; seeded above any legacy INV-* numbers on first use).
  const number = await allocateNumber(s.tenantId, "invoice");

  const invoice = await tdb.invoice.create({
    data: {
      // scopedDb also injects tenantId at runtime; kept here so the create input type-checks.
      tenantId: s.tenantId,
      accountId: account.id,
      number,
      invoiceType: "B2B",
      placeOfSupply: account.state,
      subtotal: g.subtotal,
      cgst: g.cgst,
      sgst: g.sgst,
      igst: g.igst,
      grandTotal: g.grandTotal,
      status: "Draft",
      lines: {
        create: {
          description: product.name,
          hsn: product.hsn,
          qty,
          unitPrice: product.unitPrice,
          taxRate: product.taxRate,
          lineTotal: g.subtotal,
        },
      },
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "invoice.created",
    entity: "Invoice",
    entityId: invoice.id,
    actorId: s.userId,
    payload: { note: `${number} → ${account.name}`, grandTotal: g.grandTotal, intraState },
  });

  revalidatePath("/finance/invoices");
}

// ── Finalize: lock the invoice and (if mandated) generate IRN / Ack / e-way bill ──
export async function finalizeInvoiceAction(invoiceId: string) {
  const s = await requireSession();
  const tdb = scopedDb(s.tenantId);
  const invoice = await tdb.invoice.findFirst({
    where: { id: invoiceId },
    include: { account: true, lines: true },
  });
  if (!invoice || invoice.status !== "Draft") return;

  const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
  if (!tenant) return;

  const data: {
    status: string;
    irn?: string;
    ackNo?: string;
    ewayBillNo?: string;
  } = { status: "Finalized" };

  let mode: "live" | "mock" | null = null;

  // e-invoicing is mandatory for AATO > ₹5cr on B2B supplies. Generate the IRN via
  // the pluggable IRP adapter — real GSP/IRP creds → live; otherwise deterministic mock.
  if (requiresEInvoice(tenant.aato, invoice.invoiceType)) {
    const ei = await generateEInvoice({
      invoice,
      tenant: { name: tenant.name, gstin: tenant.gstin },
      buyerAccount: {
        name: invoice.account?.name ?? "—",
        gstin: invoice.account?.gstin ?? null,
        address: invoice.account?.address ?? null,
        city: invoice.account?.city ?? null,
        state: invoice.account?.state ?? null,
      },
      lines: invoice.lines,
    });

    data.irn = ei.irn;
    data.ackNo = ei.ackNo;
    mode = ei.mode;
    // Prefer the IRP-returned e-way bill; else generate one when above threshold.
    if (ei.ewayBillNo) {
      data.ewayBillNo = ei.ewayBillNo;
    } else if (invoice.grandTotal > EWAY_THRESHOLD) {
      data.ewayBillNo = String(3_000_000_000_00 + (Math.abs(hash(invoice.number + "eway")) % 99_999_999_999));
    }
  }

  await tdb.invoice.update({ where: { id: invoice.id }, data });

  // GL auto-posting is additive and must never break invoice finalization.
  try {
    await postInvoiceJournal(s.tenantId, {
      number: invoice.number,
      subtotal: invoice.subtotal,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      grandTotal: invoice.grandTotal,
    });
  } catch (err) {
    console.error("postInvoiceJournal failed", err);
  }

  await emit({
    tenantId: s.tenantId,
    type: "invoice.finalized",
    entity: "Invoice",
    entityId: invoice.id,
    actorId: s.userId,
    payload: {
      note: `${invoice.number} finalized${data.irn ? " with IRN" : ""}`,
      irn: data.irn ?? null,
      ackNo: data.ackNo ?? null,
      ewayBillNo: data.ewayBillNo ?? null,
      mode,
    },
  });

  revalidatePath("/finance/invoices");
  revalidatePath(`/finance/invoices/${invoice.id}`);
}

// ── Mark a finalized invoice as Paid ──
export async function markPaidAction(invoiceId: string) {
  const s = await requireSession();
  const tdb = scopedDb(s.tenantId);
  const invoice = await tdb.invoice.findFirst({ where: { id: invoiceId } });
  if (!invoice || invoice.status === "Paid") return;

  await tdb.invoice.update({ where: { id: invoice.id }, data: { status: "Paid" } });

  await emit({
    tenantId: s.tenantId,
    type: "invoice.paid",
    entity: "Invoice",
    entityId: invoice.id,
    actorId: s.userId,
    payload: { note: `${invoice.number} marked paid`, grandTotal: invoice.grandTotal },
  });

  revalidatePath("/finance/invoices");
  revalidatePath(`/finance/invoices/${invoice.id}`);
}

// ── Record a payment against a finalized invoice → settle it ──
// Writes a Payment row (with a receipt no.), flips the invoice to Paid,
// notifies the tenant, and emits payment.recorded. Existing markPaidAction
// stays for the no-receipt "just mark it" path.
const PAYMENT_METHODS: PaymentMethod[] = ["Manual", "UPI", "Razorpay", "NEFT", "Cash"];

export async function recordPaymentAction(formData: FormData) {
  const s = await requireSession();
  const tdb = scopedDb(s.tenantId);

  const invoiceId = String(formData.get("invoiceId") || "");
  if (!invoiceId) return;

  const invoice = await tdb.invoice.findFirst({ where: { id: invoiceId } });
  // Only settle a finalized (locked) invoice that isn't already paid.
  if (!invoice || invoice.status !== "Finalized") return;

  const rawMethod = String(formData.get("method") || "Manual") as PaymentMethod;
  const method = PAYMENT_METHODS.includes(rawMethod) ? rawMethod : "Manual";
  const reference = String(formData.get("reference") || "").trim() || null;
  // Default to the full invoice amount; allow an explicit override.
  const rawAmount = Number(formData.get("amount"));
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : invoice.grandTotal;

  const payment = await recordPayment({
    tenantId: s.tenantId,
    invoiceId: invoice.id,
    amount,
    method,
    reference,
  });

  await tdb.invoice.update({ where: { id: invoice.id }, data: { status: "Paid" } });

  // GL auto-posting is additive and must never break payment recording.
  try {
    await postPaymentJournal(s.tenantId, { receiptNo: payment.receiptNo, amount, method });
  } catch (err) {
    console.error("postPaymentJournal failed", err);
  }

  await notify({
    tenantId: s.tenantId,
    title: "Payment received",
    body: `${inr(amount)} received for ${invoice.number} (${method}) — receipt ${payment.receiptNo}.`,
    link: `/finance/invoices/${invoice.id}`,
  });

  await emit({
    tenantId: s.tenantId,
    type: "payment.recorded",
    entity: "Payment",
    entityId: payment.id,
    actorId: s.userId,
    payload: {
      note: `${payment.receiptNo} · ${invoice.number}`,
      invoiceId: invoice.id,
      amount,
      method,
      receiptNo: payment.receiptNo,
    },
  });

  revalidatePath("/finance/invoices");
  revalidatePath(`/finance/invoices/${invoice.id}`);
}

// ── Create a Razorpay order to collect an outstanding balance online ──
// Client-side checkout only ever gets an order id to hand to the Razorpay
// widget; the invoice is settled exclusively by the verified webhook at
// app/api/webhooks/razorpay/route.ts (dispatch on notes.kind === "invoice").
// This action never writes a Payment row or touches invoice.status.
export type InvoiceOrderResult =
  | {
      ok: true;
      orderId: string;
      amountPaise: number;
      currency: string;
      keyId?: string;
      mode: "live" | "mock";
      remainder: number;
    }
  | { ok: false; error: string };

export async function createInvoiceOrderAction(invoiceId: string): Promise<InvoiceOrderResult> {
  const s = await requireSession();
  if (!(await can(s, "finance", "write"))) return { ok: false, error: "Not authorized" };

  const tdb = scopedDb(s.tenantId);
  const invoice = await tdb.invoice.findFirst({ where: { id: invoiceId } });
  if (!invoice) return { ok: false, error: "Invoice not found" };

  if (invoice.status === "Draft") return { ok: false, error: "Finalize first" };
  if (invoice.status === "Paid") return { ok: false, error: "Already paid" };

  // Partial-payment aware: subtract any previously successful payments
  // recorded against this invoice (manual or Razorpay) from the grand total.
  const paid = await db.payment.aggregate({
    where: { tenantId: s.tenantId, invoiceId: invoice.id, status: "Success" },
    _sum: { amount: true },
  });
  const alreadyPaid = paid._sum.amount ?? 0;
  const remainder = invoice.grandTotal - alreadyPaid;

  if (remainder <= 0) return { ok: false, error: "Already fully paid" };

  const order = await createRazorpayOrder(remainder, {
    receipt: invoice.number,
    notes: { kind: "invoice", tenantId: s.tenantId, invoiceId: invoice.id },
  });

  return {
    ok: true,
    orderId: order.orderId,
    amountPaise: order.amount,
    currency: order.currency,
    keyId: order.keyId,
    mode: order.mode,
    remainder,
  };
}

// Small deterministic hash for mock Ack / e-way numbers.
function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return h;
}
