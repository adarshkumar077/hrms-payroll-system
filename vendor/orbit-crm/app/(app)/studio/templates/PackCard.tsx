"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { previewAction, applyAction, exportAction } from "./actions";
import type { StudioPack, PackDiff } from "@/lib/studio/packs";

/**
 * Orbit Studio — Industry Templates (WS8).
 * Inline diff rendering here is intentionally a small duplicate of
 * components/studio/PackDiffView.tsx rather than an import of it: this copy
 * renders client-side state coming back from a server action, while
 * PackDiffView stays a plain server-safe component reserved for RSC preview
 * surfaces (e.g. the interview flow). Same visual structure, two call sites.
 */

const KIND_TONE: Record<string, "brand" | "blue" | "amber" | "slate" | "green"> = {
  module: "blue",
  picklist: "brand",
  option: "amber",
  field: "green",
};

function DiffList({ title, items }: { title: string; items: { kind: string; summary: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <div className="text-[11px] font-semibold text-slate-600 mb-1">
        {title} <span className="text-slate-400 font-normal">({items.length})</span>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-slate-50 rounded-md px-2 py-1">
            <Badge tone={KIND_TONE[it.kind] ?? "slate"}>{it.kind}</Badge>
            <span>{it.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InlineDiff({ diff }: { diff: PackDiff }) {
  const total = diff.creates.length + diff.updates.length + diff.conflicts.length;
  if (total === 0) {
    return (
      <div className="mt-3 text-[11px] text-slate-400">
        Nothing to change — this pack is already applied or fully overlaps.
      </div>
    );
  }
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <DiffList title="Will add" items={diff.creates} />
      <DiffList title="Will update" items={diff.updates} />
      <DiffList title="Kept as-is (conflicts)" items={diff.conflicts} />
    </div>
  );
}

export function PackCard({ pack }: { pack: StudioPack }) {
  const [previewPending, startPreview] = useTransition();
  const [applyPending, startApply] = useTransition();
  const [diff, setDiff] = useState<PackDiff | null>(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moduleCount = Array.isArray(pack.modules) ? pack.modules.length : 0;
  const picklistCount = Array.isArray(pack.picklists) ? pack.picklists.length : 0;
  const fieldCount = Array.isArray(pack.fields) ? pack.fields.length : 0;
  const hasCounts = moduleCount > 0 || picklistCount > 0 || fieldCount > 0;

  const onPreview = () => {
    setError(null);
    startPreview(async () => {
      const res = await previewAction(pack.key);
      if ("error" in res) {
        setError(res.error);
      } else {
        setDiff(res.diff);
        setApplied(false);
      }
    });
  };

  const onApply = () => {
    const ok = window.confirm(
      `Apply the "${pack.name}" pack? This adds new fields, picklists & renames — anything you've already configured is left untouched.`
    );
    if (!ok) return;
    setError(null);
    startApply(async () => {
      const res = await applyAction(pack.key);
      if ("error" in res) {
        setError(res.error);
      } else {
        setDiff(res.diff);
        setApplied(true);
      }
    });
  };

  const busy = previewPending || applyPending;

  return (
    <div className={`card p-4 ${busy ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-slate-800">{pack.name}</div>
        <Badge tone="brand">{pack.industry}</Badge>
      </div>
      <p className="text-xs text-slate-500 mt-2">{pack.description}</p>

      {hasCounts && (
        <div className="text-[11px] text-slate-400 mt-2 flex flex-wrap gap-x-3">
          {moduleCount > 0 && <span>{moduleCount} module{moduleCount === 1 ? "" : "s"}</span>}
          {picklistCount > 0 && <span>{picklistCount} picklist{picklistCount === 1 ? "" : "s"}</span>}
          {fieldCount > 0 && <span>{fieldCount} field{fieldCount === 1 ? "" : "s"}</span>}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <button type="button" className="btn-ghost text-xs py-1.5" onClick={onPreview} disabled={busy}>
          {previewPending ? "Previewing…" : "Preview"}
        </button>
        <button type="button" className="btn text-xs py-1.5" onClick={onApply} disabled={busy}>
          {applyPending ? "Applying…" : "Apply pack"}
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
      {applied && !error && <div className="mt-2 text-xs text-emerald-600">Pack applied — changes are live.</div>}
      {diff && <InlineDiff diff={diff} />}
    </div>
  );
}

/**
 * Export-my-configuration panel. Co-located here (rather than a separate
 * file) to stay inside WS8's file allowance — it's the same
 * useTransition/server-action pattern as PackCard, just for exportAction.
 * A real file download from a server action is awkward in the App Router
 * (no native Blob-download response path without a route handler), so this
 * renders the JSON inline with a copy-to-clipboard button instead.
 */
export function ExportPanel() {
  const [pending, start] = useTransition();
  const [json, setJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onExport = () => {
    setError(null);
    setCopied(false);
    start(async () => {
      const res = await exportAction();
      if ("error" in res) setError(res.error);
      else setJson(JSON.stringify(res.pack, null, 2));
    });
  };

  const onCopy = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setError("Couldn't copy — select the text below manually.");
    }
  };

  return (
    <div>
      <button type="button" className="btn-ghost text-xs py-1.5" onClick={onExport} disabled={pending}>
        {pending ? "Exporting…" : "Export my configuration"}
      </button>
      {error && <div className="mt-2 text-xs text-rose-600">{error}</div>}
      {json && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[11px] text-slate-500">
              No file-download here yet — copy this JSON instead.
            </div>
            <button type="button" className="btn-ghost text-[11px] py-1" onClick={onCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <pre className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-700 overflow-x-auto max-h-80 overflow-y-auto">
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
