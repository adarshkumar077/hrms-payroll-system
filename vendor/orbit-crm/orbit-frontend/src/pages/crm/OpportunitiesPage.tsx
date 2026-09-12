import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, inrLakh, shortDate, ApiError } from "../../lib/api";
import { PageHeader } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";
import { DetailDrawer } from "../../components/DetailDrawer";

const STAGES = ["Qualification", "Proposal", "Negotiation", "ClosedWon", "ClosedLost"];

type Opportunity = {
  id: string;
  account_id: string;
  name: string;
  amount?: number | null;
  stage?: string | null;
  probability?: number | null;
  close_date?: string | null;
};

type Account = { id: string; name: string };

const emptyForm = { account_id: "", name: "", amount: "", stage: "Qualification" };
const emptyEditForm = { account_id: "", name: "", amount: "", stage: "Qualification", probability: "", close_date: "" };

// Opportunities list: search, create modal (needs an account), per-row Advance action, detail drawer, edit + delete.
export function OpportunitiesPage() {
  const [rows, setRows] = useState<Opportunity[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [editErr, setEditErr] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = () => {
    setErr("");
    apiGet<any>("/crm/opportunities")
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
    !q || [row.name, row.stage, accountName(row.account_id)].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  function openNew() {
    setForm({ ...emptyForm, account_id: accounts[0]?.id || "" });
    setFormErr("");
    setOpen(true);
  }

  async function submit() {
    setFormErr("");
    if (!form.name.trim()) { setFormErr("Name is required."); return; }
    if (!form.account_id) { setFormErr("Account is required."); return; }
    setSaving(true);
    try {
      await apiPost("/crm/opportunities", {
        account_id: form.account_id,
        name: form.name,
        amount: form.amount ? Number(form.amount) : null,
        stage: form.stage || null,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create opportunity.");
    } finally {
      setSaving(false);
    }
  }

  async function advance(id: string) {
    setBusyId(id);
    setErr("");
    try {
      const updated = await apiPost<Opportunity>(`/crm/opportunities/${id}/advance`);
      setRows((rs) => (rs || []).map((r) => (r.id === id ? updated : r)));
      setSelected((s) => (s && s.id === id ? updated : s));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to advance opportunity.");
    } finally {
      setBusyId(null);
    }
  }

  function openEdit(row: Opportunity) {
    setEditForm({
      account_id: row.account_id || "",
      name: row.name || "",
      amount: row.amount != null ? String(row.amount) : "",
      stage: row.stage || "Qualification",
      probability: row.probability != null ? String(row.probability) : "",
      close_date: row.close_date ? row.close_date.slice(0, 10) : "",
    });
    setEditErr("");
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!selected) return;
    setEditErr("");
    if (!editForm.name.trim()) { setEditErr("Name is required."); return; }
    if (!editForm.account_id) { setEditErr("Account is required."); return; }
    setEditSaving(true);
    try {
      const updated = await apiPatch<Opportunity>(`/crm/opportunities/${selected.id}`, {
        account_id: editForm.account_id,
        name: editForm.name,
        amount: editForm.amount ? Number(editForm.amount) : null,
        stage: editForm.stage || null,
        probability: editForm.probability ? Number(editForm.probability) : null,
        close_date: editForm.close_date || null,
      });
      setRows((rs) => (rs || []).map((r) => (r.id === selected.id ? updated : r)));
      setSelected(updated);
      setEditOpen(false);
    } catch (e) {
      setEditErr(e instanceof ApiError ? e.message : "Failed to update opportunity.");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteOpportunity(id: string) {
    if (!confirm("Delete this opportunity? This cannot be undone.")) return;
    setDeleting(id);
    setErr("");
    try {
      await apiDelete(`/crm/opportunities/${id}`);
      setSelected((s) => (s && s.id === id ? null : s));
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to delete opportunity.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Opportunities"
        subtitle={rows ? `${rows.length} record${rows.length === 1 ? "" : "s"} · live from Laravel` : undefined}
        action={<button className="btn" onClick={openNew}>+ New Opportunity</button>}
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
              <th className="th">Account</th>
              <th className="th">Stage</th>
              <th className="th">Amount</th>
              <th className="th">Prob %</th>
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
            {filtered.map((row) => {
              const canAdvance = row.stage && STAGES.slice(0, 3).includes(row.stage);
              return (
                <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(row)}>
                  <td className="td font-medium text-slate-800">{row.name}</td>
                  <td className="td">{accountName(row.account_id)}</td>
                  <td className="td"><span className="badge">{row.stage || "—"}</span></td>
                  <td className="td">{inrLakh(Number(row.amount || 0))}</td>
                  <td className="td">{row.probability ?? <span className="text-slate-300">—</span>}</td>
                  <td className="td" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        className="btn-ghost text-xs py-1"
                        disabled={busyId === row.id || !canAdvance}
                        onClick={() => advance(row.id)}
                        title={canAdvance ? "Advance to next stage" : "Already at final stage"}
                      >
                        {busyId === row.id ? "Advancing…" : "Advance →"}
                      </button>
                      <button
                        className="btn-ghost text-xs py-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                        disabled={deleting === row.id}
                        onClick={() => deleteOpportunity(row.id)}
                      >
                        {deleting === row.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="New Opportunity" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <Field label="Account *">
              <select className="input" value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Select an account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Name *">
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Amount (INR)">
              <input className="input" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Stage">
              <select className="input" value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Create Opportunity"}</button>
            </div>
          </div>
        </Modal>
      )}

      {selected && !editOpen && (
        <DetailDrawer
          title={selected.name}
          subtitle="Opportunity"
          onClose={() => setSelected(null)}
          onEdit={() => openEdit(selected)}
          onDelete={() => deleteOpportunity(selected.id)}
          deleting={deleting === selected.id}
          fields={[
            { label: "Account", value: accountName(selected.account_id) },
            { label: "Stage", value: selected.stage },
            { label: "Amount", value: inrLakh(Number(selected.amount || 0)) },
            { label: "Probability", value: selected.probability != null ? `${selected.probability}%` : null },
            { label: "Close date", value: shortDate(selected.close_date) },
          ]}
        />
      )}

      {editOpen && selected && (
        <Modal title="Edit Opportunity" onClose={() => setEditOpen(false)}>
          <div className="space-y-3">
            {editErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{editErr}</div>}
            <Field label="Account *">
              <select className="input" value={editForm.account_id} onChange={(e) => setEditForm({ ...editForm, account_id: e.target.value })}>
                <option value="">Select an account…</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Name *">
              <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </Field>
            <Field label="Amount (INR)">
              <input className="input" type="number" min={0} step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} />
            </Field>
            <Field label="Stage">
              <select className="input" value={editForm.stage} onChange={(e) => setEditForm({ ...editForm, stage: e.target.value })}>
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Probability %">
              <input className="input" type="number" min={0} max={100} value={editForm.probability} onChange={(e) => setEditForm({ ...editForm, probability: e.target.value })} />
            </Field>
            <Field label="Close date">
              <input className="input" type="date" value={editForm.close_date} onChange={(e) => setEditForm({ ...editForm, close_date: e.target.value })} />
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
