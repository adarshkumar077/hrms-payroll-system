import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError, shortDate } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";

type Leave = {
  id: string;
  employee_id: string;
  employee?: { id: string; name: string; code: string } | null;
  type: string;
  from_date: string;
  to_date: string;
  days: number;
  status: "Pending" | "Approved" | "Rejected" | string;
  reason?: string | null;
};

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    Pending: "badge bg-amber-50 text-amber-700",
    Approved: "badge bg-emerald-50 text-emerald-700",
    Rejected: "badge bg-rose-50 text-rose-700",
  };
  return <span className={cls[status] || "badge"}>{status}</span>;
}

export function LeavePage() {
  const [rows, setRows] = useState<Leave[] | null>(null);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  function load() {
    setErr("");
    apiGet<any>("/hr/leave")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setRowErr((m) => ({ ...m, [id]: "" }));
    try {
      await apiPost(`/hr/leave/${id}/${action}`);
      load();
    } catch (e: any) {
      setRowErr((m) => ({ ...m, [id]: e instanceof ApiError ? e.message : "Action failed." }));
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = (rows || []).filter((r) => r.status === "Pending").length;
  const approvedCount = (rows || []).filter((r) => r.status === "Approved").length;
  const rejectedCount = (rows || []).filter((r) => r.status === "Rejected").length;

  return (
    <div>
      <PageHeader
        title="Leave Applications"
        subtitle={rows ? `${rows.length} application${rows.length === 1 ? "" : "s"}` : undefined}
      />

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <StatCard label="Pending" value={String(pendingCount)} accent="amber" />
          <StatCard label="Approved" value={String(approvedCount)} accent="green" />
          <StatCard label="Rejected" value={String(rejectedCount)} accent="red" />
        </div>
      )}

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Employee</th>
              <th className="th">Type</th>
              <th className="th">From</th>
              <th className="th">To</th>
              <th className="th">Days</th>
              <th className="th">Reason</th>
              <th className="th">Status</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td className="td text-slate-400" colSpan={8}>
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={8}>
                  No leave applications yet.
                </td>
              </tr>
            )}
            {(rows || []).map((r) => (
              <tr key={r.id}>
                <td className="td font-medium text-slate-800">
                  {r.employee ? `${r.employee.name} (${r.employee.code})` : "—"}
                </td>
                <td className="td">{r.type}</td>
                <td className="td">{shortDate(r.from_date)}</td>
                <td className="td">{shortDate(r.to_date)}</td>
                <td className="td">{r.days}</td>
                <td className="td max-w-xs truncate" title={r.reason || ""}>
                  {r.reason || <span className="text-slate-300">—</span>}
                </td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td">
                  {r.status === "Pending" ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <button
                          className="btn-ghost text-emerald-700 text-xs py-1"
                          disabled={busyId === r.id}
                          onClick={() => act(r.id, "approve")}
                        >
                          {busyId === r.id ? "…" : "Approve"}
                        </button>
                        <button
                          className="btn-ghost text-rose-700 text-xs py-1"
                          disabled={busyId === r.id}
                          onClick={() => act(r.id, "reject")}
                        >
                          {busyId === r.id ? "…" : "Reject"}
                        </button>
                      </div>
                      {rowErr[r.id] && <div className="text-xs text-rose-600">{rowErr[r.id]}</div>}
                    </div>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
