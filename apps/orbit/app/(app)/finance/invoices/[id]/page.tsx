import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui";
import { inr, shortDate } from "@/lib/format";
import { requiresEInvoice } from "@/lib/compliance/gst";
import { irpConfigured } from "@/lib/irp";
import { InvoiceActions } from "../InvoiceActions";
import { CollectOnline } from "../CollectOnline";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  Draft: "slate",
  Finalized: "blue",
  Paid: "green",
};

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;

  const [invoice, tenant] = await Promise.all([
    db.invoice.findFirst({
      where: { id: params.id, tenantId: s.tenantId },
      include: { account: true, lines: true },
    }),
    db.tenant.findUnique({ where: { id: s.tenantId } }),
  ]);

  if (!invoice) notFound();

  // Payments recorded against this invoice (most recent first).
  const payments = await db.payment.findMany({
    where: { tenantId: s.tenantId, invoiceId: invoice.id },
    orderBy: { createdAt: "desc" },
  });

  const intra = invoice.igst === 0;
  const tax = invoice.cgst + invoice.sgst + invoice.igst;
  const eInvoiceMandated = requiresEInvoice(tenant?.aato ?? 0, invoice.invoiceType);

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/finance/invoices" className="text-sm text-brand-700 hover:underline">
          ← All invoices
        </Link>
        <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
      </div>

      {/* Compliance banner */}
      <div
        className={`mb-4 rounded-md border px-4 py-2.5 text-sm ${
          eInvoiceMandated
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        {eInvoiceMandated ? (
          <>
            <span className="font-semibold">e-Invoicing required.</span> AATO {inr(tenant?.aato ?? 0)} exceeds ₹5cr —
            this B2B invoice must be registered on the IRP for a valid IRN.
          </>
        ) : (
          <>
            <span className="font-semibold">e-Invoicing not required.</span> AATO {inr(tenant?.aato ?? 0)} is within the
            ₹5cr threshold — IRN is optional for this invoice.
          </>
        )}
      </div>

      <div className="card overflow-hidden">
        {/* Invoice header */}
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Tax Invoice</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{invoice.number}</div>
            <div className="mt-1 text-sm text-slate-500">
              {shortDate(invoice.createdAt)} · {invoice.invoiceType}
            </div>
          </div>
          <div className="text-right">
            <Badge tone={statusTone[invoice.status] || "slate"}>{invoice.status}</Badge>
            {invoice.irn && (
              <div className="mt-2">
                <Badge tone="green">IRN ✓</Badge>
              </div>
            )}
          </div>
        </div>

        {/* Seller / Buyer */}
        <div className="grid grid-cols-1 gap-6 border-b border-slate-200 p-6 md:grid-cols-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Seller</div>
            <div className="mt-1 font-semibold text-slate-900">{tenant?.name || "—"}</div>
            <div className="text-sm text-slate-600">
              GSTIN: <span className="font-mono">{tenant?.gstin || "—"}</span>
            </div>
            <div className="text-sm text-slate-500">State: Maharashtra (27)</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Buyer</div>
            <div className="mt-1 font-semibold text-slate-900">{invoice.account?.name || "—"}</div>
            <div className="text-sm text-slate-600">
              GSTIN: <span className="font-mono">{invoice.account?.gstin || "—"}</span>
            </div>
            <div className="text-sm text-slate-500">Place of supply: {invoice.placeOfSupply || "—"}</div>
          </div>
        </div>

        {/* e-Invoice (IRP) box */}
        {invoice.irn && (
          <div className="border-b border-slate-200 bg-emerald-50/50 p-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-emerald-800">e-Invoice (IRP)</span>
              <Badge tone="green">Registered</Badge>
              {/* How the IRN was generated: real IRP call vs. deterministic sandbox mock. */}
              {irpConfigured ? (
                <Badge tone="blue">Live (IRP)</Badge>
              ) : (
                <Badge tone="slate">Sandbox / Mock</Badge>
              )}
            </div>
            {!irpConfigured && (
              <p className="mb-2 text-xs text-slate-500">
                Using a deterministic sandbox IRN. Set <span className="font-mono">IRP_*</span> credentials in{" "}
                <span className="font-mono">.env</span> (see <span className="font-mono">.env.irp.example</span>) to
                register on the live IRP.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">IRN</div>
                <div className="mt-0.5 break-all font-mono text-xs text-slate-700">{invoice.irn}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">Ack No.</div>
                <div className="mt-0.5 font-mono text-slate-700">{invoice.ackNo || "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400">e-Way Bill No.</div>
                <div className="mt-0.5 font-mono text-slate-700">{invoice.ewayBillNo || "— (≤ ₹50k)"}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-emerald-700">
              Registered on the Invoice Registration Portal. Auto-populates GSTR-1 and e-way bill Part-A — no manual
              filing or Tally export needed.
            </p>
          </div>
        )}

        {/* Online collection (Razorpay) — only while the invoice is finalized and unpaid */}
        {invoice.status === "Finalized" && (
          <div className="border-b border-slate-200 p-6">
            <CollectOnline invoiceId={invoice.id} number={invoice.number} />
          </div>
        )}

        {/* Payments / receipts */}
        {payments.length > 0 && (
          <div className="border-b border-slate-200 bg-emerald-50/40 p-6">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-emerald-800">Payments</span>
              <Badge tone="green">{payments.length} received</Badge>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-1 font-medium">Receipt No.</th>
                  <th className="pb-1 font-medium">Date</th>
                  <th className="pb-1 font-medium">Method</th>
                  <th className="pb-1 font-medium">Reference</th>
                  <th className="pb-1 text-right font-medium">Amount</th>
                  <th className="pb-1 text-right font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-emerald-100">
                    <td className="py-1.5 font-mono text-slate-700">{p.receiptNo}</td>
                    <td className="py-1.5 text-slate-600">{shortDate(p.createdAt)}</td>
                    <td className="py-1.5 text-slate-600">{p.method}</td>
                    <td className="py-1.5 font-mono text-slate-500">{p.reference || "—"}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-800">{inr(p.amount)}</td>
                    <td className="py-1.5 text-right">
                      {/* Print receipt route may be provided by another agent. */}
                      <Link
                        href={`/print/invoice/${invoice.id}`}
                        className="text-xs text-brand-700 hover:underline"
                      >
                        View receipt
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Line items */}
        <div className="overflow-x-auto p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 font-medium">HSN</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">GST %</th>
                <th className="pb-2 text-right font-medium">Taxable Value</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-2.5 font-medium text-slate-800">{l.description}</td>
                  <td className="py-2.5 font-mono text-slate-600">{l.hsn || "—"}</td>
                  <td className="py-2.5 text-right text-slate-600">{l.qty}</td>
                  <td className="py-2.5 text-right text-slate-600">{inr(l.unitPrice)}</td>
                  <td className="py-2.5 text-right text-slate-600">{l.taxRate}%</td>
                  <td className="py-2.5 text-right text-slate-800">{inr(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Taxable value</span>
                <span>{inr(invoice.subtotal)}</span>
              </div>
              {intra ? (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>CGST</span>
                    <span>{inr(invoice.cgst)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>SGST</span>
                    <span>{inr(invoice.sgst)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-slate-600">
                  <span>IGST</span>
                  <span>{inr(invoice.igst)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-900">
                <span>Grand Total</span>
                <span>{inr(invoice.grandTotal)}</span>
              </div>
              <div className="pt-1 text-right text-xs text-slate-400">
                {intra ? "Intra-state supply (CGST + SGST)" : "Inter-state supply (IGST)"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
