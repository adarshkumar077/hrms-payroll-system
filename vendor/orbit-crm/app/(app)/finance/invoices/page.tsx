import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { scopedDb } from "@/lib/tenantDb";
import { PageHeader, StatCard, MoneyStat, Badge, Empty } from "@/components/ui";
import { inr } from "@/lib/format";
import { requiresEInvoice } from "@/lib/compliance/gst";
import { CreateInvoice } from "./CreateInvoice";
import { InvoiceActions } from "./InvoiceActions";
import { FilterBar, Pagination } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  Draft: "slate",
  Finalized: "blue",
  Paid: "green",
};

export default async function InvoicesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;
  const t = s.tenantId;
  const tdb = scopedDb(t);
  const p = parseListParams(searchParams);

  const where = {
    ...(p.q ? { number: { contains: p.q } } : {}),
    ...(p.status ? { status: p.status } : {}),
  };

  const [invoices, accounts, products, tenant, total] = await Promise.all([
    tdb.invoice.findMany({
      where,
      include: { account: true },
      orderBy: orderByFrom(p.sort, p.order, ["createdAt", "grandTotal"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
    }),
    tdb.account.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, state: true } }),
    tdb.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, unitPrice: true, taxRate: true, hsn: true } }),
    db.tenant.findUnique({ where: { id: t } }), // Tenant itself isn't a tenant-scoped model — stays on raw db.
    tdb.invoice.count({ where }),
  ]);

  // ── Stat aggregates (over full table, not paged rows) ──
  const allInvoices = await tdb.invoice.findMany({
    select: { grandTotal: true, cgst: true, sgst: true, igst: true, status: true, irn: true },
  });

  const totalInvoiced = allInvoices.reduce((a, i) => a + i.grandTotal, 0);
  const taxCollected = allInvoices.reduce((a, i) => a + i.cgst + i.sgst + i.igst, 0);
  const receivables = allInvoices
    .filter((i) => i.status !== "Paid")
    .reduce((a, i) => a + i.grandTotal, 0);
  const eInvoicedCount = allInvoices.filter((i) => !!i.irn).length;

  const aato = tenant?.aato ?? 0;
  const eInvoiceMandated = requiresEInvoice(aato, "B2B");

  // ── GSTR-1 draft: finalized (or paid) invoices grouped by tax rate slab (from full table) ──
  const filed = allInvoices.filter((i) => i.status !== "Draft");
  const bySlab = new Map<number, { count: number; taxable: number; tax: number }>();

  // We need full invoice data with subtotal for this calculation
  const allInvoicesForGSTR = await tdb.invoice.findMany({
    select: { status: true, subtotal: true, cgst: true, sgst: true, igst: true, grandTotal: true },
  });

  for (const inv of allInvoicesForGSTR.filter((i) => i.status !== "Draft")) {
    const tax = inv.cgst + inv.sgst + inv.igst;
    const rate = inv.subtotal > 0 ? Math.round((tax / inv.subtotal) * 100) : 0;
    const cur = bySlab.get(rate) || { count: 0, taxable: 0, tax: 0 };
    cur.count += 1;
    cur.taxable += inv.subtotal;
    cur.tax += tax;
    bySlab.set(rate, cur);
  }
  const slabs = [...bySlab.entries()].sort((a, b) => a[0] - b[0]);

  // Recompute filed total for display
  const filedTotal = allInvoicesForGSTR.filter((i) => i.status !== "Draft").reduce((a, i) => a + i.subtotal, 0);
  const filedTaxTotal = allInvoicesForGSTR.filter((i) => i.status !== "Draft").reduce((a, i) => a + i.cgst + i.sgst + i.igst, 0);

  return (
    <div>
      <PageHeader
        title="GST Invoices"
        subtitle="Native e-invoicing (IRP) — no Tally export needed. Auto-prepares GSTR-1."
        action={<CreateInvoice accounts={accounts} products={products} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MoneyStat label="Total Invoiced" amount={totalInvoiced} accent="brand" hint={`${allInvoices.length} invoices`} />
        <MoneyStat label="Tax Collected" amount={taxCollected} accent="amber" hint="CGST + SGST + IGST" />
        <MoneyStat label="Receivables" amount={receivables} accent="red" hint="Unpaid (draft + finalized)" />
        <StatCard
          label="e-Invoiced"
          value={String(eInvoicedCount)}
          accent="green"
          hint={eInvoiceMandated ? "IRN generated on IRP" : "Not mandated (AATO ≤ ₹5cr)"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Invoice table */}
        <div className="lg:col-span-2">
          <FilterBar statuses={["Draft", "Finalized", "Paid"]} placeholder="Search invoice number…" />
          {total === 0 ? (
            <Empty>No invoices yet. Create your first GST invoice.</Empty>
          ) : (
            <>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Number</th>
                      <th className="th">Account</th>
                      <th className="th">Place of Supply</th>
                      <th className="th text-right">Subtotal</th>
                      <th className="th text-right">Tax</th>
                      <th className="th text-right">Grand Total</th>
                      <th className="th">Status</th>
                      <th className="th">e-Invoice</th>
                      <th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const intra = inv.igst === 0;
                      const tax = inv.cgst + inv.sgst + inv.igst;
                      return (
                        <tr key={inv.id}>
                          <td className="td">
                            <Link href={`/finance/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                              {inv.number}
                            </Link>
                          </td>
                          <td className="td text-slate-600">{inv.account?.name || "—"}</td>
                          <td className="td text-slate-600">{inv.placeOfSupply || "—"}</td>
                          <td className="td text-right text-slate-700">{inr(inv.subtotal)}</td>
                          <td className="td text-right text-slate-700">
                            <div>{inr(tax)}</div>
                            <div className="text-[11px] text-slate-400">
                              {intra ? `CGST ${inr(inv.cgst)} + SGST ${inr(inv.sgst)}` : `IGST ${inr(inv.igst)}`}
                            </div>
                          </td>
                          <td className="td text-right font-semibold text-slate-900">{inr(inv.grandTotal)}</td>
                          <td className="td">
                            <Badge tone={statusTone[inv.status] || "slate"}>{inv.status}</Badge>
                          </td>
                          <td className="td">
                            {inv.irn ? (
                              <Badge tone="green">IRN ✓</Badge>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="td">
                            <InvoiceActions invoiceId={inv.id} status={inv.status} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination {...pageInfo(total, p.page)} />
            </>
          )}
        </div>

        {/* GSTR-1 draft summary */}
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">GSTR-1 Draft</h3>
              <Badge tone="brand">Auto</Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">Auto-prepared from finalized invoices.</p>

            {slabs.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No finalized invoices yet.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-1 font-medium">Rate</th>
                    <th className="pb-1 text-center font-medium">Inv</th>
                    <th className="pb-1 text-right font-medium">Taxable</th>
                    <th className="pb-1 text-right font-medium">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {slabs.map(([rate, v]) => (
                    <tr key={rate} className="border-t border-slate-100">
                      <td className="py-1.5 font-medium text-slate-700">{rate}%</td>
                      <td className="py-1.5 text-center text-slate-600">{v.count}</td>
                      <td className="py-1.5 text-right text-slate-600">{inr(v.taxable)}</td>
                      <td className="py-1.5 text-right text-slate-600">{inr(v.tax)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-200 font-semibold text-slate-900">
                    <td className="py-1.5">Total</td>
                    <td className="py-1.5 text-center">{allInvoicesForGSTR.filter((i) => i.status !== "Draft").length}</td>
                    <td className="py-1.5 text-right">{inr(filedTotal)}</td>
                    <td className="py-1.5 text-right">{inr(filedTaxTotal)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-800">Compliance</h3>
            <div className="mt-2 space-y-1.5 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Company GSTIN</span>
                <span className="font-mono text-slate-800">{tenant?.gstin || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span>AATO</span>
                <span className="text-slate-800">{inr(aato)}</span>
              </div>
              <div className="flex justify-between">
                <span>e-Invoicing</span>
                {eInvoiceMandated ? (
                  <Badge tone="green">Mandatory (&gt; ₹5cr)</Badge>
                ) : (
                  <Badge tone="slate">Not required</Badge>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {eInvoiceMandated
                ? "Finalizing a B2B invoice registers it on the IRP and returns an IRN — auto-populating GSTR-1 and e-way Part-A."
                : "Below the ₹5cr threshold, e-invoicing is optional. Finalized invoices still feed GSTR-1."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
