import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { inr, inrLakh, shortDate } from "@/lib/format";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { CreatePoForm } from "./create-po-form";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  Draft: "slate",
  Sent: "blue",
  Received: "green",
};

// Server action: create a purchase order.
async function createPo(formData: FormData) {
  "use server";
  const s = await requireSession();
  const vendor = String(formData.get("vendor") || "").trim();
  const total = Number(formData.get("total") || 0);
  if (!vendor) return;

  const count = await db.purchaseOrder.count({ where: { tenantId: s.tenantId } });
  const number = `PO-${String(count + 1).padStart(4, "0")}`;

  const po = await db.purchaseOrder.create({
    data: {
      tenantId: s.tenantId,
      number,
      vendor,
      total,
      status: "Draft",
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "po.created",
    entity: "PurchaseOrder",
    entityId: po.id,
    actorId: s.userId,
    payload: { note: `PO ${number} raised for ${vendor} (${inr(total)})`, total },
  });

  revalidatePath("/inventory/purchase-orders");
}

// Server action: receive a purchase order (Draft/Sent → Received).
async function receivePo(formData: FormData) {
  "use server";
  const s = await requireSession();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const po = await db.purchaseOrder.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!po || po.status === "Received") return;

  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "Received" } });

  // In a full implementation, receiving a PO would also create inbound StockMoves
  // (type "GRN") for each ordered line and bump the corresponding Item.onHand.
  // This mock PO has no line items, so we only flip the status here.

  await emit({
    tenantId: s.tenantId,
    type: "po.received",
    entity: "PurchaseOrder",
    entityId: po.id,
    actorId: s.userId,
    payload: { note: `PO ${po.number} received from ${po.vendor}`, total: po.total },
  });

  revalidatePath("/inventory/purchase-orders");
}

export default async function PurchaseOrdersPage() {
  const s = await requireSession();
  if (!(await can(s, "inventory", "read"))) return <NoAccess label="Inventory" />;
  const t = s.tenantId;

  const orders = await db.purchaseOrder.findMany({
    where: { tenantId: t },
    orderBy: { createdAt: "desc" },
  });

  const openPos = orders.filter((o) => o.status !== "Received").length;
  const totalValue = orders.reduce((a, o) => a + o.total, 0);

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle="Procurement & goods receipt"
        action={
          <Link href="/inventory" className="btn-ghost">
            ← Inventory
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 mb-5">
        <StatCard label="Open POs" value={String(openPos)} accent="amber" hint="Draft / Sent" />
        <StatCard label="Total PO Value" value={inrLakh(totalValue)} accent="brand" hint="All purchase orders" />
      </div>

      <div className="mb-5">
        <CreatePoForm action={createPo} />
      </div>

      {orders.length === 0 ? (
        <Empty>No purchase orders yet.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Number</th>
                <th className="th">Vendor</th>
                <th className="th">Status</th>
                <th className="th text-right">Total</th>
                <th className="th">Created</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="td font-medium">{o.number}</td>
                  <td className="td">{o.vendor}</td>
                  <td className="td">
                    <Badge tone={statusTone[o.status] || "slate"}>{o.status}</Badge>
                  </td>
                  <td className="td text-right">{inr(o.total)}</td>
                  <td className="td text-slate-500">{shortDate(o.createdAt)}</td>
                  <td className="td text-right">
                    {o.status !== "Received" ? (
                      <form action={receivePo}>
                        <input type="hidden" name="id" value={o.id} />
                        <button type="submit" className="btn">
                          Receive
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
