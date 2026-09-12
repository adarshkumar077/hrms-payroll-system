"use client";

import { useTransition } from "react";
import { reconcileAction, unreconcileAction } from "./actions";

// Suggested-match reconcile button: carries the pre-computed match ids from the RSC.
export function ReconcileMatchButton({
  txnId,
  matchedType,
  matchedId,
}: {
  txnId: string;
  matchedType: string;
  matchedId: string;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost text-xs py-1"
      disabled={pending}
      onClick={() => start(() => reconcileAction(txnId, matchedType, matchedId))}
    >
      {pending ? "…" : "Reconcile"}
    </button>
  );
}

// Manual reconcile: no matched payment, just marks the transaction as cleared.
export function MarkReconciledButton({ txnId }: { txnId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost text-xs py-1"
      disabled={pending}
      onClick={() => start(() => reconcileAction(txnId, "manual", null))}
    >
      {pending ? "…" : "Mark reconciled"}
    </button>
  );
}

export function UnreconcileButton({ txnId }: { txnId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost text-xs py-1"
      disabled={pending}
      onClick={() => start(() => unreconcileAction(txnId))}
    >
      {pending ? "…" : "Undo"}
    </button>
  );
}
