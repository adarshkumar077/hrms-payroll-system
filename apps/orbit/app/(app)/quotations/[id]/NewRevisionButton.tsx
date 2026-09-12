"use client";

import { useState, useTransition } from "react";
import { newRevisionAction } from "../actions";

export function NewRevisionButton({ quotationId, disabled }: { quotationId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="btn-ghost text-xs py-1.5"
        disabled={pending || disabled}
        title={disabled ? "Converted quotations are locked" : "Bump the revision number"}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await newRevisionAction(quotationId);
            if (res?.error) setError(res.error);
          });
        }}
      >
        {pending ? "…" : "+ New revision"}
      </button>
      {error && <div className="text-xs text-rose-600 mt-1">{error}</div>}
    </div>
  );
}
