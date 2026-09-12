import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError, inr, inrLakh, shortDate } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

type BillLine = {
  id?: string;
  description: string;
  hsn?: string | null;
  qty: number;
  unit_price: number;
  tax_rate: number;
  line_total?: number;
};

type Bill = {
  id: string;
  vendor: string;
  gstin?: string | null;
  bill_number: string;
  date?: string | null;
  due_date?: string | null;
  subtotal: number;
  tax: number;
  total: number;
  status: "Draft" | "Approved" | "Paid";
  source?: string;
  lines?: BillLine[];
};

type BillDetail = Bill & {
  created_at?: string | null;
  lines: BillLine[];
};

const emptyLine = (): BillLine => ({ description: "", hsn: "", qty: 1, unit_price: 0, tax_rate: 18 });

const statusBadge: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600",
  Approved: "bg-amber-100 text-amber-700",
  Paid: "bg-emerald-100 text-emerald-700",
};

// GL postings happen automatically on approve (Dr 5200 / Cr 2000) and pay (Dr 2000 / Cr 1010) —
// see VendorBillController@approve/@pay. There's no separate GL-status field on the bill, so this
// is derived from the bill's own status.
const glStatus: Record<string, { label: string; detail: string; cls: string }> = {
  Draft: { label: "Not posted", detail: "Posts to GL when the bill is approved.", cls: "bg-slate-100 text-slate-600" },
  Approved: { label: "Posted", detail: "Dr 5200 Operating Expense / Cr 2000 Accounts Payable", cls: "bg-amber-100 text-amber-700" },
  Paid: { label: "Posted", detail: "Dr 5200/Cr 2000 on approval, then Dr 2000 Accounts Payable / Cr 1010 Bank on payment", cls: "bg-emerald-100 text-emerald-700" },
};

export function BillsPage() {
  const [rows, setRows] = useState<Bill[] | null>(null);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState("");
  const [gstin, setGstin] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<BillLine[]>([emptyLine()]);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState("");

  const [viewId, setViewId] = useState<string | null>(null);
  const [viewBill, setViewBill] = useState<BillDetail | null>(null);
  const [viewErr, setViewErr] = useState("");
  const [viewLoading, setViewLoading] = useState(false);

  function load() {
    setErr("");
    apiGet<any>("/finance/bills")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  function openModal() {
    setVendor("");
    setGstin("");
    setBillNumber("");
    setDueDate("");
    setLines([emptyLine()]);
    setFormErr("");
    setOpen(true);
  }

  function updateLine(i: number, patch: Partial<BillLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((ls) => [...ls, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls));
  }

  const preview = lines.reduce(
    (acc, l) => {
      const base = Number(l.qty || 0) * Number(l.unit_price || 0);
      const tax = base * (Number(l.tax_rate || 0) / 100);
      return { subtotal: acc.subtotal + base, tax: acc.tax + tax };
    },
    { subtotal: 0, tax: 0 }
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor.trim()) {
      setFormErr("Vendor is required.");
      return;
    }
    if (!billNumber.trim()) {
      setFormErr("Bill number is required.");
      return;
    }
    if (lines.some((l) => !l.description.trim() || Number(l.qty) <= 0 || Number(l.unit_price) < 0)) {
      setFormErr("Every line needs a description, qty > 0 and a non-negative unit price.");
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      await apiPost("/finance/bills", {
        vendor: vendor.trim(),
        gstin: gstin.trim() || undefined,
        bill_number: billNumber.trim(),
        due_date: dueDate || undefined,
        lines: lines.map((l) => ({
          description: l.description.trim(),
          hsn: l.hsn?.trim() || undefined,
          qty: Number(l.qty),
          unit_price: Number(l.unit_price),
          tax_rate: Number(l.tax_rate),
        })),
      });
      setOpen(false);
      load();
    } catch (e: any) {
      setFormErr(e instanceof ApiError ? e.message : "Failed to create bill.");
    } finally {
      setSaving(false);
    }
  }

  async function approve(bill: Bill) {
    setRowErr("");
    setRowBusy(bill.id);
    try {
      await apiPost(`/finance/bills/${bill.id}/approve`);
      load();
    } catch (e: any) {
      setRowErr(e instanceof ApiError ? e.message : "Failed to approve bill.");
    } finally {
      setRowBusy(null);
    }
  }

  async function pay(bill: Bill) {
    setRowErr("");
    setRowBusy(bill.id);
    try {
      await apiPost(`/finance/bills/${bill.id}/pay`);
      load();
    } catch (e: any) {
      setRowErr(e instanceof ApiError ? e.message : "Failed to pay bill.");
    } finally {
      setRowBusy(null);
    }
  }

  function openView(id: string) {
    setViewId(id);
    setViewBill(null);
    setViewErr("");
    setViewLoading(true);
    apiGet<BillDetail>(`/finance/bills/${id}`)
      .then(setViewBill)
      .catch((e) => setViewErr(e instanceof ApiError ? e.message : "Failed to load bill."))
      .finally(() => setViewLoading(false));
  }

  const totalBilled = (rows || []).reduce((s, r) => s + Number(r.total || 0), 0);
  const outstanding = (rows || [])
    .filter((r) => r.status !== "Paid")
    .reduce((s, r) => s + Number(r.total || 0), 0);
  const paid = (rows || []).filter((r) => r.status === "Paid").reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <div>
      <PageHeader
        title="Vendor Bills"
        subtitle={rows ? `${rows.length} bill${rows.length === 1 ? "" : "s"}` : undefined}
        action={
          <button className="btn" onClick={openModal}>
            + New Bill
          </button>
        }
      />

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <StatCard label="Total Billed" value={inrLakh(totalBilled)} accent="brand" />
          <StatCard label="Outstanding (AP)" value={inrLakh(outstanding)} accent="amber" />
          <StatCard label="Paid" value={inrLakh(paid)} accent="green" />
        </div>
      )}

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      {rowErr && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{rowErr}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Bill #</th>
              <th className="th">Vendor</th>
              <th className="th">Due Date</th>
              <th className="th">Total</th>
              <th className="th">Status</th>
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
                  No vendor bills yet.
                </td>
              </tr>
            )}
            {(rows || []).map((bill) => (
              <tr key={bill.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openView(bill.id)}>
                <td className="td font-medium text-slate-800">{bill.bill_number}</td>
                <td className="td">{bill.vendor}</td>
                <td className="td">
                  {bill.due_date ? new Date(bill.due_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : <span className="text-slate-300">—</span>}
                </td>
                <td className="td">{inr(Number(bill.total || 0))}</td>
                <td className="td">
                  <span className={`badge ${statusBadge[bill.status] || ""}`}>{bill.status}</span>
                </td>
                <td className="td" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    {bill.status === "Draft" && (
                      <button
                        className="btn-ghost text-xs py-1 px-2"
                        disabled={rowBusy === bill.id}
                        onClick={() => approve(bill)}
                      >
                        {rowBusy === bill.id ? "Approving…" : "Approve"}
                      </button>
                    )}
                    {bill.status === "Approved" && (
                      <button
                        className="btn-ghost text-xs py-1 px-2"
                        disabled={rowBusy === bill.id}
                        onClick={() => pay(bill)}
                      >
                        {rowBusy === bill.id ? "Paying…" : "Pay"}
                      </button>
                    )}
                    {bill.status === "Paid" && <span className="text-slate-300 text-xs">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="New Vendor Bill" onClose={() => setOpen(false)} wide>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Vendor">
                <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor name" autoFocus />
              </Field>
              <Field label="GSTIN">
                <input className="input" value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="29ABCDE1234F1Z5" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bill Number">
                <input className="input" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="BILL-1001" />
              </Field>
              <Field label="Due Date">
                <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Field>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Line Items</label>
                <button type="button" className="btn-ghost text-xs py-1 px-2" onClick={addLine}>
                  + Add Line
                </button>
              </div>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4">
                      <input
                        className="input"
                        placeholder="Description"
                        value={l.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        className="input"
                        placeholder="HSN"
                        value={l.hsn || ""}
                        onChange={(e) => updateLine(i, { hsn: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        className="input"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Qty"
                        value={l.qty}
                        onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Unit price"
                        value={l.unit_price}
                        onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-1">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Tax %"
                        value={l.tax_rate}
                        onChange={(e) => updateLine(i, { tax_rate: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-1">
                      <button
                        type="button"
                        className="text-slate-400 hover:text-rose-500 text-sm"
                        onClick={() => removeLine(i)}
                        disabled={lines.length === 1}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-sm text-slate-500 flex justify-end gap-4">
              <span>Subtotal: {inr(preview.subtotal)}</span>
              <span>Tax (approx): {inr(preview.tax)}</span>
              <span className="font-medium text-slate-700">Total: {inr(preview.subtotal + preview.tax)}</span>
            </div>

            {formErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{formErr}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={saving}>
                {saving ? "Creating…" : "Create Bill"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewId && (
        <Modal title="Vendor Bill" onClose={() => setViewId(null)} wide>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #bill-print-area, #bill-print-area * { visibility: visible; }
              #bill-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
              .no-print { display: none !important; }
            }
          `}</style>

          {viewLoading && <div className="text-sm text-slate-400 py-6 text-center">Loading bill…</div>}
          {viewErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{viewErr}</div>}

          {!viewLoading && viewBill && (
            <div id="bill-print-area" className="space-y-5">
              <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                <div>
                  <div className="text-lg font-bold text-slate-900">{viewBill.bill_number}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{shortDate(viewBill.date || viewBill.created_at)}</div>
                </div>
                <div className="text-right">
                  <span className={`badge ${statusBadge[viewBill.status] || ""}`}>{viewBill.status}</span>
                  {viewBill.due_date && <div className="text-xs text-slate-500 mt-1">Due {shortDate(viewBill.due_date)}</div>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="label mb-0.5">Vendor</div>
                  <div className="text-slate-800 font-medium">{viewBill.vendor}</div>
                  {viewBill.gstin && <div className="text-xs text-slate-500">{viewBill.gstin}</div>}
                </div>
                <div>
                  <div className="label mb-0.5">GL Posting</div>
                  <span className={`badge ${glStatus[viewBill.status]?.cls || ""}`}>{glStatus[viewBill.status]?.label || "—"}</span>
                  <div className="text-xs text-slate-500 mt-1">{glStatus[viewBill.status]?.detail}</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Description</th>
                      <th className="th">HSN</th>
                      <th className="th">Qty</th>
                      <th className="th">Unit Price</th>
                      <th className="th">Tax %</th>
                      <th className="th">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewBill.lines || []).map((l, i) => (
                      <tr key={l.id || i}>
                        <td className="td">{l.description}</td>
                        <td className="td">{l.hsn || "—"}</td>
                        <td className="td">{l.qty}</td>
                        <td className="td">{inr(Number(l.unit_price || 0))}</td>
                        <td className="td">{Number(l.tax_rate || 0)}%</td>
                        <td className="td">{inr(Number(l.line_total ?? Number(l.qty || 0) * Number(l.unit_price || 0)))}</td>
                      </tr>
                    ))}
                    {(!viewBill.lines || viewBill.lines.length === 0) && (
                      <tr>
                        <td className="td text-slate-400" colSpan={6}>
                          No line items.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <div className="w-full max-w-xs text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="text-slate-800">{inr(Number(viewBill.subtotal || 0))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tax</span>
                    <span className="text-slate-800">{inr(Number(viewBill.tax || 0))}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{inr(Number(viewBill.total || 0))}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="no-print flex justify-end gap-2 pt-4 mt-2 border-t border-slate-200">
            <button type="button" className="btn-ghost" onClick={() => setViewId(null)}>
              Close
            </button>
            <button type="button" className="btn" disabled={!viewBill} onClick={() => window.print()}>
              Print / Save PDF
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
