"use client";

import { useState, useTransition } from "react";
import { clickToCallAction } from "@/app/(app)/calls/actions";

/**
 * Shared click-to-call control — dropped next to every phone display
 * (leads/[id], accounts/[id], contacts list). Two modes, chosen by the
 * server-rendered `live` prop (telephonyConfigured from lib/telephony.ts —
 * this component never reads env itself):
 *
 *   live=false  →  plain `tel:` anchor. Graceful degrade: no Exotel account
 *                  configured, so let the OS/device's own dialer handle it.
 *   live=true   →  button that calls clickToCallAction (Exotel Connect API)
 *                  with a pending state and an inline result/error message.
 */
export function CallButton({
  phone,
  live,
  size = "sm",
}: {
  phone: string | null | undefined;
  live: boolean;
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const trimmed = (phone || "").trim();
  if (!trimmed) return null;

  const sizeClass = size === "md" ? "text-base" : "text-sm";

  if (!live) {
    return (
      <a
        href={`tel:${trimmed}`}
        className={`${sizeClass} leading-none hover:opacity-70`}
        title={`Call ${trimmed}`}
        aria-label={`Call ${trimmed}`}
      >
        📞
      </a>
    );
  }

  function call() {
    setResult(null);
    start(async () => {
      const res = await clickToCallAction(trimmed);
      setResult("error" in res ? `Call failed: ${res.error}` : `Calling… (${res.sid})`);
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={call}
        disabled={pending}
        className={`${sizeClass} leading-none hover:opacity-70 disabled:opacity-50`}
        title={`Call ${trimmed}`}
        aria-label={`Call ${trimmed}`}
      >
        {pending ? "…" : "📞"}
      </button>
      {result && (
        <span className={`text-xs ${result.startsWith("Call failed") ? "text-rose-600" : "text-slate-500"}`}>{result}</span>
      )}
    </span>
  );
}
