import { useEffect, useState } from "react";
import { apiGet, shortDate } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";

interface Employee {
  id: string;
  name: string;
  code: string;
}

interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string;
  status: string;
  check_in: string | null;
  check_out: string | null;
  employee: Employee | null;
}

interface PaginatedResponse {
  data: AttendanceRecord[];
  total: number;
  current_page: number;
  last_page: number;
}

interface TodayResponse {
  date: string;
  summary: {
    present: number;
    halfDay: number;
    onLeave: number;
    absent: number;
    weekOff: number;
    total: number;
  };
  records: AttendanceRecord[];
}

const statusColors: Record<string, string> = {
  Present: "bg-green-50 text-green-700",
  HalfDay: "bg-amber-50 text-amber-700",
  Leave: "bg-blue-50 text-blue-700",
  Absent: "bg-rose-50 text-rose-700",
  WeekOff: "bg-slate-50 text-slate-700",
};

export function AttendancePage() {
  const [response, setResponse] = useState<PaginatedResponse | null>(null);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);

  // Fetch today's summary
  useEffect(() => {
    setErr("");
    apiGet<TodayResponse>("/hr/attendance/today")
      .then((r) => setToday(r))
      .catch((e) => setErr(e.message));
  }, []);

  // Fetch attendance records
  useEffect(() => {
    setResponse(null);
    apiGet<PaginatedResponse>(`/hr/attendance?per_page=50&page=${page}`)
      .then((r) => setResponse(r))
      .catch((e) => setErr(e.message));
  }, [page]);

  const records = response?.data || [];

  const formatTime = (time: string | null) => {
    if (!time) return "—";
    try {
      const [hour, minute] = time.split(":");
      return `${hour}:${minute}`;
    } catch {
      return time;
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = statusColors[status] || "bg-slate-50 text-slate-700";
    return (
      <span className={`badge ${colors} text-xs font-medium px-2 py-1 rounded`}>
        {status}
      </span>
    );
  };

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle={response ? `${response.total} records · live from Laravel` : undefined}
      />

      {/* Today's Summary Cards */}
      {today && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard label="Present" value={String(today.summary.present)} accent="green" />
          <StatCard label="Half Day" value={String(today.summary.halfDay)} accent="amber" />
          <StatCard label="On Leave" value={String(today.summary.onLeave)} accent="blue" />
          <StatCard label="Absent" value={String(today.summary.absent)} accent="red" />
          <StatCard label="Week Off" value={String(today.summary.weekOff)} accent="slate" />
          <StatCard label="Total" value={String(today.summary.total)} accent="brand" />
        </div>
      )}

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}

      {/* Attendance table */}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Employee</th>
              <th className="th">Code</th>
              <th className="th">Date</th>
              <th className="th">Status</th>
              <th className="th">Check In</th>
              <th className="th">Check Out</th>
            </tr>
          </thead>
          <tbody>
            {response === null && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {response !== null && records.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={6}>
                  No attendance records yet.
                </td>
              </tr>
            )}
            {records.map((record) => (
              <tr key={record.id}>
                <td className="td font-medium">{record.employee?.name || "Unknown"}</td>
                <td className="td text-slate-500 text-sm">{record.employee?.code || "—"}</td>
                <td className="td text-sm">{shortDate(record.date)}</td>
                <td className="td">{getStatusBadge(record.status)}</td>
                <td className="td text-sm">{formatTime(record.check_in)}</td>
                <td className="td text-sm">{formatTime(record.check_out)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {response && response.last_page > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="btn-ghost py-1.5 px-3 text-sm disabled:opacity-50"
          >
            ← Prev
          </button>
          <span className="text-sm text-slate-600">
            Page {page} of {response.last_page}
          </span>
          <button
            onClick={() => setPage(Math.min(response.last_page, page + 1))}
            disabled={page === response.last_page}
            className="btn-ghost py-1.5 px-3 text-sm disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
