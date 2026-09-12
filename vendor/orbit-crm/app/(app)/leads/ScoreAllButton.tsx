"use client";

import { useTransition } from "react";
import { scoreAllUnscoredAction } from "./actions";

export function ScoreAllButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn"
      disabled={pending || count === 0}
      onClick={() => start(() => scoreAllUnscoredAction())}
    >
      {pending ? "Scoring…" : `✨ Score all unscored${count ? ` (${count})` : ""}`}
    </button>
  );
}
