import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "../../lib/api";
import { PageHeader } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";
import { DetailDrawer } from "../../components/DetailDrawer";

type Account = {
  id: string;
  name: string;
  industry?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
};

const emptyForm = { name: "", industry: "", phone: "", email: "", city: "", state: "", address: "", gstin: "" };

// Accounts list: search + create modal, detail drawer, edit + delete.
export function AccountsPage() {
  const [rows, setRows] = useState<Account[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [selected, setSelected] = useState<Account | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErr, setEditErr] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = () => {
    setErr("");
    apiGet<any>("/crm/accounts")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  };

  useEffect(() => { load(); }, []);

  const filtered = (rows || []).filter((row) =>
    !q ||
    [row.name, row.industry, row.city, row.gstin].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  async function submit() {
    setFormErr("");
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    setSaving(true);
    try {
      await apiPost("/crm/accounts", {
        name: form.name,
        industry: form.industry || null,
        phone: form.phone || null,
        email: form.email || null,
        city: form.city || null,
        state: form.state || null,
        address: form.address || null,
        gstin: form.gstin || null,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create account.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(row: Account) {
    setEditForm({
      name: row.name || "",
      industry: row.industry || "",
      phone: row.phone || "",
      email: row.email || "",
      city: row.city || "",
      state: row.state || "",
      address: row.address || "",
      gstin: row.gstin || "",
    });
    setEditErr("");
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!selected) return;
    setEditErr("");
    if (!editForm.name.trim()) { setEditErr("Name is required."); return; }
    setEditSaving(true);
    try {
      const updated = await apiPatch<Account>(`/crm/accounts/${selected.id}`, {
        name: editForm.name,
        industry: editForm.industry || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
        city: editForm.city || null,
        state: editForm.state || null,
        address: editForm.address || null,
        gstin: editForm.gstin || null,
      });
      setRows((rs) => (rs || []).map((r) => (r.id === selected.id ? updated : r)));
      setSelected(updated);
      setEditOpen(false);
    } catch (e) {
      setEditErr(e instanceof ApiError ? e.message : "Failed to update account.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteAccount(id: string) {
    if (!confirm("Delete this account? This cannot be undone.")) return;
    setDeleting(id);
    setErr("");
    try {
      await apiDelete(`/crm/accounts/${id}`);
      setSelected((s) => (s && s.id === id ? null : s));
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to delete account.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle={rows ? `${rows.length} record${rows.length === 1 ? "" : "s"} · live from Laravel` : undefined}
        action={<button className="btn" onClick={() => { setForm(emptyForm); setFormErr(""); setOpen(true); }}>+ New Account</button>}
      />
      <div className="mb-3 max-w-xs">
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Industry</th>
              <th className="th">City</th>
              <th className="th">State</th>
              <th className="th">GSTIN</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td className="td text-slate-400" colSpan={6}>Loading…</td></tr>
            )}
            {rows !== null && filtered.length === 0 && (
              <tr><td className="td text-slate-400" colSpan={6}>No records yet.</td></tr>
            )}
            {filtered.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(row)}>
                <td className="td font-medium text-slate-800">{row.name}</td>
                <td className="td">{row.industry || <span className="text-slate-300">—</span>}</td>
                <td className="td">{row.city || <span className="text-slate-300">—</span>}</td>
                <td className="td">{row.state || <span className="text-slate-300">—</span>}</td>
                <td className="td">{row.gstin || <span className="text-slate-300">—</span>}</td>
                <td className="td" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-ghost text-xs py-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    disabled={deleting === row.id}
                    onClick={() => deleteAccount(row.id)}
                  >
                    {deleting === row.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="New Account" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <Field label="Name *">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Industry">
              <input className="input" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="City">
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="State">
              <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </Field>
            <Field label="Address">
              <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <input className="input" maxLength={15} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Create Account"}</button>
            </div>
          </div>
        </Modal>
      )}

      {selected && !editOpen && (
        <DetailDrawer
          title={selected.name}
          subtitle="Account"
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          onDelete={() => deleteAccount(selected.id)}
          deleting={deleting === selected.id}
          fields={[
            { label: "Industry", value: selected.industry },
            { label: "Phone", value: selected.phone },
            { label: "Email", value: selected.email },
            { label: "City", value: selected.city },
            { label: "State", value: selected.state },
            { label: "Address", value: selected.address },
            { label: "GSTIN", value: selected.gstin },
          ]}
        />
      )}

      {editOpen && selected && (
        <Modal title="Edit Account" onClose={() => setEditOpen(false)}>
          <div className="space-y-3">
            {editErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{editErr}</div>}
            <Field label="Name *">
              <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </Field>
            <Field label="Industry">
              <input className="input" value={editForm.industry} onChange={(e) => setEditForm({ ...editForm, industry: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </Field>
            <Field label="City">
              <input className="input" value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
            </Field>
            <Field label="State">
              <input className="input" value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
            </Field>
            <Field label="Address">
              <input className="input" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </Field>
            <Field label="GSTIN">
              <input className="input" maxLength={15} value={editForm.gstin} onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value.toUpperCase() })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
              <button className="btn" disabled={editSaving} onClick={submitEdit}>{editSaving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
