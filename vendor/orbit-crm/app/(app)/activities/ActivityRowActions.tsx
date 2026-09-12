"use client";

import { useState, useTransition } from "react";
import { toggleActivityDoneAction, reassignActivityAction } from "./actions";

export function ActivityRowActions({
  activityId,
  done,
  ownerId,
  ownerOptions,
}: {
  activityId: string;
  done: boolean;
  ownerId: string | null;
  ownerOptions: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2 justify-end">
      {error && <span className="text-xs text-rose-600">{error}</span>}
      <select
        className="input py-1 text-xs w-auto"
        value={ownerId ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          start(async () => {
            const res = await reassignActivityAction(activityId, next);
            setError(res?.error ?? null);
          });
        }}
      >
        <option value="">— Unassigned —</option>
        {ownerOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button
        className={`btn-ghost text-xs py-1 ${done ? "text-emerald-700" : ""}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await toggleActivityDoneAction(activityId);
            setError(res?.error ?? null);
          })
        }
      >
        {pending ? "…" : done ? "✓ Done" : "Mark done"}
      </button>
    </div>
  );
}
