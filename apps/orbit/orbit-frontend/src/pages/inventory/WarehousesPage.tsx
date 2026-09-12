import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
  created_at: string;
}

interface PaginatedResponse {
  data: Warehouse[];
  total: number;
  current_page: number;
  last_page: number;
}

export function WarehousesPage() {
  const [response, setResponse] = useState<PaginatedResponse | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // New Warehouse modal state
  const [showNewWarehouse, setShowNewWarehouse] = useState(false);
  const [newWarehouseData, setNewWarehouseData] = useState({ name: "", location: "" });
  const [newWarehouseErr, setNewWarehouseErr] = useState("");
  const [newWarehouseLoading, setNewWarehouseLoading] = useState(false);

  // Edit Warehouse modal state
  const [editWarehouse, setEditWarehouse] = useState<Warehouse | null>(null);
  const [editWarehouseData, setEditWarehouseData] = useState({ name: "", location: "" });
  const [editWarehouseErr, setEditWarehouseErr] = useState("");
  const [editWarehouseLoading, setEditWarehouseLoading] = useState(false);

  // Delete confirmation state
  const [deleteWarehouse, setDeleteWarehouse] = useState<Warehouse | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch warehouses
  useEffect(() => {
    setResponse(null);
    setErr("");
    apiGet<PaginatedResponse>(`/inventory/warehouses?per_page=15&page=${page}`)
      .then((r) => setResponse(r))
      .catch((e) => setErr(e.message));
  }, [page]);

  // Create new warehouse
  const handleCreateWarehouse = async () => {
    setNewWarehouseErr("");
    if (!newWarehouseData.name.trim()) {
      setNewWarehouseErr("Warehouse name is required.");
      return;
    }

    setNewWarehouseLoading(true);
    try {
      const payload = {
        name: newWarehouseData.name,
        location: newWarehouseData.location || null,
      };

      await apiPost<Warehouse>("/inventory/warehouses", payload);
      setShowNewWarehouse(false);
      setNewWarehouseData({ name: "", location: "" });
      setPage(1); // Refresh to first page
    } catch (e: any) {
      setNewWarehouseErr(e.message);
    } finally {
      setNewWarehouseLoading(false);
    }
  };

  // Edit warehouse
  const handleEditWarehouse = async () => {
    if (!editWarehouse) return;
    setEditWarehouseErr("");
    if (!editWarehouseData.name.trim()) {
      setEditWarehouseErr("Warehouse name is required.");
      return;
    }

    setEditWarehouseLoading(true);
    try {
      const payload = {
        name: editWarehouseData.name,
        location: editWarehouseData.location || null,
      };

      const updated = await apiPatch<Warehouse>(`/inventory/warehouses/${editWarehouse.id}`, payload);
      setResponse((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.map((w) => (w.id === updated.id ? updated : w)),
        };
      });
      setEditWarehouse(null);
      setEditWarehouseData({ name: "", location: "" });
    } catch (e: any) {
      setEditWarehouseErr(e.message);
    } finally {
      setEditWarehouseLoading(false);
    }
  };

  // Delete warehouse
  const handleDeleteWarehouse = async () => {
    if (!deleteWarehouse) return;
    setDeleteLoading(true);
    try {
      await apiDelete(`/inventory/warehouses/${deleteWarehouse.id}`);
      setResponse((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: prev.data.filter((w) => w.id !== deleteWarehouse.id),
        };
      });
      setDeleteWarehouse(null);
    } catch (e: any) {
      setErr(e.message);
      setDeleteWarehouse(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const warehouses = response?.data || [];
  const filtered = warehouses.filter((warehouse) =>
    !q || [warehouse.name, warehouse.location].some((v) => v && String(v).toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <PageHeader
        title="Warehouses"
        subtitle={response ? `${response.total} warehouses · live from Laravel` : undefined}
        action={
          <button onClick={() => setShowNewWarehouse(true)} className="btn">
            + New Warehouse
          </button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total" value={String(response?.total || 0)} accent="brand" />
      </div>

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}

      {/* Search */}
      <div className="mb-3 max-w-xs">
        <input className="input" placeholder="Search warehouses…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* Warehouses table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Location</th>
              <th className="th">Created</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {response === null && (
              <tr>
                <td className="td text-slate-400" colSpan={4}>
                  Loading…
                </td>
              </tr>
            )}
            {response !== null && filtered.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={4}>
                  No warehouses yet.
                </td>
              </tr>
            )}
            {filtered.map((warehouse) => (
              <tr key={warehouse.id}>
                <td className="td font-medium">{warehouse.name}</td>
                <td className="td text-slate-500">{warehouse.location || "—"}</td>
                <td className="td text-slate-500 text-sm">{new Date(warehouse.created_at).toLocaleDateString("en-IN")}</td>
                <td className="td">
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setEditWarehouse(warehouse);
                        setEditWarehouseData({ name: warehouse.name, location: warehouse.location || "" });
                      }}
                      className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleteWarehouse(warehouse)}
                      className="text-sm text-rose-600 hover:text-rose-700 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {response && response.last_page > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="btn-ghost py-1.5 px-3 text-sm disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {response.last_page}
          </span>
          <button
            onClick={() => setPage(Math.min(response.last_page, page + 1))}
            disabled={page === response.last_page}
            className="btn-ghost py-1.5 px-3 text-sm disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}

      {/* New Warehouse Modal */}
      {showNewWarehouse && (
        <Modal
          title="New Warehouse"
          onClose={() => {
            setShowNewWarehouse(false);
            setNewWarehouseData({ name: "", location: "" });
            setNewWarehouseErr("");
          }}
        >
          <div className="space-y-4">
            {newWarehouseErr && <div className="text-rose-600 text-sm bg-rose-50 px-3 py-2 rounded">{newWarehouseErr}</div>}
            <Field label="Name *">
              <input
                type="text"
                className="input"
                value={newWarehouseData.name}
                onChange={(e) => setNewWarehouseData({ ...newWarehouseData, name: e.target.value })}
                placeholder="e.g., Main Store"
              />
            </Field>
            <Field label="Location">
              <input
                type="text"
                className="input"
                value={newWarehouseData.location}
                onChange={(e) => setNewWarehouseData({ ...newWarehouseData, location: e.target.value })}
                placeholder="e.g., Mumbai, Maharashtra"
              />
            </Field>
            <div className="flex gap-2 pt-3">
              <button onClick={handleCreateWarehouse} disabled={newWarehouseLoading} className="btn flex-1">
                {newWarehouseLoading ? "Creating…" : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowNewWarehouse(false);
                  setNewWarehouseErr("");
                }}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Warehouse Modal */}
      {editWarehouse && (
        <Modal
          title={`Edit Warehouse: ${editWarehouse.name}`}
          onClose={() => {
            setEditWarehouse(null);
            setEditWarehouseData({ name: "", location: "" });
            setEditWarehouseErr("");
          }}
        >
          <div className="space-y-4">
            {editWarehouseErr && <div className="text-rose-600 text-sm bg-rose-50 px-3 py-2 rounded">{editWarehouseErr}</div>}
            <Field label="Name *">
              <input
                type="text"
                className="input"
                value={editWarehouseData.name}
                onChange={(e) => setEditWarehouseData({ ...editWarehouseData, name: e.target.value })}
                placeholder="e.g., Main Store"
              />
            </Field>
            <Field label="Location">
              <input
                type="text"
                className="input"
                value={editWarehouseData.location}
                onChange={(e) => setEditWarehouseData({ ...editWarehouseData, location: e.target.value })}
                placeholder="e.g., Mumbai, Maharashtra"
              />
            </Field>
            <div className="flex gap-2 pt-3">
              <button onClick={handleEditWarehouse} disabled={editWarehouseLoading} className="btn flex-1">
                {editWarehouseLoading ? "Updating…" : "Update"}
              </button>
              <button
                onClick={() => {
                  setEditWarehouse(null);
                  setEditWarehouseErr("");
                }}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteWarehouse && (
        <Modal
          title="Delete Warehouse?"
          onClose={() => setDeleteWarehouse(null)}
        >
          <div className="space-y-4">
            <p className="text-slate-600 text-sm">
              Are you sure you want to delete <strong>{deleteWarehouse.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-2 pt-3">
              <button onClick={handleDeleteWarehouse} disabled={deleteLoading} className="btn bg-rose-600 hover:bg-rose-700 flex-1">
                {deleteLoading ? "Deleting…" : "Delete"}
              </button>
              <button onClick={() => setDeleteWarehouse(null)} className="btn-ghost flex-1">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
