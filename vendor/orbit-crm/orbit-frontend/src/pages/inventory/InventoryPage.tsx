import { useEffect, useState } from "react";
import { apiGet, apiPost, inrLakh } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

interface Item {
  id: string;
  name: string;
  sku: string | null;
  hsn: string | null;
  uom: string;
  on_hand: number;
  reorder_level: number;
  cost_price: number;
  created_at: string;
}

export function InventoryPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  // New Item modal state
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItemData, setNewItemData] = useState({ name: "", sku: "", hsn: "", uom: "Units", on_hand: "", reorder_level: "", cost_price: "" });
  const [newItemErr, setNewItemErr] = useState("");
  const [newItemLoading, setNewItemLoading] = useState(false);

  // Stock adjust modal state
  const [adjustItem, setAdjustItem] = useState<Item | null>(null);
  const [adjustData, setAdjustData] = useState({ qty: "", reason: "" });
  const [adjustErr, setAdjustErr] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  // Fetch items
  useEffect(() => {
    setItems(null);
    setErr("");
    apiGet<any>("/inventory/items")
      .then((r) => setItems(r?.data ?? (Array.isArray(r) ? r : [])))
      .catch((e) => setErr(e.message));
  }, []);

  // Create new item
  const handleCreateItem = async () => {
    setNewItemErr("");
    if (!newItemData.name.trim()) {
      setNewItemErr("Item name is required.");
      return;
    }
    if (!newItemData.uom.trim()) {
      setNewItemErr("UoM is required.");
      return;
    }

    setNewItemLoading(true);
    try {
      const payload = {
        name: newItemData.name,
        sku: newItemData.sku || null,
        hsn: newItemData.hsn || null,
        uom: newItemData.uom,
        on_hand: newItemData.on_hand ? parseInt(newItemData.on_hand, 10) : 0,
        reorder_level: newItemData.reorder_level ? parseInt(newItemData.reorder_level, 10) : 0,
        cost_price: newItemData.cost_price ? parseFloat(newItemData.cost_price) : 0,
      };

      const created = await apiPost<Item>("/inventory/items", payload);
      setItems([...(items || []), created]);
      setShowNewItem(false);
      setNewItemData({ name: "", sku: "", hsn: "", uom: "Units", on_hand: "", reorder_level: "", cost_price: "" });
    } catch (e: any) {
      setNewItemErr(e.message);
    } finally {
      setNewItemLoading(false);
    }
  };

  // Adjust stock
  const handleAdjustStock = async () => {
    if (!adjustItem) return;
    setAdjustErr("");
    if (!adjustData.qty) {
      setAdjustErr("Quantity is required.");
      return;
    }

    setAdjustLoading(true);
    try {
      const payload = {
        qty: parseInt(adjustData.qty, 10),
        reason: adjustData.reason || null,
      };

      const response = await apiPost<any>(`/inventory/items/${adjustItem.id}/adjust-stock`, payload);
      const updated = response.item;
      setItems((items || []).map((i) => (i.id === updated.id ? updated : i)));
      setAdjustItem(null);
      setAdjustData({ qty: "", reason: "" });
    } catch (e: any) {
      setAdjustErr(e.message);
    } finally {
      setAdjustLoading(false);
    }
  };

  const filtered = (items || []).filter((item) =>
    !q || [item.name, item.sku, item.hsn].some((v) => v && String(v).toLowerCase().includes(q.toLowerCase()))
  );

  // Calculate stats
  const skuCount = items?.length || 0;
  const totalStockValue = items?.reduce((sum, i) => sum + i.on_hand * i.cost_price, 0) || 0;
  const lowStockCount = items?.filter((i) => i.on_hand <= i.reorder_level).length || 0;

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={items ? `${items.length} items · live from Laravel` : undefined}
        action={
          <button onClick={() => setShowNewItem(true)} className="btn">
            + New Item
          </button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="SKUs" value={String(skuCount)} accent="brand" />
        <StatCard label="Stock Value" value={inrLakh(totalStockValue)} accent="green" />
        <StatCard label="Low Stock" value={String(lowStockCount)} accent="amber" hint="Need reorder" />
      </div>

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}

      {/* Search */}
      <div className="mb-3 max-w-xs">
        <input className="input" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* Items table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">SKU</th>
              <th className="th">HSN</th>
              <th className="th">On Hand</th>
              <th className="th">Reorder Level</th>
              <th className="th">Cost (each)</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items === null && (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {items !== null && filtered.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  No items yet.
                </td>
              </tr>
            )}
            {filtered.map((item) => {
              const isLowStock = item.on_hand <= item.reorder_level;
              return (
                <tr key={item.id} className={isLowStock ? "bg-amber-50" : ""}>
                  <td className="td font-medium">{item.name}</td>
                  <td className="td text-slate-500">{item.sku || "—"}</td>
                  <td className="td text-slate-500">{item.hsn || "—"}</td>
                  <td className="td">
                    {item.on_hand} {item.uom}
                  </td>
                  <td className="td text-slate-500">{item.reorder_level}</td>
                  <td className="td">{inrLakh(item.cost_price)}</td>
                  <td className="td">
                    <button onClick={() => { setAdjustItem(item); setAdjustData({ qty: "", reason: "" }); }} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                      Adjust
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Item Modal */}
      {showNewItem && (
        <Modal title="New Item" onClose={() => { setShowNewItem(false); setNewItemData({ name: "", sku: "", hsn: "", uom: "Units", on_hand: "", reorder_level: "", cost_price: "" }); setNewItemErr(""); }}>
          <div className="space-y-4">
            {newItemErr && <div className="text-rose-600 text-sm bg-rose-50 px-3 py-2 rounded">{newItemErr}</div>}
            <Field label="Item Name *">
              <input type="text" className="input" value={newItemData.name} onChange={(e) => setNewItemData({ ...newItemData, name: e.target.value })} placeholder="e.g., Widgets" />
            </Field>
            <Field label="SKU">
              <input type="text" className="input" value={newItemData.sku} onChange={(e) => setNewItemData({ ...newItemData, sku: e.target.value })} placeholder="e.g., WID-001" />
            </Field>
            <Field label="HSN Code">
              <input type="text" className="input" value={newItemData.hsn} onChange={(e) => setNewItemData({ ...newItemData, hsn: e.target.value })} placeholder="e.g., 8510" />
            </Field>
            <Field label="UoM *">
              <input type="text" className="input" value={newItemData.uom} onChange={(e) => setNewItemData({ ...newItemData, uom: e.target.value })} placeholder="e.g., Units, Kg, L" />
            </Field>
            <Field label="On Hand (quantity)">
              <input type="number" className="input" value={newItemData.on_hand} onChange={(e) => setNewItemData({ ...newItemData, on_hand: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Reorder Level">
              <input type="number" className="input" value={newItemData.reorder_level} onChange={(e) => setNewItemData({ ...newItemData, reorder_level: e.target.value })} placeholder="0" />
            </Field>
            <Field label="Cost Price">
              <input type="number" className="input" value={newItemData.cost_price} onChange={(e) => setNewItemData({ ...newItemData, cost_price: e.target.value })} placeholder="0" step="0.01" />
            </Field>
            <div className="flex gap-2 pt-3">
              <button onClick={handleCreateItem} disabled={newItemLoading} className="btn flex-1">
                {newItemLoading ? "Creating…" : "Create"}
              </button>
              <button onClick={() => { setShowNewItem(false); setNewItemErr(""); }} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Adjust Stock Modal */}
      {adjustItem && (
        <Modal title={`Adjust Stock: ${adjustItem.name}`} onClose={() => { setAdjustItem(null); setAdjustData({ qty: "", reason: "" }); setAdjustErr(""); }}>
          <div className="space-y-4">
            {adjustErr && <div className="text-rose-600 text-sm bg-rose-50 px-3 py-2 rounded">{adjustErr}</div>}
            <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded">
              Current: <span className="font-semibold">{adjustItem.on_hand} {adjustItem.uom}</span>
            </div>
            <Field label="Qty Change *">
              <input type="number" className="input" value={adjustData.qty} onChange={(e) => setAdjustData({ ...adjustData, qty: e.target.value })} placeholder="e.g., +10 or -5" />
            </Field>
            <Field label="Reason">
              <input type="text" className="input" value={adjustData.reason} onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })} placeholder="e.g., Stock count discrepancy" />
            </Field>
            <div className="flex gap-2 pt-3">
              <button onClick={handleAdjustStock} disabled={adjustLoading} className="btn flex-1">
                {adjustLoading ? "Adjusting…" : "Adjust"}
              </button>
              <button onClick={() => { setAdjustItem(null); setAdjustErr(""); }} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
