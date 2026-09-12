import { useEffect, useState } from "react";
import { apiGet, apiPost, inrLakh, shortDate } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

interface PurchaseOrder {
  id: string;
  number: string;
  vendor: string;
  total: number;
  status: "Draft" | "Sent" | "Received";
  created_at: string;
}

export function PurchaseOrdersPage() {
  const [pos, setPOs] = useState<PurchaseOrder[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  // New PO modal state
  const [showNewPO, setShowNewPO] = useState(false);
  const [newPOData, setNewPOData] = useState({ number: "", vendor: "", total: "" });
  const [newPOErr, setNewPOErr] = useState("");
  const [newPOLoading, setNewPOLoading] = useState(false);

  // Receive modal state
  const [receivePO, setReceivePO] = useState<PurchaseOrder | null>(null);
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [receiveErr, setReceiveErr] = useState("");

  // Fetch POs
  useEffect(() => {
    setPOs(null);
    setErr("");
    apiGet<any>("/inventory/purchase-orders")
      .then((r) => setPOs(r?.data ?? (Array.isArray(r) ? r : [])))
      .catch((e) => setErr(e.message));
  }, []);

  // Create new PO
  const handleCreatePO = async () => {
    setNewPOErr("");
    if (!newPOData.number.trim()) {
      setNewPOErr("PO number is required.");
      return;
    }
    if (!newPOData.vendor.trim()) {
      setNewPOErr("Vendor is required.");
      return;
    }

    setNewPOLoading(true);
    try {
      const payload = {
        number: newPOData.number,
        vendor: newPOData.vendor,
        total: newPOData.total ? parseFloat(newPOData.total) : 0,
        status: "Draft",
      };

      const created = await apiPost<PurchaseOrder>("/inventory/purchase-orders", payload);
      setPOs([...(pos || []), created]);
      setShowNewPO(false);
      setNewPOData({ number: "", vendor: "", total: "" });
    } catch (e: any) {
      setNewPOErr(e.message);
    } finally {
      setNewPOLoading(false);
    }
  };

  // Receive PO
  const handleReceivePO = async () => {
    if (!receivePO) return;
    setReceiveErr("");

    setReceiveLoading(true);
    try {
      const response = await apiPost<any>(`/inventory/purchase-orders/${receivePO.id}/receive`, {});
      const updated = response.po;
      setPOs((pos || []).map((p) => (p.id === updated.id ? updated : p)));
      setReceivePO(null);
    } catch (e: any) {
      setReceiveErr(e.message);
    } finally {
      setReceiveLoading(false);
    }
  };

  const filtered = (pos || []).filter((po) =>
    !q || [po.number, po.vendor].some((v) => v && String(v).toLowerCase().includes(q.toLowerCase()))
  );

  // Calculate stats
  const totalPOs = pos?.length || 0;
  const draftCount = pos?.filter((p) => p.status === "Draft").length || 0;
  const receivedCount = pos?.filter((p) => p.status === "Received").length || 0;

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "Draft":
        return "badge bg-slate-100 text-slate-700";
      case "Sent":
        return "badge bg-blue-100 text-blue-700";
      case "Received":
        return "badge bg-emerald-100 text-emerald-700";
      default:
        return "badge bg-slate-100 text-slate-700";
    }
  };

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle={pos ? `${pos.length} POs · live from Laravel` : undefined}
        action={
          <button onClick={() => setShowNewPO(true)} className="btn">
            + New PO
          </button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total POs" value={String(totalPOs)} accent="brand" />
        <StatCard label="Draft" value={String(draftCount)} accent="slate" />
        <StatCard label="Received" value={String(receivedCount)} accent="green" />
      </div>

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}

      {/* Search */}
      <div className="mb-3 max-w-xs">
        <input className="input" placeholder="Search POs…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* POs table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">PO Number</th>
              <th className="th">Vendor</th>
              <th className="th">Total</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pos === null && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {pos !== null && filtered.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  No purchase orders yet.
                </td>
              </tr>
            )}
            {filtered.map((po) => (
              <tr key={po.id}>
                <td className="td font-medium">{po.number}</td>
                <td className="td text-slate-500">{po.vendor}</td>
                <td className="td">{inrLakh(po.total)}</td>
                <td className="td">
                  <span className={`badge ${statusBadgeClass(po.status)}`}>{po.status}</span>
                </td>
                <td className="td text-slate-500">{shortDate(po.created_at)}</td>
                <td className="td">
                  {(po.status === "Draft" || po.status === "Sent") && (
                    <button
                      onClick={() => {
                        setReceivePO(po);
                        setReceiveErr("");
                      }}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Receive
                    </button>
                  )}
                  {po.status === "Received" && <span className="text-slate-400 text-sm">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New PO Modal */}
      {showNewPO && (
        <Modal
          title="New Purchase Order"
          onClose={() => {
            setShowNewPO(false);
            setNewPOData({ number: "", vendor: "", total: "" });
            setNewPOErr("");
          }}
        >
          <div className="space-y-4">
            {newPOErr && <div className="text-rose-600 text-sm bg-rose-50 px-3 py-2 rounded">{newPOErr}</div>}
            <Field label="PO Number *">
              <input type="text" className="input" value={newPOData.number} onChange={(e) => setNewPOData({ ...newPOData, number: e.target.value })} placeholder="e.g., PO-001" />
            </Field>
            <Field label="Vendor *">
              <input type="text" className="input" value={newPOData.vendor} onChange={(e) => setNewPOData({ ...newPOData, vendor: e.target.value })} placeholder="e.g., Acme Inc." />
            </Field>
            <Field label="Total Amount">
              <input type="number" className="input" value={newPOData.total} onChange={(e) => setNewPOData({ ...newPOData, total: e.target.value })} placeholder="0" step="0.01" />
            </Field>
            <div className="flex gap-2 pt-3">
              <button onClick={handleCreatePO} disabled={newPOLoading} className="btn flex-1">
                {newPOLoading ? "Creating…" : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowNewPO(false);
                  setNewPOErr("");
                }}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Receive PO Modal */}
      {receivePO && (
        <Modal
          title={`Receive PO: ${receivePO.number}`}
          onClose={() => {
            setReceivePO(null);
            setReceiveErr("");
          }}
        >
          <div className="space-y-4">
            {receiveErr && <div className="text-rose-600 text-sm bg-rose-50 px-3 py-2 rounded">{receiveErr}</div>}
            <div className="text-sm text-slate-600 space-y-2">
              <div>
                <span className="text-slate-500">Vendor:</span> <span className="font-semibold">{receivePO.vendor}</span>
              </div>
              <div>
                <span className="text-slate-500">Total:</span> <span className="font-semibold">{inrLakh(receivePO.total)}</span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span> <span className="font-semibold">{receivePO.status}</span>
              </div>
            </div>
            <div className="bg-blue-50 text-blue-700 text-sm px-3 py-2 rounded">Mark this PO as received?</div>
            <div className="flex gap-2 pt-3">
              <button onClick={handleReceivePO} disabled={receiveLoading} className="btn flex-1">
                {receiveLoading ? "Receiving…" : "Confirm Receive"}
              </button>
              <button
                onClick={() => {
                  setReceivePO(null);
                  setReceiveErr("");
                }}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
