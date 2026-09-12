"use client";

import { useState } from "react";
import Link from "next/link";

// Posts a realistic sample payload to the marketplace webhook and shows the
// created lead id. The sample payload is computed on the server (via
// samplePayload) and passed in, so this stays a thin client component.

type Result =
  | { ok: true; leadId: string; deduped: boolean; note?: string }
  | { ok: false; error: string };

export function SimulateButton({
  source,
  payload,
  webhookKey,
}: {
  source: string;
  payload: Record<string, any>;
  // Only set when MARKETPLACE_WEBHOOK_KEY is configured, so the simulated
  // request authenticates against the real header check.
  webhookKey?: string;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function simulate() {
    setPending(true);
    setResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (webhookKey) headers["x-orbit-key"] = webhookKey;
      const res = await fetch(`/api/marketplace/${source}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "Request failed." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button className="btn" onClick={simulate} disabled={pending}>
        {pending ? "Sending…" : "⚡ Simulate incoming lead"}
      </button>

      {result && result.ok && (
        <div className="mt-3 text-sm rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <div className="font-medium text-emerald-800">
            {result.deduped ? "Matched an existing lead (de-duped)" : "Lead captured"}
          </div>
          <div className="text-emerald-700 mt-0.5">
            id <code className="font-mono">{result.leadId}</code>
          </div>
          {result.note && <div className="text-emerald-600 mt-1 text-xs">{result.note}</div>}
          <Link href="/leads" className="text-brand-700 hover:underline mt-1 inline-block">
            View in Leads →
          </Link>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-3 text-sm rounded-lg bg-rose-50 border border-rose-200 p-3 text-rose-700">
          {result.error}
        </div>
      )}
    </div>
  );
}
