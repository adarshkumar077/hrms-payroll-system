"use client";

import { useState, useTransition } from "react";
import { createBillAction } from "./actions";

export function NewBillForm() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New bill
      </button>
    );
  }

  return (
    <div className="card p-4 w-full max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">New vendor bill</h3>
        <button className="btn-ghost text-xs py-1" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <form
        action={(fd) => start(async () => { await createBillAction(fd); setOpen(false); })}
        className="grid grid-cols-2 gap-3"
      >
        <div>
          <label className="label">Vendor</label>
          <input name="vendor" required className="input" placeholder="Vendor name" />
        </div>
        <div>
          <label className="label">Bill number</label>
          <input name="billNumber" required className="input" placeholder="e.g. VB-1001" />
        </div>

        <div>
          <label className="label">GSTIN (optional)</label>
          <input name="gstin" className="input" placeholder="Vendor GSTIN" />
        </div>
        <div>
          <label className="label">Due date</label>
          <input name="dueDate" type="date" className="input" />
        </div>

        <div className="col-span-2 border-t border-slate-100 pt-3">
          <label className="label">Line item (optional)</label>
          <input name="description" className="input" placeholder="Description" />
        </div>

        <div>
          <label className="label">Qty</label>
          <input name="qty" type="number" min={1} defaultValue={1} className="input" />
        </div>
        <div>
          <label className="label">Unit price</label>
          <input name="unitPrice" type="number" min={0} step="0.01" defaultValue={0} className="input" />
        </div>
        <div>
          <label className="label">Tax rate %</label>
          <input name="taxRate" type="number" min={0} step="0.01" defaultValue={18} className="input" />
        </div>

        <div className="col-span-2 flex justify-end">
          <button className="btn" disabled={pending}>
            {pending ? "Creating…" : "Create bill"}
          </button>
        </div>
      </form>
    </div>
  );
}
