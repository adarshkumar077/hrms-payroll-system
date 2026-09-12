import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { computeLine, computeQuote, type LineInput } from "@/lib/quote";
import { PrintButton } from "../../PrintButton";

export const dynamic = "force-dynamic";

export default async function PrintQuotationPage({ params }: { params: { id: string } }) {
  const s = await requireSession();

  const quotation = await db.quotation.findFirst({
    where: { id: params.id, tenantId: s.tenantId },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      account: true,
      opportunity: { include: { account: true } },
    },
  });
  const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });

  if (!quotation) notFound();

  // Direct Quotation.accountId (Wave B) wins; falls back to the legacy
  // opportunity->account path for older rows that predate it.
  const account = quotation.account ?? quotation.opportunity?.account ?? null;

  const lineInputs: LineInput[] = quotation.lines.map((l) => ({
    qty: l.qty,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct,
    taxRate: l.taxRate,
    optional: l.optional,
  }));

  // Per-line display uses computeLine in isolation (own discount + own tax,
  // no header-discount allocation) — the header discount is shown once in
  // the totals block below, matching standard invoice/quote print convention.
  const displayLines = quotation.lines.map((l, i) => ({ line: l, computed: computeLine(lineInputs[i]) }));
  const requiredLines = displayLines.filter((d) => !d.line.optional);
  const optionalLines = displayLines.filter((d) => d.line.optional);

  // Totals block is the server-side rollup — subtotal, discounts, tax,
  // charges, adjustment, round-off, grand total — all from lib/quote.ts.
  const totals = computeQuote({
    lines: lineInputs,
    headerDiscount: quotation.discount,
    charges: quotation.charges,
    chargesTaxRate: quotation.chargesTaxRate,
    adjustment: quotation.adjustment,
  });

  const billingAddress = quotation.billingAddress || account?.address || "—";
  const shippingAddress = quotation.shippingAddress || billingAddress;

  return (
    <div className="print-root">
      <style>{`
        .print-root {
          font-family: Arial, Helvetica, sans-serif;
          color: #0f172a;
          padding: 2rem;
          background: #fff;
        }
        .print-root * { box-sizing: border-box; }
        .sheet { max-width: 850px; margin: 0 auto; }
        h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
        h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #475569; margin: 1.5rem 0 .5rem; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 6px 8px; font-size: 12px; text-align: left; }
        thead th { border-bottom: 2px solid #0f172a; text-transform: uppercase; font-size: 10px; letter-spacing: .03em; color: #475569; }
        tbody tr { border-bottom: 1px solid #e2e8f0; }
        .right { text-align: right; }
        .muted { color: #64748b; }
        .mono { font-family: "Courier New", monospace; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 1rem; margin-bottom: 1rem; }
        .meta-row { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: 2px; font-size: 12px; }
        .parties { display: flex; justify-content: space-between; gap: 2rem; margin-bottom: 1.25rem; }
        .party { flex: 1; }
        .party-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; color: #64748b; margin-bottom: 2px; }
        .address-block { white-space: pre-wrap; font-size: 12px; }
        .totals { display: flex; justify-content: flex-end; margin-top: 1rem; }
        .totals-box { width: 280px; font-size: 12.5px; }
        .totals-box div { display: flex; justify-content: space-between; padding: 3px 0; }
        .grand { border-top: 2px solid #0f172a; font-weight: bold; font-size: 15px; margin-top: 4px; padding-top: 6px !important; }
        .optional-badge { display: inline-block; font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; color: #b45309; background: #fef3c7; border-radius: 4px; padding: 1px 6px; margin-bottom: 6px; }
        .terms-block { font-size: 11.5px; white-space: pre-wrap; color: #334155; margin-bottom: 1rem; }
        .toolbar { margin-bottom: 1.5rem; }
        @media print {
          .print-root { padding: 0; }
          .no-print { display: none !important; }
          .sheet { max-width: none; }
        }
      `}</style>
      <div className="sheet">
        <div className="toolbar no-print">
          <PrintButton />
        </div>

        <div className="header">
          <div>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
              Quotation
            </div>
            <h1>{quotation.number}</h1>
            <div className="muted">
              {shortDate(quotation.createdAt)} · {quotation.status}
              {quotation.revisionNo > 0 ? ` · Rev ${quotation.revisionNo}` : ""}
            </div>
            <div className="meta-row muted">
              <span>Valid until: {quotation.validUntil ? shortDate(quotation.validUntil) : "—"}</span>
            </div>
          </div>
          <div className="right">
            <div style={{ fontWeight: 600 }}>{tenant?.name || "—"}</div>
            <div className="muted mono">GSTIN: {tenant?.gstin || "—"}</div>
          </div>
        </div>

        <div className="parties">
          <div className="party">
            <div className="party-label">From</div>
            <div style={{ fontWeight: 600 }}>{tenant?.name || "—"}</div>
            <div className="mono muted">GSTIN: {tenant?.gstin || "—"}</div>
          </div>
          <div className="party">
            <div className="party-label">Bill To</div>
            <div style={{ fontWeight: 600 }}>{account?.name || "—"}</div>
            <div className="mono muted">GSTIN: {account?.gstin || "—"}</div>
            <div className="address-block muted">{billingAddress}</div>
          </div>
          <div className="party">
            <div className="party-label">Ship To</div>
            <div style={{ fontWeight: 600 }}>{account?.name || "—"}</div>
            <div className="address-block muted">{shippingAddress}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th className="right">Qty</th>
              <th>UOM</th>
              <th className="right">Rate</th>
              <th className="right">Disc %</th>
              <th className="right">GST %</th>
              <th className="right">Tax</th>
              <th className="right">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {requiredLines.map(({ line, computed }) => (
              <tr key={line.id}>
                <td>{line.description}</td>
                <td className="right">{line.qty}</td>
                <td>{line.uom || "—"}</td>
                <td className="right">{inr(line.unitPrice)}</td>
                <td className="right">{line.discountPct > 0 ? `${line.discountPct}%` : "—"}</td>
                <td className="right">{line.taxRate}%</td>
                <td className="right">{inr(computed.taxAmt)}</td>
                <td className="right">{inr(computed.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {optionalLines.length > 0 && (
          <>
            <h2>Optional Items <span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>— not included in totals</span></h2>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="right">Qty</th>
                  <th>UOM</th>
                  <th className="right">Rate</th>
                  <th className="right">Disc %</th>
                  <th className="right">GST %</th>
                  <th className="right">Tax</th>
                  <th className="right">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {optionalLines.map(({ line, computed }) => (
                  <tr key={line.id}>
                    <td>{line.description}</td>
                    <td className="right">{line.qty}</td>
                    <td>{line.uom || "—"}</td>
                    <td className="right">{inr(line.unitPrice)}</td>
                    <td className="right">{line.discountPct > 0 ? `${line.discountPct}%` : "—"}</td>
                    <td className="right">{line.taxRate}%</td>
                    <td className="right">{inr(computed.preview?.taxAmt ?? 0)}</td>
                    <td className="right">{inr(computed.preview?.total ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="totals">
          <div className="totals-box">
            <div>
              <span className="muted">Subtotal</span>
              <span>{inr(totals.subtotal)}</span>
            </div>
            {totals.lineDiscountTotal > 0 && (
              <div>
                <span className="muted">Line Discounts</span>
                <span>-{inr(totals.lineDiscountTotal)}</span>
              </div>
            )}
            {totals.headerDiscount > 0 && (
              <div>
                <span className="muted">Discount</span>
                <span>-{inr(totals.headerDiscount)}</span>
              </div>
            )}
            <div>
              <span className="muted">Tax</span>
              <span>{inr(totals.taxTotal)}</span>
            </div>
            {totals.chargesTotal > 0 && (
              <div>
                <span className="muted">{quotation.chargesLabel || "Charges"}</span>
                <span>{inr(totals.chargesTotal + totals.chargesTax)}</span>
              </div>
            )}
            {totals.adjustment !== 0 && (
              <div>
                <span className="muted">Adjustment</span>
                <span>{inr(totals.adjustment)}</span>
              </div>
            )}
            {totals.roundOff !== 0 && (
              <div>
                <span className="muted">Round Off</span>
                <span>{inr(totals.roundOff)}</span>
              </div>
            )}
            <div className="grand">
              <span>Grand Total</span>
              <span>{inr(totals.grandTotal)}</span>
            </div>
          </div>
        </div>

        {quotation.termsText && (
          <>
            <h2>Terms & Conditions</h2>
            <div className="terms-block">{quotation.termsText}</div>
          </>
        )}

        {quotation.paymentTermsText && (
          <>
            <h2>Payment Terms</h2>
            <div className="terms-block">{quotation.paymentTermsText}</div>
          </>
        )}

        <p className="muted" style={{ fontSize: 11, marginTop: "2rem" }}>
          This quotation is valid subject to mutual agreement. Computer-generated document.
        </p>
      </div>
    </div>
  );
}
