import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "../../lib/api";
import { PageHeader } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";
import { DetailDrawer } from "../../components/DetailDrawer";

const STATUSES = ["New", "Contacted", "Qualified", "Won", "Lost"];

type Lead = {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  status?: string | null;
  score?: number | null;
  score_reason?: string | null;
};

const emptyForm = { name: "", company: "", email: "", phone: "", source: "", status: "New" };

// Leads list: search, create modal, per-row AI score + status dropdown, detail drawer, edit + delete.
export function LeadsPage() {
  const [rows, setRows] = useState<Lead[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [selected, setSelected] = useState<Lead | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErr, setEditErr] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = () => {
    setErr("");
    apiGet<any>("/crm/leads")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  };

  useEffect(() => { load(); }, []);

  const filtered = (rows || []).filter((row) =>
    !q ||
    [row.name, row.company, row.email, row.phone].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  async function submit() {
    setFormErr("");
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    setSaving(true);
    try {
      await apiPost("/crm/leads", {
        name: form.name,
        company: form.company || null,
        email: form.email || null,
        phone: form.phone || null,
        source: form.source || null,
        status: form.status || null,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create lead.");
    } finally {
      setSaving(false);
    }
  }

  async function score(id: string) {
    setBusyId(id);
    try {
      const updated = await apiPost<Lead>(`/crm/leads/${id}/score`);
      setRows((rs) => (rs || []).map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to score lead.");
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    try {
      const updated = await apiPatch<Lead>(`/crm/leads/${id}`, { status });
      setRows((rs) => (rs || []).map((r) => (r.id === id ? updated : r)));
      setSelected((s) => (s && s.id === id ? updated : s));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to update status.");
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(row: Lead) {
    setEditForm({
      name: row.name || "",
      company: row.company || "",
      email: row.email || "",
      phone: row.phone || "",
      source: row.source || "",
      status: row.status || "New",
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
      const updated = await apiPatch<Lead>(`/crm/leads/${selected.id}`, {
        name: editForm.name,
        company: editForm.company || null,
        email: editForm.email || null,
        phone: editForm.phone || null,
        source: editForm.source || null,
        status: editForm.status || null,
      });
      setRows((rs) => (rs || []).map((r) => (r.id === selected.id ? updated : r)));
      setSelected(updated);
      setEditOpen(false);
    } catch (e) {
      setEditErr(e instanceof ApiError ? e.message : "Failed to update lead.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead? This cannot be undone.")) return;
    setDeleting(id);
    setErr("");
    try {
      await apiDelete(`/crm/leads/${id}`);
      setSelected((s) => (s && s.id === id ? null : s));
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to delete lead.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={rows ? `${rows.length} record${rows.length === 1 ? "" : "s"} · live from Laravel` : undefined}
        action={<button className="btn" onClick={() => { setForm(emptyForm); setFormErr(""); setOpen(true); }}>+ New Lead</button>}
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
              <th className="th">Company</th>
              <th className="th">Source</th>
              <th className="th">Status</th>
              <th className="th">Score</th>
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
                <td className="td">{row.company || <span className="text-slate-300">—</span>}</td>
                <td className="td">{row.source || <span className="text-slate-300">—</span>}</td>
                <td className="td" onClick={(e) => e.stopPropagation()}>
                  <select
                    className="input py-1 text-xs w-32"
                    value={row.status || ""}
                    disabled={busyId === row.id}
                    onChange={(e) => setStatus(row.id, e.target.value)}
                  >
                    {!row.status && <option value="">—</option>}
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="td">
                  {row.score == null ? <span className="text-slate-300">—</span> : <span className="badge">{row.score}</span>}
                </td>
                <td className="td" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <button className="btn-ghost text-xs py-1" disabled={busyId === row.id} onClick={() => score(row.id)}>
                      {busyId === row.id ? "Scoring…" : "Score"}
                    </button>
                    <button
                      className="btn-ghost text-xs py-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                      disabled={deleting === row.id}
                      onClick={() => deleteLead(row.id)}
                    >
                      {deleting === row.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="New Lead" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <Field label="Name *">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Company">
              <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Source">
              <input className="input" placeholder="Website, Referral, Ads…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Create Lead"}</button>
            </div>
          </div>
        </Modal>
      )}

      {selected && !editOpen && (
        <DetailDrawer
          title={selected.name}
          subtitle="Lead"
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          onDelete={() => deleteLead(selected.id)}
          deleting={deleting === selected.id}
          fields={[
            { label: "Company", value: selected.company },
            { label: "Email", value: selected.email },
            { label: "Phone", value: selected.phone },
            { label: "Source", value: selected.source },
            { label: "Status", value: selected.status },
            { label: "Score", value: selected.score },
            { label: "Score reason", value: selected.score_reason },
          ]}
        />
      )}

      {editOpen && selected && (
        <Modal title="Edit Lead" onClose={() => setEditOpen(false)}>
          <div className="space-y-3">
            {editErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{editErr}</div>}
            <Field label="Name *">
              <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </Field>
            <Field label="Company">
              <input className="input" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
            </Field>
            <Field label="Email">
              <input className="input" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input className="input" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </Field>
            <Field label="Source">
              <input className="input" value={editForm.source} onChange={(e) => setEditForm({ ...editForm, source: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
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
