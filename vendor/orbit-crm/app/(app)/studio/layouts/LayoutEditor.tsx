"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveLayoutAction } from "./actions";

export type LayoutRow = { code: string; label: string; hidden: boolean };

/**
 * Orbit Studio — Layout Editor (WS9 v1).
 * Rows are held in local state so Up/Down + Show/Hide feel instant; "Save
 * layout" serializes the whole order to LayoutDef.spec in one write.
 * "Reset to default" saves `{fields: []}` directly (no local reorder needed —
 * orderFields() on an empty spec = original available-field order, unhidden).
 */
export function LayoutEditor({ module, initialRows }: { module: string; initialRows: LayoutRow[] }) {
  const [rows, setRows] = useState<LayoutRow[]>(initialRows);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSaved(false);
  }

  function toggleHidden(index: number) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, hidden: !r.hidden } : r)));
    setSaved(false);
  }

  function persist(fields: { code: string; hidden?: boolean }[]) {
    const fd = new FormData();
    fd.set("module", module);
    fd.set("spec", JSON.stringify({ fields }));
    setError(null);
    start(async () => {
      const res = await saveLayoutAction(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const save = () => persist(rows.map((r) => (r.hidden ? { code: r.code, hidden: true } : { code: r.code })));
  const resetToDefault = () => persist([]);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="th">Order</th>
            <th className="th">Field</th>
            <th className="th">Visibility</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="td text-slate-400" colSpan={3}>
                No fields available for this module yet.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={r.code} className={r.hidden ? "opacity-50" : ""}>
                <td className="td">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn-ghost text-xs px-1.5 py-0.5"
                      disabled={pending || i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Move ${r.label} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs px-1.5 py-0.5"
                      disabled={pending || i === rows.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move ${r.label} down`}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="td">
                  {r.label} <span className="text-slate-400 text-xs font-mono">({r.code})</span>
                </td>
                <td className="td">
                  <button
                    type="button"
                    className="btn-ghost text-xs py-1"
                    disabled={pending}
                    onClick={() => toggleHidden(i)}
                    aria-label={r.hidden ? `Show ${r.label}` : `Hide ${r.label}`}
                  >
                    {r.hidden ? "Hidden — Show" : "Visible — Hide"}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="p-4 flex items-center gap-3">
        <button type="button" className="btn py-1.5" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save layout"}
        </button>
        <button type="button" className="btn-ghost py-1.5" disabled={pending} onClick={resetToDefault}>
          Reset to default
        </button>
        {saved && !pending && !error && <span className="text-xs text-emerald-600">Saved.</span>}
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    </div>
  );
}
