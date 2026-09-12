"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

// Calls-specific filter bar: search (on from/to numbers) + status + direction.
// components/ListControls.tsx's shared FilterBar only supports a single status
// dropdown, so this is a small local copy (same URL-param-driven pattern) that
// adds the direction filter the Calls list needs — kept co-located here rather
// than reworking the shared FilterBar every other list page uses.
export function CallsFilterBar({
  statuses,
  directions,
}: {
  statuses: { value: string; label: string }[];
  directions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");

  function apply(next: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page"); // reset to page 1 on filter change
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q });
        }}
        className="flex-1 min-w-[200px]"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search from/to number…" className="input" />
      </form>
      <select
        className="input max-w-[160px]"
        value={sp.get("direction") || ""}
        onChange={(e) => apply({ direction: e.target.value })}
      >
        <option value="">All directions</option>
        {directions.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <select className="input max-w-[160px]" value={sp.get("status") || ""} onChange={(e) => apply({ status: e.target.value })}>
        <option value="">All statuses</option>
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
