"use client";

import { useTransition } from "react";
import { markAllReadAction } from "./actions";

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => markAllReadAction())}
      disabled={pending}
      className="btn btn-ghost text-sm"
    >
      {pending ? "Marking..." : "Mark all read"}
    </button>
  );
}
