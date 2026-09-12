"use client";

import { useState, useTransition } from "react";
import { upgradePlanAction, type UpgradeResult } from "./actions";

export function UpgradeButton({
  plan,
  planName,
  isCurrent,
  isDowngrade,
  razorpayConfigured,
}: {
  plan: string;
  planName: string;
  isCurrent: boolean;
  isDowngrade: boolean;
  razorpayConfigured: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<UpgradeResult | null>(null);

  if (isCurrent) {
    return <span className="badge bg-emerald-100 text-emerald-700 w-full justify-center py-1.5">Current plan</span>;
  }

  return (
    <div className="space-y-2">
      <button
        className={`${isDowngrade ? "btn-ghost" : "btn"} w-full justify-center`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const fd = new FormData();
            fd.set("plan", plan);
            const r = await upgradePlanAction(fd);
            setResult(r);
          })
        }
      >
        {pending ? "…" : isDowngrade ? `Switch to ${planName}` : `Upgrade to ${planName}`}
      </button>

      {result && result.ok && result.mode === "checkout" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <div className="font-semibold">Razorpay order created</div>
          <div className="mt-0.5 font-mono break-all">{result.orderId}</div>
          <p className="mt-1 text-blue-700">
            Open Razorpay Checkout with this order id to pay. The plan activates automatically once
            our webhook verifies the payment — no action needed here after that.
          </p>
        </div>
      )}

      {result && result.ok && result.mode === "manual" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Plan updated to {planName}.
        </div>
      )}

      {result && !result.ok && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          No change applied.
        </div>
      )}
    </div>
  );
}
