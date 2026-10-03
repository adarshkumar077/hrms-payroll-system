'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';
import { isAdmin } from '@/lib/roles';
import { onAttendanceChanged } from '@/lib/attendance-sync';
import { SheetQuickActionBar } from '@/components/attendance/SheetQuickActionBar';

type SheetRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  dayName: string;
  holidayName?: string | null;
  holidayType?: string | null;
  inTime: string;
  outTime: string;
  status: string;
  workingHours: string;
  dailySalary: number;
  todaysEarnings: number | null;
  runningTotal: number;
  checkOutSource?: string | null;
  checkOutLabel?: string | null;
};

type SheetResponse = {
  year: number;
  month: number;
  employeeId: string | null;
  rows: SheetRow[];
};

type EmpOption = { id: string; employeeCode: string; firstName: string; lastName?: string | null };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_COLORS: Record<string, string> = {
  P: 'bg-emerald-100 text-emerald-800',
  A: 'bg-red-100 text-red-800',
  L: 'bg-blue-100 text-blue-800',
  HD: 'bg-amber-100 text-amber-800',
  PL: 'bg-lime-100 text-lime-800',
  ULOB: 'bg-fuchsia-100 text-fuchsia-800',
  WO: 'bg-slate-100 text-slate-700',
  H: 'bg-indigo-100 text-indigo-800',
  PH: 'bg-violet-100 text-violet-800',
  WFH: 'bg-cyan-100 text-cyan-800',
  OD: 'bg-orange-100 text-orange-800',
};

function money(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function earningsLabel(n: number | null) {
  if (n == null) return '—';
  const abs = money(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return money(0);
}

export default function AttendanceSheetPage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-7xl mx-auto px-4 py-10">
          <p className="text-sm text-ink/50">Loading sheet…</p>
        </main>
      }
    >
      <AttendanceSheetInner />
    </Suspense>
  );
}

function AttendanceSheetInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = new Date();
  const [year, setYear] = useState(
    Number(searchParams.get('year')) || now.getFullYear(),
  );
  const [month, setMonth] = useState(
    Number(searchParams.get('month')) || now.getMonth() + 1,
  );
  const [employeeId, setEmployeeId] = useState(searchParams.get('employeeId') ?? '');
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hr, setHr] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    const admin = isAdmin(u);
    setHr(admin);
    if (admin) {
      api<{ items: EmpOption[] }>('/employees?pageSize=200&isActive=true')
        .then((res) => setEmployees(res.items ?? []))
        .catch(() => setEmployees([]));
    } else if (u.employeeId) {
      setEmployeeId(u.employeeId);
    }
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        year: String(year),
        month: String(month),
      });
      if (employeeId) q.set('employeeId', employeeId);
      const res = await api<SheetResponse>(`/attendance/sheet?${q}`);
      setRows(res.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sheet');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [year, month, employeeId]);

  useEffect(() => {
    if (!hr && !employeeId) return;
    if (hr && !employeeId) return;
    void load();
  }, [employeeId, hr, year, month, load]);

  useEffect(() => {
    return onAttendanceChanged(() => {
      if (!employeeId && hr) return;
      void load();
    });
  }, [employeeId, hr, load]);

  // Soft refresh so 9 PM auto-checkout and other-tab punches appear without a full reload.
  useEffect(() => {
    if (!employeeId && hr) return;
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [employeeId, hr, load]);

  const showEmployeeCol = useMemo(
    () => rows.some((r, _i, arr) => arr[0] && r.employeeId !== arr[0].employeeId),
    [rows],
  );

  function downloadCsv() {
    const headers = [
      'Date',
      'Day',
      'Holiday',
      'Status',
      'In',
      'Out',
      'Hours',
      'Daily Salary',
      "Today's Earnings",
      'Running Total',
    ];
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.date,
          r.dayName,
          `"${(r.holidayName ?? '').replace(/"/g, '""')}"`,
          r.status,
          r.inTime,
          r.outTime,
          r.workingHours,
          r.dailySalary,
          r.todaysEarnings ?? '',
          r.runningTotal,
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-sheet-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportReport(fmt: 'excel' | 'pdf') {
    setError('');
    try {
      const token = getToken();
      const path = `/reports/attendance/export/${fmt}?year=${year}&month=${month}`;
      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Export failed (${res.status})`);
      }
      if (fmt === 'pdf') {
        const html = await res.text();
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${year}-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  const colCount = (showEmployeeCol ? 1 : 0) + 10;

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <Link href="/attendance" className="text-sm text-brand-600 hover:underline">
        ← Attendance
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Attendance Sheet</h1>
      <p className="text-sm text-ink/60 mb-4">
        Daily in/out, hours, salary, and running earnings — updates live after check-in and checkout
      </p>

      <div className="flex flex-wrap gap-2 mb-4 items-end">
        {hr && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink/60">Employee</label>
            <select
              className="rounded border border-mist px-3 py-2 text-sm min-w-[220px]"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employeeCode} — {e.firstName} {e.lastName ?? ''}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">Month</label>
          <select
            className="rounded border border-mist px-3 py-2 text-sm"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">Year</label>
          <select
            className="rounded border border-mist px-3 py-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || (hr && !employeeId)}
          className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={rows.length === 0}
          className="text-sm px-3 py-2 rounded border border-brand-300 hover:bg-brand-50 disabled:opacity-60"
        >
          Download CSV
        </button>
        {hr && (
          <>
            <button
              type="button"
              onClick={() => exportReport('excel')}
              className="text-sm px-3 py-2 rounded border border-brand-300 hover:bg-brand-50"
            >
              Export Excel
            </button>
            <button
              type="button"
              onClick={() => exportReport('pdf')}
              className="text-sm px-3 py-2 rounded border border-brand-300 hover:bg-brand-50"
            >
              Export PDF
            </button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {hr && (
        <SheetQuickActionBar
          year={year}
          month={month}
          onChanged={() => {
            void load();
          }}
        />
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="bg-slate-100 text-left text-slate-700">
            <tr>
              {showEmployeeCol && (
                <th className="px-3 py-2.5 font-medium whitespace-nowrap">Employee</th>
              )}
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Date</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Day</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Holiday</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Status</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">In</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Out</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Hours</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap text-right">Daily Salary</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap text-right">Today&apos;s Earnings</th>
              <th className="px-3 py-2.5 font-medium whitespace-nowrap text-right">Running Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const earningPositive = (r.todaysEarnings ?? 0) > 0;
              const earningNegative = (r.todaysEarnings ?? 0) < 0;
              return (
                <tr
                  key={`${r.employeeId}-${r.date}`}
                  className="border-t border-slate-100 hover:bg-slate-50/60"
                >
                  {showEmployeeCol && (
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.employeeCode}
                      <br />
                      <span className="text-xs text-ink/50">{r.employeeName}</span>
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums text-slate-800">
                    <Link
                      href={`/attendance?employeeId=${r.employeeId}&date=${r.date}`}
                      className="text-brand-600 hover:underline"
                    >
                      {r.date}
                    </Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{r.dayName}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">
                    {r.holidayName || '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                        STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {r.status}
                      {r.status === 'WO' || r.status === 'PH'
                        ? r.todaysEarnings != null && r.todaysEarnings > 0
                          ? ' (Paid)'
                          : r.todaysEarnings === 0
                            ? ' (Unpaid)'
                            : ''
                        : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.inTime || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    <span>{r.outTime || '—'}</span>
                    {r.checkOutSource === 'SYSTEM_LOGOUT' && r.outTime && r.outTime !== '—' && (
                      <span className="ml-1 text-[10px] text-amber-700">Auto</span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{r.workingHours || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums text-slate-800">
                    {money(r.dailySalary ?? 0)}
                  </td>
                  <td
                    className={`px-3 py-2 whitespace-nowrap text-right tabular-nums font-medium ${
                      earningPositive
                        ? 'text-emerald-600'
                        : earningNegative
                          ? 'text-red-600'
                          : 'text-slate-500'
                    }`}
                  >
                    {earningsLabel(r.todaysEarnings)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right tabular-nums font-medium text-slate-800">
                    {money(r.runningTotal ?? 0)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-8 text-center text-ink/50">
                  {hr && !employeeId
                    ? 'Select an employee to load the sheet'
                    : loading
                      ? 'Loading…'
                      : 'No rows'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
