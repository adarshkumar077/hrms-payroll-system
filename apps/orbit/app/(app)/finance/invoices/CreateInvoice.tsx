"use client";

import { useState, useTransition } from "react";
import { inr } from "@/lib/format";
import { createInvoiceAction } from "./actions";

type AccountOpt = { id: string; name: string; state: string | null };
type ProductOpt = { id: string; name: string; unitPrice: number; taxRate: number; hsn: string | null };

const HOME_STATE = "Maharashtra";

export function CreateInvoice({ accounts, products }: { accounts: AccountOpt[]; products: ProductOpt[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState(1);

  const account = accounts.find((a) => a.id === accountId);
  const product = products.find((p) => p.id === productId);
  const intraState = account?.state === HOME_STATE;

  // Live preview of taxable value + tax split.
  const taxable = product ? product.unitPrice * qty : 0;
  const tax = product ? (taxable * product.taxRate) / 100 : 0;
  const grand = taxable + tax;

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New GST Invoice
      </button>
    );
  }

  return (
    <div className="card p-4 w-full max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">New GST Invoice</h3>
        <button className="btn-ghost text-xs py-1" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <form
        action={(fd) => start(async () => { await createInvoiceAction(fd); setOpen(false); })}
        className="grid grid-cols-2 gap-3"
      >
        <div className="col-span-2">
          <label className="label">Bill to (account)</label>
          <select name="accountId" className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.state || "?"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Product</label>
          <select name="productId" className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.taxRate}%)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Qty</label>
          <input
            name="qty"
            type="number"
            min={1}
            className="input"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          />
        </div>

        <div className="col-span-2 rounded-md bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Taxable value</span>
            <span>{inr(taxable)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>
              {intraState ? `CGST + SGST @ ${product?.taxRate ?? 0}%` : `IGST @ ${product?.taxRate ?? 0}%`}
            </span>
            <span>{inr(tax)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
            <span>Grand total</span>
            <span>{inr(grand)}</span>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {intraState ? "Intra-state supply → CGST + SGST" : "Inter-state supply → IGST"} · Place of supply:{" "}
            {account?.state || "—"}
          </div>
        </div>

        <div className="col-span-2 flex justify-end">
          <button className="btn" disabled={pending || !accountId || !productId}>
            {pending ? "Creating…" : "Create Invoice"}
          </button>
        </div>
      </form>
    </div>
  );
}
