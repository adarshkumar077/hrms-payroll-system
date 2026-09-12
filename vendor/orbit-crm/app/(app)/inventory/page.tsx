import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { inr, inrLakh } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";
import { AdjustStockForm } from "./adjust-stock-form";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, moduleLabel } from "@/lib/studio/config";

export const dynamic = "force-dynamic";

// Server action: adjust stock — records a StockMove and updates Item.onHand.
async function adjustStock(formData: FormData) {
  "use server";
  const s = await requireSession();
  const itemId = String(formData.get("itemId") || "");
  const qty = Number(formData.get("qty") || 0);
  const reason = String(formData.get("reason") || "").trim();

  if (!itemId || !qty) return;

  // Ensure the item belongs to this tenant before touching it.
  const item = await db.item.findFirst({ where: { id: itemId, tenantId: s.tenantId } });
  if (!item) return;

  const move = await db.stockMove.create({
    data: {
      tenantId: s.tenantId,
      itemId: item.id,
      qty, // +in / -out
      type: "Adjustment",
      ref: reason || null,
    },
  });

  await db.item.update({
    where: { id: item.id },
    data: { onHand: item.onHand + qty },
  });

  await emit({
    tenantId: s.tenantId,
    type: "stock.adjusted",
    entity: "Item",
    entityId: item.id,
    actorId: s.userId,
    payload: {
      note: `Stock ${qty >= 0 ? "+" : ""}${qty} on ${item.name}${reason ? ` (${reason})` : ""}`,
      qty,
      moveId: move.id,
    },
  });

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${item.id}`);
}

export default async function InventoryPage() {
  const s = await requireSession();
  if (!(await can(s, "inventory", "read"))) return <NoAccess label="Inventory" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);

  const items = await db.item.findMany({
    where: { tenantId: t },
    orderBy: { name: "asc" },
  });

  const totalSkus = items.length;
  const stockValue = items.reduce((a, i) => a + i.onHand * i.costPrice, 0);
  const belowReorder = items.filter((i) => i.onHand <= i.reorderLevel);

  return (
    <div>
      <PageHeader
        title={moduleLabel(config, "inventory", "plural")}
        subtitle="Items, stock levels & valuation"
        action={
          <Link href="/inventory/purchase-orders" className="btn-ghost">
            Purchase Orders →
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
        <StatCard label="Total SKUs" value={String(totalSkus)} accent="brand" hint="Distinct items" />
        <StatCard
          label="Stock Value"
          value={inrLakh(stockValue)}
          accent="green"
          hint="On-hand × cost price"
        />
        <StatCard
          label="Below Reorder"
          value={String(belowReorder.length)}
          accent="red"
          hint="Needs replenishment"
        />
      </div>

      <div className="mb-5">
        <AdjustStockForm
          action={adjustStock}
          items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, onHand: i.onHand, uom: i.uom }))}
        />
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-400">No items yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Item</th>
                <th className="th">SKU</th>
                <th className="th">HSN</th>
                <th className="th">UOM</th>
                <th className="th text-right">On-hand</th>
                <th className="th text-right">Reorder</th>
                <th className="th text-right">Cost Price</th>
                <th className="th text-right">Stock Value</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const low = i.onHand <= i.reorderLevel;
                return (
                  <tr key={i.id} className={low ? "bg-amber-50" : ""}>
                    <td className="td">
                      <Link href={`/inventory/${i.id}`} className="font-medium text-brand-700 hover:underline">
                        {i.name}
                      </Link>
                    </td>
                    <td className="td text-slate-500">{i.sku || "—"}</td>
                    <td className="td text-slate-500">{i.hsn || "—"}</td>
                    <td className="td text-slate-500">{i.uom}</td>
                    <td className={`td text-right ${low ? "font-semibold text-amber-700" : ""}`}>{i.onHand}</td>
                    <td className="td text-right text-slate-500">{i.reorderLevel}</td>
                    <td className="td text-right">{inr(i.costPrice)}</td>
                    <td className="td text-right font-medium">{inr(i.onHand * i.costPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
