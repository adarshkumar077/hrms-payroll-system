"use client";

import { useTransition } from "react";
import { runPayrollAction, lockRunAction, markPaidAction } from "./actions";

// Prominent primary action — draft the next month's payroll run.
export function RunPayrollButton({ nextLabel }: { nextLabel: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn" disabled={pending} onClick={() => start(() => runPayrollAction())}>
      {pending ? "Running…" : `▶ Run payroll for ${nextLabel}`}
    </button>
  );
}

// Per-row status transition buttons. Draft → Lock, Locked → Mark paid.
export function RunStatusActions({ runId, status }: { runId: string; status: string }) {
  const [pending, start] = useTransition();

  if (status === "Draft") {
    return (
      <button
        className="btn-ghost text-xs py-1"
        disabled={pending}
        onClick={() => start(() => lockRunAction(runId))}
      >
        {pending ? "…" : "🔒 Lock"}
      </button>
    );
  }
  if (status === "Locked") {
    return (
      <button
        className="btn-ghost text-xs py-1"
        disabled={pending}
        onClick={() => start(() => markPaidAction(runId))}
      >
        {pending ? "…" : "✓ Mark paid"}
      </button>
    );
  }
  return <span className="text-xs text-slate-400">Paid</span>;
}
