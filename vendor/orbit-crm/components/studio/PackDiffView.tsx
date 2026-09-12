import { Badge } from "@/components/ui";
import type { PackDiff } from "@/lib/studio/packs";

/**
 * Orbit Studio — Industry Templates (WS8).
 * Server-safe presentational rendering of a PackDiff (creates/updates/conflicts).
 * Plain, synchronous, no "use client" — usable from any RSC (the /studio/templates
 * page's preview flow renders its own inline copy client-side instead, see
 * app/(app)/studio/templates/PackCard.tsx; this component is kept for the
 * interview flow and any other server-rendered preview surface).
 */

const KIND_TONE: Record<string, "brand" | "blue" | "amber" | "slate" | "green"> = {
  module: "blue",
  picklist: "brand",
  option: "amber",
  field: "green",
};

function DiffGroup({ title, items }: { title: string; items: { kind: string; summary: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-slate-700 mb-1.5">
        {title} <span className="text-slate-400 font-normal">({items.length})</span>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded-md px-2 py-1.5">
            <Badge tone={KIND_TONE[it.kind] ?? "slate"}>{it.kind}</Badge>
            <span>{it.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PackDiffView({ diff, compact = false }: { diff: PackDiff; compact?: boolean }) {
  const total = diff.creates.length + diff.updates.length + diff.conflicts.length;

  if (total === 0) {
    return (
      <div className={compact ? "text-xs text-slate-400 py-2" : "card p-6 text-center text-sm text-slate-400"}>
        Nothing to change — this pack is already applied or fully overlaps.
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <DiffGroup title="Will add" items={diff.creates} />
      <DiffGroup title="Will update" items={diff.updates} />
      <DiffGroup title="Kept as-is (conflicts)" items={diff.conflicts} />
    </div>
  );
}
