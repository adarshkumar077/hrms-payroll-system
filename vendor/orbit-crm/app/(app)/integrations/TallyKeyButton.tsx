"use client";

import { useState, useTransition } from "react";
import { generateTallyKeyAction, type GenerateTallyKeyResult } from "./actions";

// Generate/regenerate the Tally connector token. The plaintext is only ever
// shown here, once, right after generation — it's never re-fetchable (only
// its sha256 hash is stored server-side).
export function TallyKeyButton({ hasKey }: { hasKey: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<GenerateTallyKeyResult | null>(null);
  const [copied, setCopied] = useState(false);

  function handleClick() {
    setResult(null);
    setCopied(false);
    start(async () => {
      const r = await generateTallyKeyAction();
      setResult(r);
    });
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
    } catch {
      // Clipboard API unavailable — the token is still selectable/visible in the box below.
    }
  }

  return (
    <div>
      <button className="btn text-xs py-1" disabled={pending} onClick={handleClick}>
        {pending ? "Generating…" : hasKey ? "Regenerate key" : "Generate key"}
      </button>

      {result && !result.ok && (
        <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {result.error}
        </div>
      )}

      {result && result.ok && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1.5">
          <div className="font-semibold">New connector key — copy it now, it won&apos;t be shown again.</div>
          <code className="block w-full break-all rounded bg-white/70 border border-amber-200 px-2 py-1.5 font-mono text-[11px] text-slate-800">
            {result.token}
          </code>
          <button type="button" className="btn-ghost text-xs py-0.5" onClick={() => copyToken(result.token)}>
            {copied ? "Copied ✓" : "Copy to clipboard"}
          </button>
          <p className="text-amber-800">
            Set this as <code className="font-mono">ORBIT_CONNECTOR_KEY</code> in the connector&apos;s environment.
          </p>
        </div>
      )}
    </div>
  );
}
