import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

// Tone per stock-move type for the ledger badge.
const typeTone: Record<string, string> = {
  GRN: "green",
  Sale: "blue",
  Adjustment: "amber",
  Transfer: "slate",
};

export default async function ItemDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "inventory", "read"))) return <NoAccess label="Inventory" />;

  const item = await db.item.findFirst({
    where: { id: params.id, tenantId: s.tenantId },
    include: {
      stockMoves: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!item) notFound();

  const low = item.onHand <= item.reorderLevel;

  return (
    <div>
      <PageHeader
        title={item.name}
        subtitle={`${item.sku || "No SKU"} · HSN ${item.hsn || "—"} · ${item.uom}`}
        action={
          <Link href="/inventory" className="btn-ghost">
            ← Inventory
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="On-hand"
          value={`${item.onHand} ${item.uom}`}
          accent={low ? "amber" : "brand"}
          hint={low ? "At/below reorder" : "In stock"}
        />
        <StatCard label="Reorder Level" value={String(item.reorderLevel)} accent="slate" hint="Replenish threshold" />
        <StatCard label="Cost Price" value={inr(item.costPrice)} accent="slate" hint="Per unit" />
        <StatCard label="Stock Value" value={inr(item.onHand * item.costPrice)} accent="green" hint="On-hand × cost" />
      </div>

      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold text-slate-800">Stock ledger</h2>
        {low && <Badge tone="amber">Below reorder</Badge>}
      </div>

      {item.stockMoves.length === 0 ? (
        <Empty>No stock movements recorded yet.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Type</th>
                <th className="th text-right">Qty</th>
                <th className="th">Ref</th>
              </tr>
            </thead>
            <tbody>
              {item.stockMoves.map((m) => (
                <tr key={m.id}>
                  <td className="td text-slate-500">{shortDate(m.createdAt)}</td>
                  <td className="td">
                    <Badge tone={typeTone[m.type] || "slate"}>{m.type}</Badge>
                  </td>
                  <td className={`td text-right font-medium ${m.qty >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {m.qty >= 0 ? "+" : ""}
                    {m.qty}
                  </td>
                  <td className="td text-slate-500">{m.ref || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
