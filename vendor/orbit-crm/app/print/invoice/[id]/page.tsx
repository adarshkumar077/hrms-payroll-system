import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PrintButton } from "../../PrintButton";

export const dynamic = "force-dynamic";

export default async function PrintInvoicePage({ params }: { params: { id: string } }) {
  const s = await requireSession();

  const [invoice, tenant] = await Promise.all([
    db.invoice.findFirst({
      where: { id: params.id, tenantId: s.tenantId },
      include: { account: true, lines: true },
    }),
    db.tenant.findUnique({ where: { id: s.tenantId } }),
  ]);

  if (!invoice) notFound();

  const intra = invoice.igst === 0;

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
          .sheet { max-width: 800px; margin: 0 auto; }
          h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 6px 8px; font-size: 12.5px; text-align: left; }
          thead th { border-bottom: 2px solid #0f172a; text-transform: uppercase; font-size: 10.5px; letter-spacing: .03em; color: #475569; }
          tbody tr { border-bottom: 1px solid #e2e8f0; }
          .right { text-align: right; }
          .muted { color: #64748b; }
          .mono { font-family: "Courier New", monospace; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 1rem; margin-bottom: 1rem; }
          .parties { display: flex; justify-content: space-between; gap: 2rem; margin-bottom: 1.25rem; }
          .party { flex: 1; }
          .party-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; color: #64748b; margin-bottom: 2px; }
          .totals { display: flex; justify-content: flex-end; margin-top: 1rem; }
          .totals-box { width: 260px; font-size: 13px; }
          .totals-box div { display: flex; justify-content: space-between; padding: 3px 0; }
          .grand { border-top: 2px solid #0f172a; font-weight: bold; font-size: 15px; margin-top: 4px; padding-top: 6px !important; }
          .irn-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: .75rem 1rem; margin: 1rem 0; font-size: 12px; }
          .irn-box .k { color: #64748b; font-size: 10px; text-transform: uppercase; }
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
                Tax Invoice
              </div>
              <h1>{invoice.number}</h1>
              <div className="muted">
                {shortDate(invoice.createdAt)} · {invoice.invoiceType}
              </div>
            </div>
            <div className="right">
              <div style={{ fontWeight: 600 }}>{tenant?.name || "—"}</div>
              <div className="muted mono">GSTIN: {tenant?.gstin || "—"}</div>
            </div>
          </div>

          <div className="parties">
            <div className="party">
              <div className="party-label">Seller</div>
              <div style={{ fontWeight: 600 }}>{tenant?.name || "—"}</div>
              <div className="mono muted">GSTIN: {tenant?.gstin || "—"}</div>
            </div>
            <div className="party">
              <div className="party-label">Buyer</div>
              <div style={{ fontWeight: 600 }}>{invoice.account?.name || "—"}</div>
              <div className="mono muted">GSTIN: {invoice.account?.gstin || "—"}</div>
              <div className="muted">Place of supply: {invoice.placeOfSupply || "—"}</div>
            </div>
          </div>

          {invoice.irn && (
            <div className="irn-box">
              <div style={{ fontWeight: 600, marginBottom: 6 }}>e-Invoice (IRP)</div>
              <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                <div>
                  <div className="k">IRN</div>
                  <div className="mono" style={{ wordBreak: "break-all" }}>{invoice.irn}</div>
                </div>
                <div>
                  <div className="k">Ack No.</div>
                  <div className="mono">{invoice.ackNo || "—"}</div>
                </div>
                <div>
                  <div className="k">e-Way Bill No.</div>
                  <div className="mono">{invoice.ewayBillNo || "—"}</div>
                </div>
              </div>
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>HSN</th>
                <th className="right">Qty</th>
                <th className="right">Rate</th>
                <th className="right">GST %</th>
                <th className="right">Taxable Value</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className="mono muted">{l.hsn || "—"}</td>
                  <td className="right">{l.qty}</td>
                  <td className="right">{inr(l.unitPrice)}</td>
                  <td className="right">{l.taxRate}%</td>
                  <td className="right">{inr(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="totals">
            <div className="totals-box">
              <div>
                <span className="muted">Taxable value</span>
                <span>{inr(invoice.subtotal)}</span>
              </div>
              {intra ? (
                <>
                  <div>
                    <span className="muted">CGST</span>
                    <span>{inr(invoice.cgst)}</span>
                  </div>
                  <div>
                    <span className="muted">SGST</span>
                    <span>{inr(invoice.sgst)}</span>
                  </div>
                </>
              ) : (
                <div>
                  <span className="muted">IGST</span>
                  <span>{inr(invoice.igst)}</span>
                </div>
              )}
              <div className="grand">
                <span>Grand Total</span>
                <span>{inr(invoice.grandTotal)}</span>
              </div>
            </div>
          </div>

          <p className="muted" style={{ fontSize: 11, marginTop: "2rem" }}>
            {intra ? "Intra-state supply (CGST + SGST)" : "Inter-state supply (IGST)"} · Computer-generated invoice.
          </p>
        </div>
    </div>
  );
}
