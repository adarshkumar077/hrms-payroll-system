import { useEffect, useState } from "react";
import { apiGet, inrLakh } from "../lib/api";
import { PageHeader } from "../components/Layout";

type Col = [key: string, label: string, kind?: "money"];

// Generic tenant-scoped list page: fetches a Laravel API endpoint and renders columns.
// Handles both paginated ({data:[...]}) and plain-array responses.
export function ResourceList({ title, endpoint, columns }: { title: string; endpoint: string; columns: Col[] }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    setRows(null); setErr("");
    apiGet<any>(endpoint)
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  }, [endpoint]);

  const filtered = (rows || []).filter((row) =>
    !q || columns.some(([k]) => String(row[k] ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div>
      <PageHeader title={title} subtitle={rows ? `${rows.length} record${rows.length === 1 ? "" : "s"} · live from Laravel` : undefined} />
      <div className="mb-3 max-w-xs">
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>{columns.map(([, label]) => <th key={label} className="th">{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td className="td text-slate-400" colSpan={columns.length}>Loading…</td></tr>
            )}
            {rows !== null && filtered.length === 0 && (
              <tr><td className="td text-slate-400" colSpan={columns.length}>No records yet.</td></tr>
            )}
            {filtered.map((row, i) => (
              <tr key={row.id ?? i}>
                {columns.map(([k, , kind]) => (
                  <td key={k} className="td">
                    {kind === "money" ? inrLakh(Number(row[k] || 0))
                      : row[k] == null || row[k] === "" ? <span className="text-slate-300">—</span>
                      : String(row[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
