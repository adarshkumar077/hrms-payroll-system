"use client";

import { useTransition } from "react";
import { rescoreAllLeadsAction } from "./actions";

export function RescoreButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn"
      disabled={pending || count === 0}
      onClick={() => start(() => rescoreAllLeadsAction())}
    >
      {pending ? "Re-scoring…" : `✨ Re-score all${count ? ` (${count})` : ""}`}
    </button>
  );
}
