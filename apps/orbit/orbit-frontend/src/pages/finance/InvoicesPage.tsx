import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError, inr, inrLakh, shortDate } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";
import { Modal, Field } from "../../components/Modal";

type InvoiceLine = {
  id?: string;
  description: string;
  hsn?: string | null;
  qty: number;
  unit_price: number;
  tax_rate: number;
  line_total?: number;
};

type Invoice = {
  id: string;
  number: string;
  invoice_type: "B2B" | "B2C";
  place_of_supply?: string | null;
  account_id: string;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  grand_total: number;
  status: "Draft" | "Finalized" | "Paid";
  irn?: string | null;
  ack_no?: string | null;
  eway_bill_no?: string | null;
  lines?: InvoiceLine[];
};

type Account = { id: string; name: string; state?: string | null; gstin?: string | null };

type InvoicePayment = {
  id: string;
  amount: number;
  method: string;
  reference?: string | null;
  receipt_no?: string | null;
  status?: string;
  created_at?: string | null;
};

type InvoiceDetail = Invoice & {
  created_at?: string | null;
  lines: InvoiceLine[];
  payments?: InvoicePayment[];
};

const emptyLine = (): InvoiceLine => ({ description: "", hsn: "", qty: 1, unit_price: 0, tax_rate: 18 });

const statusBadge: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-600",
  Finalized: "bg-amber-100 text-amber-700",
  Paid: "bg-emerald-100 text-emerald-700",
};

export function InvoicesPage() {
  const [rows, setRows] = useState<Invoice[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [invoiceType, setInvoiceType] = useState<"B2B" | "B2C">("B2B");
  const [lines, setLines] = useState<InvoiceLine[]>([emptyLine()]);
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("Manual");
  const [payReference, setPayReference] = useState("");
  const [payErr, setPayErr] = useState("");
  const [paying, setPaying] = useState(false);

  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState("");

  const [viewId, setViewId] = useState<string | null>(null);
  const [viewInv, setViewInv] = useState<InvoiceDetail | null>(null);
  const [viewErr, setViewErr] = useState("");
  const [viewLoading, setViewLoading] = useState(false);

  function load() {
    setErr("");
    apiGet<any>("/finance/invoices")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
    apiGet<any>("/crm/accounts?per_page=100")
      .then((r) => setAccounts(Array.isArray(r) ? r : r?.data ?? []))
      .catch(() => {});
  }, []);

  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name || id;

  function openModal() {
    setAccountId(accounts[0]?.id || "");
    setInvoiceType("B2B");
    setLines([emptyLine()]);
    setFormErr("");
    setOpen(true);
  }

  function updateLine(i: number, patch: Partial<InvoiceLine>) {
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
    if (!accountId) {
      setFormErr("Select an account.");
      return;
    }
    if (lines.some((l) => !l.description.trim() || Number(l.qty) <= 0 || Number(l.unit_price) < 0)) {
      setFormErr("Every line needs a description, qty > 0 and a non-negative unit price.");
      return;
    }
    setSaving(true);
    setFormErr("");
    try {
      await apiPost("/finance/invoices", {
        account_id: accountId,
        invoice_type: invoiceType,
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
      setFormErr(e instanceof ApiError ? e.message : "Failed to create invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function finalize(inv: Invoice) {
    setRowErr("");
    setRowBusy(inv.id);
    try {
      await apiPost(`/finance/invoices/${inv.id}/finalize`);
      load();
    } catch (e: any) {
      setRowErr(e instanceof ApiError ? e.message : "Failed to finalize invoice.");
    } finally {
      setRowBusy(null);
    }
  }

  function openPay(inv: Invoice) {
    setPayFor(inv);
    setPayAmount(String(inv.grand_total));
    setPayMethod("Manual");
    setPayReference("");
    setPayErr("");
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payFor) return;
    setPaying(true);
    setPayErr("");
    try {
      await apiPost(`/finance/invoices/${payFor.id}/payments`, {
        amount: payAmount ? Number(payAmount) : undefined,
        method: payMethod,
        reference: payReference.trim() || undefined,
      });
      setPayFor(null);
      load();
    } catch (e: any) {
      setPayErr(e instanceof ApiError ? e.message : "Failed to record payment.");
    } finally {
      setPaying(false);
    }
  }

  function openView(id: string) {
    setViewId(id);
    setViewInv(null);
    setViewErr("");
    setViewLoading(true);
    apiGet<InvoiceDetail>(`/finance/invoices/${id}`)
      .then(setViewInv)
      .catch((e) => setViewErr(e instanceof ApiError ? e.message : "Failed to load invoice."))
      .finally(() => setViewLoading(false));
  }

  const totalInvoiced = (rows || []).reduce((s, r) => s + Number(r.grand_total || 0), 0);
  const taxCollected = (rows || []).reduce((s, r) => s + Number(r.cgst || 0) + Number(r.sgst || 0) + Number(r.igst || 0), 0);
  const receivables = (rows || []).filter((r) => r.status === "Finalized").reduce((s, r) => s + Number(r.grand_total || 0), 0);

  return (
    <div>
      <PageHeader
        title="GST Invoices"
        subtitle={rows ? `${rows.length} invoice${rows.length === 1 ? "" : "s"}` : undefined}
        action={
          <button className="btn" onClick={openModal}>
            + New Invoice
          </button>
        }
      />

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <StatCard label="Total Invoiced" value={inrLakh(totalInvoiced)} accent="brand" />
          <StatCard label="Tax Collected" value={inrLakh(taxCollected)} accent="blue" />
          <StatCard label="Receivables" value={inrLakh(receivables)} hint="Finalized, awaiting payment" accent="amber" />
        </div>
      )}

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      {rowErr && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{rowErr}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Number</th>
              <th className="th">Account</th>
              <th className="th">Type</th>
              <th className="th">Grand Total</th>
              <th className="th">Status</th>
              <th className="th">e-Invoice</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  No invoices yet.
                </td>
              </tr>
            )}
            {(rows || []).map((inv) => (
              <tr key={inv.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openView(inv.id)}>
                <td className="td font-medium text-slate-800">{inv.number}</td>
                <td className="td">{accountName(inv.account_id)}</td>
                <td className="td">{inv.invoice_type}</td>
                <td className="td">{inr(Number(inv.grand_total || 0))}</td>
                <td className="td">
                  <span className={`badge ${statusBadge[inv.status] || ""}`}>{inv.status}</span>
                </td>
                <td className="td">
                  {inv.irn ? (
                    <span className="badge bg-emerald-100 text-emerald-700">IRN ✓</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="td" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-2">
                    {inv.status === "Draft" && (
                      <button
                        className="btn-ghost text-xs py-1 px-2"
                        disabled={rowBusy === inv.id}
                        onClick={() => finalize(inv)}
                      >
                        {rowBusy === inv.id ? "Finalizing…" : "Finalize"}
                      </button>
                    )}
                    {inv.status === "Finalized" && (
                      <button className="btn-ghost text-xs py-1 px-2" onClick={() => openPay(inv)}>
                        Record payment
                      </button>
                    )}
                    {inv.status === "Paid" && <span className="text-slate-300 text-xs">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title="New Invoice" onClose={() => setOpen(false)} wide>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Account">
                <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.state ? ` (${a.state})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice Type">
                <select className="input" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as "B2B" | "B2C")}>
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                </select>
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
                {saving ? "Creating…" : "Create Invoice"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {payFor && (
        <Modal title={`Record Payment — ${payFor.number}`} onClose={() => setPayFor(null)}>
          <form onSubmit={submitPayment} className="space-y-4">
            <Field label="Amount (₹)">
              <input
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </Field>
            <Field label="Method">
              <select className="input" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="Manual">Manual</option>
                <option value="UPI">UPI</option>
                <option value="Razorpay">Razorpay</option>
                <option value="NEFT">NEFT</option>
                <option value="Cash">Cash</option>
              </select>
            </Field>
            <Field label="Reference">
              <input
                className="input"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="UTR / transaction id"
              />
            </Field>
            {payErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{payErr}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setPayFor(null)}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={paying}>
                {paying ? "Recording…" : "Record Payment"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewId && (
        <Modal title="Tax Invoice" onClose={() => setViewId(null)} wide>
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #invoice-print-area, #invoice-print-area * { visibility: visible; }
              #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
              .no-print { display: none !important; }
            }
          `}</style>

          {viewLoading && <div className="text-sm text-slate-400 py-6 text-center">Loading invoice…</div>}
          {viewErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{viewErr}</div>}

          {!viewLoading && viewInv && (
            <div id="invoice-print-area" className="space-y-5">
              <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                <div>
                  <div className="text-lg font-bold text-slate-900">{viewInv.number}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{shortDate(viewInv.created_at)}</div>
                </div>
                <div className="text-right">
                  <span className={`badge ${statusBadge[viewInv.status] || ""}`}>{viewInv.status}</span>
                  <div className="text-xs text-slate-500 mt-1">{viewInv.invoice_type}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="label mb-0.5">Billed To</div>
                  <div className="text-slate-800 font-medium">{accountName(viewInv.account_id)}</div>
                </div>
                <div>
                  <div className="label mb-0.5">Place of Supply</div>
                  <div className="text-slate-800">{viewInv.place_of_supply || "—"}</div>
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
                    {(viewInv.lines || []).map((l, i) => (
                      <tr key={l.id || i}>
                        <td className="td">{l.description}</td>
                        <td className="td">{l.hsn || "—"}</td>
                        <td className="td">{l.qty}</td>
                        <td className="td">{inr(Number(l.unit_price || 0))}</td>
                        <td className="td">{Number(l.tax_rate || 0)}%</td>
                        <td className="td">{inr(Number(l.line_total ?? Number(l.qty || 0) * Number(l.unit_price || 0)))}</td>
                      </tr>
                    ))}
                    {(!viewInv.lines || viewInv.lines.length === 0) && (
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
                    <span className="text-slate-800">{inr(Number(viewInv.subtotal || 0))}</span>
                  </div>
                  {Number(viewInv.igst || 0) > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-slate-500">IGST</span>
                      <span className="text-slate-800">{inr(Number(viewInv.igst || 0))}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">CGST</span>
                        <span className="text-slate-800">{inr(Number(viewInv.cgst || 0))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">SGST</span>
                        <span className="text-slate-800">{inr(Number(viewInv.sgst || 0))}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-semibold text-slate-900">
                    <span>Grand Total</span>
                    <span>{inr(Number(viewInv.grand_total || 0))}</span>
                  </div>
                </div>
              </div>

              {viewInv.irn && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm">
                  <div className="font-medium text-emerald-800 mb-1">e-Invoice</div>
                  <div className="grid grid-cols-3 gap-2 text-emerald-700">
                    <div>
                      <div className="text-xs text-emerald-600">IRN</div>
                      <div className="break-all">{viewInv.irn}</div>
                    </div>
                    <div>
                      <div className="text-xs text-emerald-600">Ack No</div>
                      <div>{viewInv.ack_no || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-emerald-600">e-Way Bill</div>
                      <div>{viewInv.eway_bill_no || "—"}</div>
                    </div>
                  </div>
                </div>
              )}

              {viewInv.payments && viewInv.payments.length > 0 && (
                <div>
                  <div className="label mb-1">Payments</div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="th">Receipt</th>
                          <th className="th">Date</th>
                          <th className="th">Method</th>
                          <th className="th">Reference</th>
                          <th className="th">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewInv.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="td">{p.receipt_no || "—"}</td>
                            <td className="td">{shortDate(p.created_at)}</td>
                            <td className="td">{p.method}</td>
                            <td className="td">{p.reference || "—"}</td>
                            <td className="td">{inr(Number(p.amount || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="no-print flex justify-end gap-2 pt-4 mt-2 border-t border-slate-200">
            <button type="button" className="btn-ghost" onClick={() => setViewId(null)}>
              Close
            </button>
            <button type="button" className="btn" disabled={!viewInv} onClick={() => window.print()}>
              Print / Save PDF
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
