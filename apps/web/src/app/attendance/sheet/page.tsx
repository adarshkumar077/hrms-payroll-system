'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';
import { isAdmin } from '@/lib/roles';

type SheetRow = {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  dayName: string;
  inTime: string;
  inLocation: string;
  outTime: string;
  outLocation: string;
  status: string;
  workingHours: string;
  overtime: string;
  todaysEarnings: number | null;
  checkInSelfieUrl: string | null;
  checkOutSelfieUrl: string | null;
  checkInMapsUrl: string | null;
  checkOutMapsUrl: string | null;
  workMinutes: number | null;
  overtimeMinutes: number;
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
  WFH: 'bg-cyan-100 text-cyan-800',
  OD: 'bg-orange-100 text-orange-800',
};

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
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employeeId, setEmployeeId] = useState(searchParams.get('employeeId') ?? '');
  const [employees, setEmployees] = useState<EmpOption[]>([]);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
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

  async function load() {
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
  }

  useEffect(() => {
    if (!hr && !employeeId) return;
    if (hr && !employeeId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, hr]);

  const showEmployeeCol = useMemo(
    () => rows.some((r, _i, arr) => arr[0] && r.employeeId !== arr[0].employeeId),
    [rows],
  );

  function downloadCsv() {
    const headers = hr
      ? [
          'Date',
          'Day',
          'In Time',
          'In Location',
          'Out Time',
          'Out Location',
          'OUT source',
          'Status',
          'Working Hours',
          'Overtime',
          "Today's Earnings",
        ]
      : [
          'Date',
          'Day',
          'In Time',
          'Out Time',
          'OUT source',
          'Status',
          'Working Hours',
          'Overtime',
          "Today's Earnings",
        ];
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        (hr
          ? [
              r.date,
              r.dayName,
              r.inTime,
              `"${(r.inLocation ?? '').replace(/"/g, '""')}"`,
              r.outTime,
              `"${(r.outLocation ?? '').replace(/"/g, '""')}"`,
              r.checkOutLabel ?? '',
              r.status,
              r.workingHours,
              r.overtime,
              r.todaysEarnings ?? '',
            ]
          : [
              r.date,
              r.dayName,
              r.inTime,
              r.outTime,
              r.checkOutLabel ?? '',
              r.status,
              r.workingHours,
              r.overtime,
              r.todaysEarnings ?? '',
            ]
        ).join(','),
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

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      <Link href="/attendance" className="text-sm text-brand-600 hover:underline">
        ← Attendance
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Attendance Sheet</h1>
      <p className="text-sm text-ink/60 mb-4">Monthly Excel-style view with location, OT, and earnings</p>

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
          onClick={load}
          disabled={loading || (hr && !employeeId)}
          className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Load'}
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

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white/80">
        <table className="w-full text-sm">
          <thead className="bg-mist/50 text-left">
            <tr>
              {showEmployeeCol && <th className="px-3 py-2">Employee</th>}
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Day</th>
              <th className="px-3 py-2">{hr ? 'In Time - Location' : 'In Time'}</th>
              <th className="px-3 py-2">{hr ? 'Out Time - Location' : 'Out Time'}</th>
              <th className="px-3 py-2">OUT source</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Working Hours</th>
              <th className="px-3 py-2">Overtime</th>
              <th className="px-3 py-2">Today&apos;s Earnings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.employeeId}-${r.date}`} className="border-t border-mist align-top">
                {showEmployeeCol && (
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.employeeCode}
                    <br />
                    <span className="text-xs text-ink/50">{r.employeeName}</span>
                  </td>
                )}
                <td className="px-3 py-2 whitespace-nowrap">
                  <Link
                    href={`/attendance?employeeId=${r.employeeId}&date=${r.date}`}
                    className="text-brand-600 hover:underline"
                  >
                    {r.date}
                  </Link>
                </td>
                <td className="px-3 py-2">{r.dayName.slice(0, 3)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    {hr && r.checkInSelfieUrl && (
                      <button
                        type="button"
                        onClick={() => setLightbox(r.checkInSelfieUrl)}
                        className="shrink-0"
                        title="View check-in selfie"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.checkInSelfieUrl}
                          alt="In selfie"
                          className="w-8 h-8 rounded object-cover border border-mist"
                        />
                      </button>
                    )}
                    <div>
                      <div>{r.inTime}</div>
                      {hr && (
                        <div className="text-xs text-ink/60">
                          {r.checkInMapsUrl ? (
                            <a
                              href={r.checkInMapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-600 hover:underline"
                            >
                              {r.inLocation}
                            </a>
                          ) : (
                            r.inLocation
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-start gap-2">
                    {hr && r.checkOutSelfieUrl && (
                      <button
                        type="button"
                        onClick={() => setLightbox(r.checkOutSelfieUrl)}
                        className="shrink-0"
                        title="View check-out selfie"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.checkOutSelfieUrl}
                          alt="Out selfie"
                          className="w-8 h-8 rounded object-cover border border-mist"
                        />
                      </button>
                    )}
                    <div>
                      <div>{r.outTime}</div>
                      {hr && r.checkOutSource !== 'SYSTEM_LOGOUT' && (
                        <div className="text-xs text-ink/60">
                          {r.checkOutMapsUrl ? (
                            <a
                              href={r.checkOutMapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand-600 hover:underline"
                            >
                              {r.outLocation}
                            </a>
                          ) : (
                            r.outLocation
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  {r.checkOutLabel ? (
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        r.checkOutSource === 'SYSTEM_LOGOUT'
                          ? 'bg-amber-100 text-amber-900 font-medium'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {r.checkOutLabel}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[r.status] ?? 'bg-gray-100'}`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.workingHours}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.overtime}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.todaysEarnings != null ? `₹${r.todaysEarnings.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={showEmployeeCol ? 10 : 9} className="px-3 py-8 text-center text-ink/50">
                  {hr && !employeeId
                    ? 'Select an employee and click Load'
                    : loading
                      ? 'Loading…'
                      : 'No rows'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
          role="presentation"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Selfie"
            className="max-w-full max-h-[90vh] rounded-lg shadow-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
