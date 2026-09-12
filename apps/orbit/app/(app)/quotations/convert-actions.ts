"use server";

// Wave B — "Convert to Invoice". Deliberately kept separate from
// app/(app)/quotations/actions.ts (owned by a parallel build) so the two
// pieces of work never touch the same file.

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { notify } from "@/lib/notify";
import { inr } from "@/lib/format";
import { computeGst } from "@/lib/compliance/gst";
import { computeQuote, type LineInput } from "@/lib/quote";
import { allocateNumber } from "@/lib/studio/numbering";
import { getStudioConfig, valuesByCategory } from "@/lib/studio/config";

// Same convention as app/(app)/finance/invoices/actions.ts: tenant home state
// drives the CGST+SGST vs. IGST split.
const HOME_STATE = "Maharashtra";

export type ConvertResult = { ok: true; invoiceId: string } | { error: string };

/**
 * Convert a won Quotation into a Draft Invoice.
 *
 * ── Field mapping (documented because Invoice/InvoiceLine have no discount,
 *    charges, or adjustment columns — see prisma/schema.prisma — so the
 *    quotation's header-level amounts have to be folded into line amounts;
 *    this is the least-lossy mapping that keeps the invoice's
 *    subtotal/cgst/sgst/igst/grandTotal exactly reconcilable against the
 *    quotation's own computeQuote() total) ──
 *   - Non-optional quotation lines -> invoice lines, 1:1. Each line's
 *     per-line discountPct AND its proportional share of the header
 *     `discount` (both computed by lib/quote.ts computeQuote — the exact
 *     engine the quotation builder itself uses, reused here rather than
 *     re-implemented) are baked into the invoice line's unitPrice. The
 *     original discount % is called out in the line description so the
 *     discount is still visible on the invoice, not silently lost.
 *   - `optional: true` lines are dropped entirely — never invoiced.
 *   - Header `charges` (freight/packing/etc.) -> one extra invoice line
 *     "Charges — <chargesLabel>", taxed at `chargesTaxRate`.
 *   - `adjustment` (round-off / goodwill correction, untaxed, may be
 *     negative) -> one extra untaxed invoice line "Adjustment".
 *   - CGST/SGST/IGST split reuses lib/compliance/gst.ts computeGst — the
 *     same helper createInvoiceAction uses — fed the discount-adjusted
 *     line array above (never reimplemented).
 *   - The invoice is created as Draft and never auto-finalized: GL posting
 *     still happens only via the existing finalizeInvoiceAction flow.
 */
export async function convertQuotationToInvoiceAction(quotationId: string): Promise<ConvertResult> {
  const s = await requireSession();

  const quotation = await db.quotation.findFirst({
    where: { id: quotationId, tenantId: s.tenantId },
    include: {
      lines: { orderBy: { sortOrder: "asc" }, include: { product: true } },
      account: true,
      opportunity: { include: { account: true } },
    },
  });
  if (!quotation) return { error: "Quotation not found." };
  if (quotation.convertedInvoiceId) return { error: "Already converted to an invoice." };

  // Category, not literal "Accepted" — tenant-renamed stages must still work.
  const config = await getStudioConfig(s.tenantId);
  const wonValues = valuesByCategory(config, "quotation_stage", "won");
  if (!wonValues.includes(quotation.status)) {
    return { error: "Move stage to Accepted to convert." };
  }

  const account = quotation.account ?? quotation.opportunity?.account ?? null;
  if (!account) return { error: "Quotation has no linked account." };

  // Same totals engine the quotation builder uses: per-line discount + the
  // header discount's proportional allocation, both baked into taxableBase.
  const quoteLines: LineInput[] = quotation.lines.map((l) => ({
    qty: l.qty,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    taxRate: l.taxRate,
    optional: l.optional,
  }));
  const computed = computeQuote({
    lines: quoteLines,
    headerDiscount: quotation.discount,
    charges: quotation.charges,
    chargesTaxRate: quotation.chargesTaxRate,
    adjustment: quotation.adjustment,
  });

  type NewLine = { description: string; hsn: string | null; qty: number; unitPrice: number; taxRate: number };
  const invoiceLineInputs: NewLine[] = [];
  const gstLines: { qty: number; unitPrice: number; taxRate: number }[] = [];

  quotation.lines.forEach((l, i) => {
    if (l.optional) return;
    const c = computed.lines[i];
    const qty = l.qty > 0 ? l.qty : 1;
    // taxableBase already has the per-line discount AND this line's share of
    // the header discount subtracted — dividing back by qty gives an
    // effective, discount-inclusive unit price for the invoice line.
    const unitPrice = Math.round((c.taxableBase / qty) * 100) / 100;
    const description = l.discountPct > 0 ? `${l.description} (−${l.discountPct}% disc.)` : l.description;
    invoiceLineInputs.push({ description, hsn: l.product?.hsn ?? null, qty: l.qty, unitPrice, taxRate: l.taxRate });
    gstLines.push({ qty: l.qty, unitPrice, taxRate: l.taxRate });
  });

  if (quotation.charges > 0) {
    const label = quotation.chargesLabel?.trim() || "Additional Charges";
    invoiceLineInputs.push({ description: `Charges — ${label}`, hsn: null, qty: 1, unitPrice: quotation.charges, taxRate: quotation.chargesTaxRate });
    gstLines.push({ qty: 1, unitPrice: quotation.charges, taxRate: quotation.chargesTaxRate });
  }

  if (quotation.adjustment !== 0) {
    invoiceLineInputs.push({ description: "Adjustment", hsn: null, qty: 1, unitPrice: quotation.adjustment, taxRate: 0 });
    gstLines.push({ qty: 1, unitPrice: quotation.adjustment, taxRate: 0 });
  }

  if (invoiceLineInputs.length === 0) return { error: "Quotation has no invoiceable line items." };

  const intraState = account.state === HOME_STATE;
  let g = computeGst(gstLines, intraState);

  // The invoice line re-derives its base as qty × unitPrice from a unit price
  // that was itself rounded (taxableBase / qty → 2dp), and computeGst rounds
  // in a different order than lib/quote.ts — so the stored invoice grandTotal
  // can drift from the quotation's computeQuote() total by a paise or two
  // (B6 gate, Defect 1). Standard Indian-invoice remedy: an explicit untaxed
  // "Round-off" line carrying the exact delta, so quote and invoice reconcile
  // to the paisa instead of merely rounding to the same rupee.
  const roundOffDelta = Math.round((computed.grandTotal - g.grandTotal) * 100) / 100;
  if (roundOffDelta !== 0) {
    invoiceLineInputs.push({ description: "Round-off", hsn: null, qty: 1, unitPrice: roundOffDelta, taxRate: 0 });
    gstLines.push({ qty: 1, unitPrice: roundOffDelta, taxRate: 0 });
    g = computeGst(gstLines, intraState);
  }

  // Allocated outside the transaction (same convention as
  // app/(app)/finance/invoices/actions.ts createInvoiceAction): allocateNumber
  // is itself a single atomic UPDATE, and Orbit's numbering is documented to
  // tolerate gaps — nesting it inside an interactive $transaction risks a
  // deadlock on SQLite's single-connection driver.
  const number = await allocateNumber(s.tenantId, "invoice");

  const txResult = await db.$transaction(async (tx) => {
    // Re-check tenant + not-yet-converted INSIDE the transaction so a
    // double-click / concurrent conversion can't create two invoices.
    const fresh = await tx.quotation.findFirst({
      where: { id: quotationId, tenantId: s.tenantId, convertedInvoiceId: null },
    });
    if (!fresh) return { ok: false as const, error: "Already converted to an invoice." };

    const invoice = await tx.invoice.create({
      data: {
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
        status: "Draft", // never auto-finalized — GL posts only via finalizeInvoiceAction
        lines: {
          create: invoiceLineInputs.map((l) => ({
            description: l.description,
            hsn: l.hsn,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            lineTotal: Math.round(l.qty * l.unitPrice * 100) / 100,
          })),
        },
      },
    });

    await tx.quotation.update({ where: { id: quotationId }, data: { convertedInvoiceId: invoice.id } });

    return { ok: true as const, invoiceId: invoice.id };
  });

  if (!txResult.ok) return { error: txResult.error };

  await notify({
    tenantId: s.tenantId,
    title: "Quotation converted to invoice",
    body: `${quotation.number} converted to ${number} (${inr(g.grandTotal)}).`,
    link: `/finance/invoices/${txResult.invoiceId}`,
  });

  await emit({
    tenantId: s.tenantId,
    type: "quotation.converted",
    entity: "Quotation",
    entityId: quotationId,
    actorId: s.userId,
    payload: { note: `${quotation.number} → ${number}`, invoiceId: txResult.invoiceId, grandTotal: g.grandTotal },
  });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${quotationId}`);
  revalidatePath("/finance/invoices");
  revalidatePath(`/finance/invoices/${txResult.invoiceId}`);

  return { ok: true, invoiceId: txResult.invoiceId };
}
