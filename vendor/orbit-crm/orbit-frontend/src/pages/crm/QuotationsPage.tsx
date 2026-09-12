import { useEffect, useState } from "react";
import { apiGet, apiPost, apiDelete, ApiError, inr } from "../../lib/api";
import { PageHeader } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

type Opportunity = {
  id: string;
  name: string;
};

type Quotation = {
  id: string;
  number: string;
  opportunity_id: string;
  status?: string | null;
  subtotal?: number | null;
  tax_total?: number | null;
  discount?: number | null;
  grand_total?: number | null;
};

const emptyForm = { number: "", opportunity_id: "", status: "", subtotal: "", tax_total: "", discount: "", grand_total: "" };

// Quotations list: search + create modal + delete.
export function QuotationsPage() {
  const [rows, setRows] = useState<Quotation[] | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = () => {
    setErr("");
    apiGet<any>("/crm/quotations")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  };

  const loadOpportunities = () => {
    apiGet<any>("/crm/opportunities")
      .then((r) => setOpportunities(Array.isArray(r) ? r : r?.data ?? []))
      .catch(() => setOpportunities([]));
  };

  useEffect(() => {
    load();
    loadOpportunities();
  }, []);

  const filtered = (rows || []).filter((row) =>
    !q ||
    [row.number, row.status].some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  const getOpportunityName = (opportunityId: string) => {
    return opportunities.find((o) => o.id === opportunityId)?.name || opportunityId;
  };

  async function submit() {
    setFormErr("");
    if (!form.number.trim()) { setFormErr("Quotation number is required."); return; }
    if (!form.opportunity_id.trim()) { setFormErr("Opportunity is required."); return; }
    setSaving(true);
    try {
      await apiPost("/crm/quotations", {
        number: form.number,
        opportunity_id: form.opportunity_id,
        status: form.status || null,
        subtotal: form.subtotal ? parseFloat(form.subtotal) : null,
        tax_total: form.tax_total ? parseFloat(form.tax_total) : null,
        discount: form.discount ? parseFloat(form.discount) : null,
        grand_total: form.grand_total ? parseFloat(form.grand_total) : null,
      });
      setOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create quotation.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteQuotation(id: string) {
    if (!confirm("Delete this quotation?")) return;
    setDeleting(id);
    try {
      await apiDelete(`/crm/quotations/${id}`);
      load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to delete quotation.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle={rows ? `${rows.length} record${rows.length === 1 ? "" : "s"} · live from Laravel` : undefined}
        action={<button className="btn" onClick={() => { setForm(emptyForm); setFormErr(""); setOpen(true); }}>+ New Quotation</button>}
      />
      <div className="mb-3 max-w-xs">
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Number</th>
              <th className="th">Opportunity</th>
              <th className="th">Status</th>
              <th className="th">Grand Total</th>
              <th className="th">Action</th>
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
              <tr key={row.id}>
                <td className="td font-medium text-slate-800">{row.number}</td>
                <td className="td text-sm text-slate-600">{getOpportunityName(row.opportunity_id)}</td>
                <td className="td text-sm"><span className="badge">{row.status || "—"}</span></td>
                <td className="td text-sm font-medium">{row.grand_total ? inr(row.grand_total) : <span className="text-slate-300">—</span>}</td>
                <td className="td">
                  <button
                    className="btn-ghost text-xs py-1 text-rose-600 hover:text-rose-700 disabled:opacity-50"
                    onClick={() => deleteQuotation(row.id)}
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
        <Modal title="New Quotation" onClose={() => setOpen(false)}>
          <div className="space-y-3">
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <Field label="Quotation Number *">
              <input className="input" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
            </Field>
            <Field label="Opportunity *">
              <select className="input" value={form.opportunity_id} onChange={(e) => setForm({ ...form, opportunity_id: e.target.value })}>
                <option value="">Choose opportunity…</option>
                {opportunities.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <input className="input" placeholder="e.g., Draft, Sent, Accepted" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
            </Field>
            <Field label="Subtotal">
              <input className="input" type="number" step="0.01" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} />
            </Field>
            <Field label="Tax Total">
              <input className="input" type="number" step="0.01" value={form.tax_total} onChange={(e) => setForm({ ...form, tax_total: e.target.value })} />
            </Field>
            <Field label="Discount">
              <input className="input" type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
            </Field>
            <Field label="Grand Total">
              <input className="input" type="number" step="0.01" value={form.grand_total} onChange={(e) => setForm({ ...form, grand_total: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn" disabled={saving} onClick={submit}>{saving ? "Saving…" : "Create Quotation"}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
