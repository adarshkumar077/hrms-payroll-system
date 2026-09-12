import Link from "next/link";

// SangamCRM-style clickable scorecard row: a horizontal strip of KPI tiles
// (first one always "All") that double as status filters. Server-rendered —
// each tile is a plain <Link href> built by the caller (leads/tickets pages),
// so clicking one is a normal navigation that sets/clears ?status= via
// lib/list.ts's parseListParams — no client JS needed here.
//
// `tone` is the raw Studio picklist option tone (lib/studio/config.ts
// optionTone) — an open-ended string set by tenants, not the fixed
// components/ui.tsx Badge vocabulary. Unknown/missing tones fall back to
// slate so a custom tenant tone never breaks the tile's layout.
const TONE_ACCENT: Record<string, string> = {
  slate: "bg-slate-400",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  green: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  red: "bg-rose-500",
  brand: "bg-brand-600",
};

export type ScorecardTile = {
  value: string | null;
  label: string;
  count: number;
  tone?: string | null;
  active: boolean;
  href: string;
};

export function ScorecardTiles({ tiles }: { tiles: ScorecardTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
      {tiles.map((tile) => (
        <Link
          key={tile.value ?? "__all"}
          href={tile.href}
          className={`card relative flex-none w-36 overflow-hidden p-3 transition hover:shadow-md ${
            tile.active ? "ring-2 ring-brand-500 border-brand-300" : ""
          }`}
        >
          <span className={`absolute inset-x-0 top-0 h-1 ${TONE_ACCENT[tile.tone || ""] || "bg-slate-300"}`} />
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400 truncate">{tile.label}</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{tile.count}</div>
        </Link>
      ))}
    </div>
  );
}
