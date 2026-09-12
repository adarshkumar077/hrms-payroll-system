"use client";

import { useTransition } from "react";
import { moveStageAction } from "./actions";

export function MoveStageButton({ oppId }: { oppId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn-ghost text-xs py-1 w-full"
      disabled={pending}
      onClick={() => start(() => moveStageAction(oppId))}
    >
      {pending ? "…" : "Advance →"}
    </button>
  );
}
