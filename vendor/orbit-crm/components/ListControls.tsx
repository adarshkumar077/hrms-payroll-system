"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { columnFilterParamKeys, type ColumnFilterDef } from "@/lib/list";

// A reusable filter bar (search + optional status dropdown, + one optional
// extra dropdown for list pages that need a second facet e.g. /messages'
// channel filter alongside deliveryStatus) that drives the URL searchParams.
// Server list pages read those params via parseListParams (lib/list.ts) for
// q/status; a caller-supplied `extra` filter is read directly off searchParams
// by the page itself (see app/(app)/messages/page.tsx).
export function FilterBar({
  statuses = [],
  placeholder = "Search…",
  extra,
}: {
  statuses?: string[];
  placeholder?: string;
  /** A second, independent select filter — e.g. { param: "channel", options: [...], label: "All channels" }. */
  extra?: { param: string; options: string[]; label: string };
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
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="input" />
      </form>
      {statuses.length > 0 && (
        <select className="input max-w-[180px]" value={sp.get("status") || ""} onChange={(e) => apply({ status: e.target.value })}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      {extra && extra.options.length > 0 && (
        <select
          className="input max-w-[180px]"
          value={sp.get(extra.param) || ""}
          onChange={(e) => apply({ [extra.param]: e.target.value })}
        >
          <option value="">{extra.label}</option>
          {extra.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// Prev/next pagination that preserves existing params.
export function Pagination({ page, pages, from, to, total }: { page: number; pages: number; from: number; to: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  function go(p: number) {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(p));
    router.push(`${pathname}?${params.toString()}`);
  }
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between mt-3 text-sm text-slate-500">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <button className="btn-ghost text-xs disabled:opacity-40" disabled={page <= 1} onClick={() => go(page - 1)}>
          ← Prev
        </button>
        <span className="px-2 py-1.5 text-xs">
          {page} / {pages}
        </span>
        <button className="btn-ghost text-xs disabled:opacity-40" disabled={page >= pages} onClick={() => go(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}

// Server-rendered sort header link: toggles asc/desc on the given field, preserving other params.
// Just a next/link building `?sort=&order=` — no client hooks needed, safe to use from an RSC.
export function SortLink({
  field,
  sort,
  order,
  searchParams,
  children,
}: {
  field: string;
  sort: string;
  order: "asc" | "desc";
  searchParams: Record<string, string | string[] | undefined>;
  children: React.ReactNode;
}) {
  const active = sort === field;
  const nextOrder = active && order === "asc" ? "desc" : "asc";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "sort" || k === "order" || k === "page") continue;
    if (typeof v === "string") params.set(k, v);
  }
  params.set("sort", field);
  params.set("order", nextOrder);
  return (
    <Link href={`?${params.toString()}`} className="inline-flex items-center gap-1 hover:text-slate-900">
      {children}
      {active && <span className="text-[10px]">{order === "asc" ? "▲" : "▼"}</span>}
    </Link>
  );
}

// ── LIST FRAMEWORK (E1) ───────────────────────────────────────────────────

// UI-level column-filter def: the parse-only ColumnFilterDef (lib/list.ts)
// plus what's needed to render an input — a label and, for `kind: "select"`,
// its option list (usually Studio-config-driven, so it can't live in the
// pure lib/list.ts def).
export type ColumnFilterUIDef = ColumnFilterDef & {
  label: string;
  options?: { value: string; label: string }[];
};

const DEBOUNCE_MS = 400;

/** Second header row: one filter input per column def, debounced into
 *  `f_<field>[...]` query params via router.replace (no page-1 reset isn't
 *  needed — filter changes always drop `page` like FilterBar does). Render
 *  directly under the page's own <tr> of <th> labels, inside the same
 *  <thead>. Pass `trailingColSpan` for any non-filterable columns after the
 *  last filter def (e.g. an Actions column) so the header grid stays
 *  aligned; the "Clear filters" link lives in that trailing cell. */
export function ColumnFilterRow({ defs, trailingColSpan = 1 }: { defs: ColumnFilterUIDef[]; trailingColSpan?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const paramKeys = columnFilterParamKeys(defs);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const k of paramKeys) init[k] = sp.get(k) || "";
    return init;
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep local input state in sync when navigation changes params out from
  // under us (e.g. a saved-search chip or "Clear filters" link).
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const k of paramKeys) next[k] = sp.get(k) || "";
    setValues(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.toString()]);

  function schedule(patch: Record<string, string>) {
    setValues((v) => ({ ...v, ...patch }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    }, DEBOUNCE_MS);
  }

  function clearAll() {
    if (timer.current) clearTimeout(timer.current);
    const params = new URLSearchParams(sp.toString());
    for (const k of paramKeys) params.delete(k);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const hasActive = paramKeys.some((k) => sp.get(k));

  return (
    <tr className="bg-slate-50/60">
      {defs.map((def) => (
        <th key={def.field} className="th !py-1.5 font-normal">
          <ColumnFilterInput def={def} values={values} onChange={schedule} />
        </th>
      ))}
      <th className="th text-right" colSpan={trailingColSpan}>
        {hasActive && (
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={clearAll}>
            Clear filters
          </button>
        )}
      </th>
    </tr>
  );
}

function ColumnFilterInput({
  def,
  values,
  onChange,
}: {
  def: ColumnFilterUIDef;
  values: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}) {
  if (def.kind === "text") {
    return (
      <input
        className="input !py-1 text-xs"
        placeholder={def.label}
        value={values[`f_${def.field}`] || ""}
        onChange={(e) => onChange({ [`f_${def.field}`]: e.target.value })}
      />
    );
  }
  if (def.kind === "select") {
    return (
      <select
        className="input !py-1 text-xs"
        value={values[`f_${def.field}`] || ""}
        onChange={(e) => onChange({ [`f_${def.field}`]: e.target.value })}
      >
        <option value="">{def.label}</option>
        {(def.options || []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (def.kind === "date") {
    return (
      <div className="flex gap-1">
        <input
          type="date"
          className="input !py-1 text-xs"
          value={values[`f_${def.field}_from`] || ""}
          onChange={(e) => onChange({ [`f_${def.field}_from`]: e.target.value })}
        />
        <input
          type="date"
          className="input !py-1 text-xs"
          value={values[`f_${def.field}_to`] || ""}
          onChange={(e) => onChange({ [`f_${def.field}_to`]: e.target.value })}
        />
      </div>
    );
  }
  // number
  return (
    <div className="flex gap-1">
      <input
        type="number"
        className="input !py-1 text-xs w-16"
        placeholder="min"
        value={values[`f_${def.field}_min`] || ""}
        onChange={(e) => onChange({ [`f_${def.field}_min`]: e.target.value })}
      />
      <input
        type="number"
        className="input !py-1 text-xs w-16"
        placeholder="max"
        value={values[`f_${def.field}_max`] || ""}
        onChange={(e) => onChange({ [`f_${def.field}_max`]: e.target.value })}
      />
    </div>
  );
}

/** Dropdown of checkboxes driving `?cols=` (parseVisibleColumns on the
 *  server side). `allColumns` is the full toggle-able set; `visibleColumns`
 *  is the currently-resolved set (server-computed via parseVisibleColumns,
 *  passed back down so the checkboxes reflect the actual applied state,
 *  including the very first render before any `cols` param exists). */
export function ColumnChooser({
  allColumns,
  visibleColumns,
}: {
  allColumns: { key: string; label: string }[];
  visibleColumns: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);

  function toggle(key: string) {
    const next = visibleColumns.includes(key) ? visibleColumns.filter((c) => c !== key) : [...visibleColumns, key];
    const params = new URLSearchParams(sp.toString());
    if (next.length) params.set("cols", next.join(","));
    else params.delete("cols");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="relative">
      <button type="button" className="btn-ghost text-xs" onClick={() => setOpen((o) => !o)}>
        Columns ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 card p-2 w-48 shadow-lg">
            {allColumns.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-xs py-1 px-1 hover:bg-slate-50 rounded cursor-pointer">
                <input type="checkbox" checked={visibleColumns.includes(c.key)} onChange={() => toggle(c.key)} />
                {c.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** The `?per=` select (lib/list.ts parsePageSize). `value` is the
 *  server-resolved current size — if it's not one of the four standard
 *  options (e.g. the implicit default of 20 before the user ever touches
 *  this control), it's shown as an extra leading option so the select
 *  always reflects reality. */
export function PageSizeSelect({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const options = PAGE_SIZE_OPTIONS.includes(value) ? PAGE_SIZE_OPTIONS : [value, ...PAGE_SIZE_OPTIONS];

  function apply(v: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("per", v);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <select className="input max-w-[110px] text-xs" value={String(value)} onChange={(e) => apply(e.target.value)}>
      {options.map((n) => (
        <option key={n} value={n}>
          {n} / page
        </option>
      ))}
    </select>
  );
}
