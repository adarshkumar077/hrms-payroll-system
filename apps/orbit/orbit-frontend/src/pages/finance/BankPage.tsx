import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError, inr, inrLakh, shortDate } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

type BankTxn = {
  id: string;
  date: string;
  description: string;
  amount: number;
  direction: "credit" | "debit";
  reconciled: boolean;
  matched_type?: string | null;
  matched_id?: string | null;
};

const SAMPLE = `[
  { "date": "2026-07-01", "description": "Client payment - Acme Corp", "amount": 25000, "direction": "credit" },
  { "date": "2026-07-02", "description": "Office rent", "amount": -15000 }
]`;

export function BankPage() {
  const [rows, setRows] = useState<BankTxn[] | null>(null);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState("");

  function load() {
    setErr("");
    apiGet<any>("/finance/bank/transactions")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  function openModal() {
    setJson("");
    setFormErr("");
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let parsed: any;
    try {
      parsed = JSON.parse(json);
    } catch {
      setFormErr("That isn't valid JSON. Paste a JSON array of transactions.");
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setFormErr("Expected a non-empty JSON array of transactions.");
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      await apiPost("/finance/bank/import", { transactions: parsed });
      setOpen(false);
      load();
    } catch (e: any) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to import transactions.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleReconcile(txn: BankTxn) {
    setRowErr("");
    setRowBusy(txn.id);
    try {
      if (txn.reconciled) {
        await apiPost(`/finance/bank/transactions/${txn.id}/unreconcile`);
      } else {
        await apiPost(`/finance/bank/transactions/${txn.id}/reconcile`, { matched_type: "manual" });
      }
      load();
    } catch (e: any) {
      setRowErr(e instanceof ApiError ? e.message : "Failed to update reconciliation.");
    } finally {
      setRowBusy(null);
    }
  }

  const totalCredits = (rows || []).filter((r) => r.direction === "credit").reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalDebits = (rows || []).filter((r) => r.direction === "debit").reduce((s, r) => s + Number(r.amount || 0), 0);
  const unreconciled = (rows || []).filter((r) => !r.reconciled).length;

  return (
    <div>
      <PageHeader
        title="Bank"
        subtitle={rows ? `${rows.length} transaction${rows.length === 1 ? "" : "s"}` : undefined}
        action={
          <button className="btn" onClick={openModal}>
            + Import
          </button>
        }
      />

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <StatCard label="Total Credits" value={inrLakh(totalCredits)} accent="green" />
          <StatCard label="Total Debits" value={inrLakh(totalDebits)} accent="red" />
          <StatCard label="Unreconciled" value={String(unreconciled)} accent="amber" />
        </div>
      )}

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      {rowErr && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{rowErr}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Date</th>
              <th className="th">Description</th>
              <th className="th">Direction</th>
              <th className="th">Amount</th>
              <th className="th">Reconciled</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  No bank transactions yet.
                </td>
              </tr>
            )}
            {(rows || []).map((txn) => (
              <tr key={txn.id}>
                <td className="td">{shortDate(txn.date)}</td>
                <td className="td">{txn.description || <span className="text-slate-300">—</span>}</td>
                <td className="td">
                  <span className={`badge ${txn.direction === "credit" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {txn.direction}
                  </span>
                </td>
                <td className="td">{inr(Number(txn.amount || 0))}</td>
                <td className="td">
                  <span className={`badge ${txn.reconciled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {txn.reconciled ? "Reconciled" : "Unreconciled"}
                  </span>
                </td>
                <td className="td">
                  <button
                    className="btn-ghost text-xs py-1 px-2"
                    disabled={rowBusy === txn.id}
                    onClick={() => toggleReconcile(txn)}
                  >
                    {rowBusy === txn.id ? "Working…" : txn.reconciled ? "Unreconcile" : "Reconcile"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="Import Bank Transactions" onClose={() => setOpen(false)} wide>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Transactions (JSON array)">
              <textarea
                className="input font-mono text-xs"
                rows={10}
                value={json}
                onChange={(e) => setJson(e.target.value)}
                placeholder={SAMPLE}
              />
            </Field>
            <p className="text-xs text-slate-400">
              Each row needs <code>amount</code>; <code>date</code>, <code>description</code> and <code>direction</code>{" "}
              (<code>credit</code>/<code>debit</code>) are optional — direction defaults from the sign of amount when omitted.
            </p>
            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Importing…" : "Import"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
