"use client";

import { useState, useTransition } from "react";
import { scoreLeadAction, advanceStatusAction, convertLeadAction } from "./actions";

// Standalone Convert control — reused by the list row (compact) and the lead
// detail page header (larger). Shows "✓ Converted" once lead.convertedAt is set.
export function ConvertButton({
  leadId,
  converted,
  size = "sm",
}: {
  leadId: string;
  converted: boolean;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (converted) {
    return <span className="text-xs font-medium text-emerald-700">✓ Converted</span>;
  }

  return (
    <div className={size === "sm" ? "inline-flex items-center gap-2" : "flex flex-col items-end gap-1"}>
      <button
        className={size === "sm" ? "btn-ghost text-xs py-1" : "btn"}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await convertLeadAction(leadId);
            setError(res?.error ?? null);
          })
        }
      >
        {pending ? "…" : "Convert"}
      </button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

export function LeadRowActions({
  leadId,
  status,
  statusOptions,
  converted,
}: {
  leadId: string;
  status: string;
  statusOptions: { value: string; label: string }[];
  converted: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2 justify-end">
      <button
        className="btn-ghost text-xs py-1"
        disabled={pending}
        onClick={() => start(() => scoreLeadAction(leadId))}
      >
        {pending ? "…" : "✨ Score with AI"}
      </button>
      <select
        className="input py-1 text-xs w-auto"
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(() => advanceStatusAction(leadId, next));
        }}
      >
        {statusOptions.map((st) => (
          <option key={st.value} value={st.value}>
            {st.label}
          </option>
        ))}
      </select>
      <ConvertButton leadId={leadId} converted={converted} />
    </div>
  );
}
