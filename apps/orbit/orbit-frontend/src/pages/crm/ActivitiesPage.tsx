import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, ApiError, shortDate } from "../../lib/api";
import { PageHeader } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

type Activity = {
  id: string;
  type: string;
  subject: string;
  related_to?: string | null;
  due_date?: string | null;
  done?: boolean | null;
  summary?: string | null;
  owner_id?: string | null;
};

const emptyForm = { type: "", subject: "", related_to: "", due_date: "", done: false, summary: "" };

// Activities list: search + create modal + delete.
export function ActivitiesPage() {
  const [rows, setRows] = useState<Activity[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setErr("");
    apiGet<any>("/crm/activities")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  };

  useEffect(() => { load(); }, []);

  const filtered = (rows || []).filter((row) =>
    !q ||
    [row.subject, row.summary, row.type, row.related_to].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  async function submit() {
    setFormErr("");
    if (!form.type.trim()) { setFormErr("Type is required."); return; }
    if (!form.subject.trim()) { setFormErr("Subject is required."); return; }
    setSaving(true);
    try {
      await apiPost("/crm/activities", {
        type: form.type,
        subject: form.subject,
        related_to: form.related_to || null,
        due_date: form.due_date || null,
        done: form.done || false,
        summary: form.summary || null,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create activity.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteActivity(id: string) {
    if (!confirm("Delete this activity?")) return;
    setDeleting(id);
    try {
      await apiDelete(`/crm/activities/${id}`);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to delete activity.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle={rows ? `${rows.length} record${rows.length === 1 ? "" : "s"} · live from Laravel` : undefined}
        action={<button className="btn" onClick={() => { setForm(emptyForm); setFormErr(""); setOpen(true); }}>+ New Activity</button>}
      />
      <div className="mb-3 max-w-xs">
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Subject</th>
              <th className="th">Type</th>
              <th className="th">Related To</th>
              <th className="th">Due Date</th>
              <th className="th">Status</th>
              <th className="th">Action</th>
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
              <tr key={row.id}>
                <td className="td font-medium text-slate-800">{row.subject}</td>
                <td className="td text-sm"><span className="badge">{row.type}</span></td>
                <td className="td text-sm text-slate-600">{row.related_to || <span className="text-slate-300">—</span>}</td>
                <td className="td text-sm">{row.due_date ? shortDate(row.due_date) : <span className="text-slate-300">—</span>}</td>
                <td className="td text-sm">
                  {row.done ? (
                    <span className="badge bg-emerald-50 text-emerald-700">Done</span>
                  ) : (
                    <span className="badge bg-amber-50 text-amber-700">Pending</span>
                  )}
                </td>
                <td className="td">
                  <button
                    className="btn-ghost text-xs py-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    onClick={() => deleteActivity(row.id)}
                    disabled={deleting === row.id}
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
        <Modal title="New Activity" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <Field label="Type *">
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="">Choose activity type…</option>
                <option value="Call">Call</option>
                <option value="Email">Email</option>
                <option value="Meeting">Meeting</option>
                <option value="Task">Task</option>
                <option value="Note">Note</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Subject *">
              <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Related To">
              <input className="input" placeholder="e.g., Account ID or contact name" value={form.related_to} onChange={(e) => setForm({ ...form, related_to: e.target.value })} />
            </Field>
            <Field label="Due Date">
              <input className="input" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </Field>
            <Field label="Summary">
              <textarea className="input" rows={3} placeholder="Additional notes…" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            </Field>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="done"
                checked={form.done}
                onChange={(e) => setForm({ ...form, done: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="done" className="text-sm font-medium text-slate-700">Mark as done</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Create Activity"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
