"use client";

import { useState, useTransition } from "react";
import { finalizeInvoiceAction, markPaidAction, recordPaymentAction } from "./actions";

export function InvoiceActions({ invoiceId, status }: { invoiceId: string; status: string }) {
  const [pending, start] = useTransition();
  const [recording, setRecording] = useState(false);

  return (
    <div className="flex items-center gap-2 justify-end">
      {status === "Draft" && (
        <button
          className="btn-ghost text-xs py-1"
          disabled={pending}
          onClick={() => start(() => finalizeInvoiceAction(invoiceId))}
          title="Lock invoice & generate IRN / e-way bill if mandated"
        >
          {pending ? "…" : "Finalize"}
        </button>
      )}

      {status === "Finalized" && !recording && (
        <>
          <button
            className="btn-ghost text-xs py-1"
            disabled={pending}
            onClick={() => setRecording(true)}
            title="Record a payment & generate a receipt"
          >
            Record payment
          </button>
          <button
            className="btn-ghost text-xs py-1 text-slate-400"
            disabled={pending}
            onClick={() => start(() => markPaidAction(invoiceId))}
            title="Mark paid without recording a receipt"
          >
            {pending ? "…" : "Mark paid"}
          </button>
        </>
      )}

      {status === "Finalized" && recording && (
        <form
          action={(fd) => start(() => recordPaymentAction(fd))}
          className="flex items-center gap-1.5"
          onSubmit={() => setRecording(false)}
        >
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <select name="method" className="input text-xs py-1 w-24" defaultValue="UPI">
            <option value="UPI">UPI</option>
            <option value="NEFT">NEFT</option>
            <option value="Cash">Cash</option>
            <option value="Razorpay">Razorpay</option>
            <option value="Manual">Manual</option>
          </select>
          <input
            name="reference"
            placeholder="Ref / UTR"
            className="input text-xs py-1 w-28"
            autoComplete="off"
          />
          <button type="submit" className="btn text-xs py-1" disabled={pending}>
            {pending ? "…" : "Save"}
          </button>
          <button
            type="button"
            className="btn-ghost text-xs py-1"
            disabled={pending}
            onClick={() => setRecording(false)}
          >
            Cancel
          </button>
        </form>
      )}

      {status === "Paid" && <span className="text-xs text-emerald-600">✓ Settled</span>}
    </div>
  );
}
