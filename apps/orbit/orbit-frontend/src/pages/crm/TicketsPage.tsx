import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, shortDate, ApiError } from "../../lib/api";
import { PageHeader } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";
import { DetailDrawer } from "../../components/DetailDrawer";

const STATUSES = ["Open", "InProgress", "Resolved", "Closed"];
const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

type Ticket = {
  id: string;
  account_id: string;
  subject: string;
  priority?: string | null;
  status?: string | null;
  sla_due_at?: string | null;
};

type Account = { id: string; name: string };

const emptyForm = { account_id: "", subject: "", priority: "Medium", status: "Open", sla_due_at: "" };

// Tickets list: search, "+ New Ticket" create modal, per-row status dropdown, detail drawer, edit + delete.
export function TicketsPage() {
  const [rows, setRows] = useState<Ticket[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<Ticket | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErr, setEditErr] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = () => {
    setErr("");
    apiGet<any>("/crm/tickets")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  };

  useEffect(() => {
    load();
    apiGet<any>("/crm/accounts")
      .then((r) => setAccounts(Array.isArray(r) ? r : r?.data ?? []))
      .catch(() => {});
  }, []);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name || id;

  const filtered = (rows || []).filter((row) =>
    !q || [row.subject, row.priority, row.status].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  function openNew() {
    setForm({ ...emptyForm, account_id: accounts[0]?.id || "" });
    setFormErr("");
    setOpen(true);
  }

  async function submit() {
    setFormErr("");
    if (!form.account_id) { setFormErr("Account is required."); return; }
    if (!form.subject.trim()) { setFormErr("Subject is required."); return; }
    setSaving(true);
    try {
      await apiPost("/crm/tickets", {
        account_id: form.account_id,
        subject: form.subject,
        priority: form.priority || null,
        status: form.status || null,
        sla_due_at: form.sla_due_at || null,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create ticket.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    setErr("");
    try {
      const updated = await apiPatch<Ticket>(`/crm/tickets/${id}/status`, { status });
      setRows((rs) => (rs || []).map((r) => (r.id === id ? updated : r)));
      setSelected((s) => (s && s.id === id ? updated : s));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to update status.");
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(row: Ticket) {
    setEditForm({
      account_id: row.account_id || "",
      subject: row.subject || "",
      priority: row.priority || "Medium",
      status: row.status || "Open",
      sla_due_at: row.sla_due_at ? row.sla_due_at.slice(0, 10) : "",
    });
    setEditErr("");
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!selected) return;
    setEditErr("");
    if (!editForm.account_id) { setEditErr("Account is required."); return; }
    if (!editForm.subject.trim()) { setEditErr("Subject is required."); return; }
    setEditSaving(true);
    try {
      const updated = await apiPatch<Ticket>(`/crm/tickets/${selected.id}`, {
        account_id: editForm.account_id,
        subject: editForm.subject,
        priority: editForm.priority || null,
        status: editForm.status || null,
        sla_due_at: editForm.sla_due_at || null,
      });
      setRows((rs) => (rs || []).map((r) => (r.id === selected.id ? updated : r)));
      setSelected(updated);
      setEditOpen(false);
    } catch (e) {
      setEditErr(e instanceof ApiError ? e.message : "Failed to update ticket.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteTicket(id: string) {
    if (!confirm("Delete this ticket? This cannot be undone.")) return;
    setDeleting(id);
    setErr("");
    try {
      await apiDelete(`/crm/tickets/${id}`);
      setSelected((s) => (s && s.id === id ? null : s));
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to delete ticket.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tickets"
        subtitle={rows ? `${rows.length} record${rows.length === 1 ? "" : "s"} · live from Laravel` : undefined}
        action={<button className="btn" onClick={openNew}>+ New Ticket</button>}
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
              <th className="th">Account</th>
              <th className="th">Priority</th>
              <th className="th">Status</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td className="td text-slate-400" colSpan={5}>Loading…</td></tr>
            )}
            {rows !== null && filtered.length === 0 && (
              <tr><td className="td text-slate-400" colSpan={5}>No records yet.</td></tr>
            )}
            {filtered.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(row)}>
                <td className="td font-medium text-slate-800">{row.subject}</td>
                <td className="td">{accountName(row.account_id)}</td>
                <td className="td">{row.priority || <span className="text-slate-300">—</span>}</td>
                <td className="td" onClick={(e) => e.stopPropagation()}>
                  <select
                    className="input py-1 text-xs w-36"
                    value={row.status || ""}
                    disabled={busyId === row.id}
                    onChange={(e) => setStatus(row.id, e.target.value)}
                  >
                    {!row.status && <option value="">—</option>}
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="td" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-ghost text-xs py-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    disabled={deleting === row.id}
                    onClick={() => deleteTicket(row.id)}
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
        <Modal title="New Ticket" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <Field label="Account *">
              <select className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Select an account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Subject *">
              <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field>
            <Field label="Priority">
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="SLA due">
              <input className="input" type="date" value={form.sla_due_at} onChange={(e) => setForm({ ...form, sla_due_at: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Create Ticket"}</button>
            </div>
          </div>
        </Modal>
      )}

      {selected && !editOpen && (
        <DetailDrawer
          title={selected.subject}
          subtitle="Ticket"
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          onDelete={() => deleteTicket(selected.id)}
          deleting={deleting === selected.id}
          fields={[
            { label: "Account", value: accountName(selected.account_id) },
            { label: "Priority", value: selected.priority },
            { label: "Status", value: selected.status },
            { label: "SLA due", value: shortDate(selected.sla_due_at) },
          ]}
        />
      )}

      {editOpen && selected && (
        <Modal title="Edit Ticket" onClose={() => setEditOpen(false)}>
          <div className="space-y-3">
            {editErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{editErr}</div>}
            <Field label="Account *">
              <select className="input" value={editForm.account_id} onChange={(e) => setEditForm({ ...editForm, account_id: e.target.value })}>
                <option value="">Select an account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Subject *">
              <input className="input" value={editForm.subject} onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })} />
            </Field>
            <Field label="Priority">
              <select className="input" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="SLA due">
              <input className="input" type="date" value={editForm.sla_due_at} onChange={(e) => setEditForm({ ...editForm, sla_due_at: e.target.value })} />
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
