"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { proposeAction, applyProposalAction } from "./actions";
import type { StudioPack, PackDiff } from "@/lib/studio/packs";

/**
 * Orbit Studio — AI onboarding interview (WS8), client half.
 *
 * Everything is client-side state until "Apply this configuration" is
 * clicked: proposeAction only drafts + previews, applyProposalAction is the
 * one write. The diff rendering below (KIND_TONE/DiffList/InlineDiff) is a
 * deliberate duplicate of components/studio/PackDiffView.tsx's markup —
 * same reasoning as app/(app)/studio/templates/PackCard.tsx's InlineDiff:
 * this renders client-side state coming back from a server action, while
 * PackDiffView stays a plain server-safe component for RSC preview surfaces.
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
    return <div className="mt-3 text-[11px] text-slate-400">Nothing to change — your setup already matches this configuration.</div>;
  }
  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      <DiffList title="Will add" items={diff.creates} />
      <DiffList title="Will update" items={diff.updates} />
      <DiffList title="Kept as-is (conflicts)" items={diff.conflicts} />
    </div>
  );
}

type ProposalState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "proposed"; pack: StudioPack; diff: PackDiff; source: "model" | "fallback"; note?: string }
  | { status: "applied"; diff: PackDiff };

export function InterviewForm() {
  const [description, setDescription] = useState("");
  const [sells, setSells] = useState("");
  const [buyers, setBuyers] = useState("");
  const [dealWord, setDealWord] = useState("");
  const [state, setState] = useState<ProposalState>({ status: "idle" });
  const [isPending, startTransition] = useTransition();

  function handlePropose() {
    if (!description.trim()) {
      setState({ status: "error", message: "Describe your business first." });
      return;
    }
    startTransition(async () => {
      const res = await proposeAction({ description, sells, buyers, dealWord });
      if (!res.ok) {
        setState({ status: "error", message: res.error });
        return;
      }
      setState({ status: "proposed", pack: res.pack, diff: res.diff, source: res.source, note: res.note });
    });
  }

  function handleApply() {
    if (state.status !== "proposed") return;
    const pack = state.pack;
    startTransition(async () => {
      const res = await applyProposalAction(JSON.stringify(pack));
      if (!res.ok) {
        setState({ status: "error", message: res.error });
        return;
      }
      setState({ status: "applied", diff: res.diff });
    });
  }

  function handleStartOver() {
    setState({ status: "idle" });
  }

  const proposal = state.status === "proposed" ? state : null;
  const applied = state.status === "applied" ? state : null;
  const error = state.status === "error" ? state.message : null;

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div>
          <label className="label">What does your company do?</label>
          <textarea
            className="input min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. We install and service CCTV, networking and computer hardware for small offices."
            disabled={isPending || !!applied}
          />
        </div>
        <div>
          <label className="label">What do you sell?</label>
          <input
            className="input"
            value={sells}
            onChange={(e) => setSells(e.target.value)}
            placeholder="e.g. AMC contracts, hardware, installation services"
            disabled={isPending || !!applied}
          />
        </div>
        <div>
          <label className="label">Who buys it?</label>
          <input
            className="input"
            value={buyers}
            onChange={(e) => setBuyers(e.target.value)}
            placeholder="e.g. Small offices and retail shops in our city"
            disabled={isPending || !!applied}
          />
        </div>
        <div>
          <label className="label">What do you call a deal?</label>
          <input
            className="input"
            value={dealWord}
            onChange={(e) => setDealWord(e.target.value)}
            placeholder="e.g. Contract, Order, Job"
            disabled={isPending || !!applied}
          />
        </div>

        {!proposal && !applied && (
          <button type="button" className="btn" onClick={handlePropose} disabled={isPending}>
            {isPending ? "Thinking…" : "Propose a configuration"}
          </button>
        )}

        {error && <div className="text-sm text-rose-600">{error}</div>}
      </div>

      <p className="text-xs text-slate-500">
        Nothing is written until you apply. Every applied change is logged and reversible by archiving.
      </p>

      {proposal && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={proposal.source === "model" ? "emerald" : "amber"}>
              {proposal.source === "model" ? "AI proposal" : "Closest template (AI offline)"}
            </Badge>
            <span className="font-semibold text-slate-800">{proposal.pack.name}</span>
            <Badge tone="brand">{proposal.pack.industry}</Badge>
          </div>
          {proposal.pack.description && <p className="text-xs text-slate-500 mt-2">{proposal.pack.description}</p>}
          {proposal.note && <p className="text-xs text-amber-700 mt-2">{proposal.note}</p>}

          <InlineDiff diff={proposal.diff} />

          <div className="flex gap-2 pt-3">
            <button type="button" className="btn" onClick={handleApply} disabled={isPending}>
              {isPending ? "Applying…" : "Apply this configuration"}
            </button>
            <button type="button" className="btn-ghost" onClick={handleStartOver} disabled={isPending}>
              Start over
            </button>
          </div>
        </div>
      )}

      {applied && (
        <div className="card p-4">
          <Badge tone="emerald">Applied</Badge>
          <div className="text-sm text-slate-700 mt-2">Your configuration has been applied — Studio now reflects it.</div>
          <InlineDiff diff={applied.diff} />
          <button type="button" className="btn-ghost mt-3" onClick={handleStartOver}>
            Start another interview
          </button>
        </div>
      )}
    </div>
  );
}
