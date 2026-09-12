"use client";

import { useTransition } from "react";
import { approveBillAction, payBillAction } from "./actions";

export function BillActions({ billId, status }: { billId: string; status: string }) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2 justify-end">
      {status === "Draft" && (
        <button
          className="btn-ghost text-xs py-1"
          disabled={pending}
          onClick={() => start(() => approveBillAction(billId))}
          title="Approve bill & post to GL"
        >
          {pending ? "…" : "Approve"}
        </button>
      )}

      {status === "Approved" && (
        <button
          className="btn-ghost text-xs py-1"
          disabled={pending}
          onClick={() => start(() => payBillAction(billId))}
          title="Pay bill & post to GL"
        >
          {pending ? "…" : "Pay"}
        </button>
      )}

      {status === "Paid" && <span className="text-xs text-emerald-600">✓ Paid</span>}
    </div>
  );
}
