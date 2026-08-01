'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';



type Row = {
  employee: { id: string; employeeCode: string; firstName: string; lastName?: string | null; department?: string | null };
  record: {
    status: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    isLate: boolean;
    lateMinutes: number;
    method?: string | null;
  } | null;
};

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

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type ViewTab = 'daily' | 'monthly' | 'yearly';

export default function AttendanceConsolePage() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [counters, setCounters] = useState<
    { lateMarkCount: number; ulobCount: number; employee: { employeeCode: string; firstName: string } }[]
  >([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [viewTab, setViewTab] = useState<ViewTab>('daily');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  function load(d = date) {
    api<Row[]>(`/attendance/console?date=${d}`)
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    api<typeof counters>('/attendance/counters')
      .then(setCounters)
      .catch(() => setCounters([]));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['CEO', 'HR', 'ADMIN'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function correct(employeeId: string, status: string) {
    setMessage('');
    try {
      await api(`/attendance/${employeeId}/${date}`, {
        method: 'PUT',
        body: JSON.stringify({ status, correctionNote: `Manual set to ${status}` }),
      });
      setMessage('Corrected');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Correction failed');
    }
  }

  const departments = useMemo(() => {
    const depts = new Set<string>();
    rows.forEach((r) => {
      if (r.employee.department) depts.add(r.employee.department);
    });
    return Array.from(depts).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterEmployee) {
        const term = filterEmployee.toLowerCase();
        const match =
          (r.employee?.firstName ?? '').toLowerCase().includes(term) ||
          (r.employee?.lastName ?? '').toLowerCase().includes(term) ||
          (r.employee?.employeeCode ?? '').toLowerCase().includes(term);
        if (!match) return false;
      }
      if (filterDepartment && r.employee?.department !== filterDepartment) return false;
      return true;
    });
  }, [rows, filterEmployee, filterDepartment]);

  function handleViewTabChange(tab: ViewTab) {
    setViewTab(tab);
    if (tab === 'daily') {
      load(date);
    } else if (tab === 'monthly') {
      const d = `${filterYear}-${String(filterMonth).padStart(2, '0')}-01`;
      load(d);
    } else {
      const d = `${filterYear}-01-01`;
      load(d);
    }
  }

  function handleMonthYearLoad() {
    if (viewTab === 'monthly') {
      const d = `${filterYear}-${String(filterMonth).padStart(2, '0')}-01`;
      load(d);
    } else if (viewTab === 'yearly') {
      const d = `${filterYear}-01-01`;
      load(d);
    }
  }

  async function exportReport(fmt: 'excel' | 'pdf') {
    setError('');
    try {
      const token = getToken();
      const path = `/reports/attendance/export/${fmt}?year=${filterYear}&month=${filterMonth}`;
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
      a.download = `attendance-${filterYear}-${filterMonth}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Attendance Console</h1>
      <p className="text-sm text-ink/60 mb-4">Daily grid · late marks · ULOB counters (from company settings)</p>

      {/* View Tabs */}
      <div className="flex gap-1 mb-4 bg-mist/30 rounded-lg p-1 w-fit">
        {(['daily', 'monthly', 'yearly'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleViewTabChange(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              viewTab === tab ? 'bg-brand-600 text-white shadow-sm' : 'text-ink/70 hover:text-brand-700'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">Employee</label>
          <input
            type="text"
            placeholder="Search name or code…"
            className="rounded border border-mist px-3 py-2 text-sm w-48"
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">Department</label>
          <select
            className="rounded border border-mist px-3 py-2 text-sm"
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        {viewTab === 'daily' && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-ink/60">Date</label>
            <input
              type="date"
              className="rounded border border-mist px-3 py-2 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        )}
        {(viewTab === 'monthly' || viewTab === 'yearly') && (
          <>
            {viewTab === 'monthly' && (
              <div className="flex flex-col gap-1">
                <label className="text-xs text-ink/60">Month</label>
                <select
                  className="rounded border border-mist px-3 py-2 text-sm"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(Number(e.target.value))}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs text-ink/60">Year</label>
              <select
                className="rounded border border-mist px-3 py-2 text-sm"
                value={filterYear}
                onChange={(e) => setFilterYear(Number(e.target.value))}
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => viewTab === 'daily' ? load() : handleMonthYearLoad()}
          className="bg-brand-600 text-white px-4 py-2 rounded text-sm"
        >
          Load
        </button>
        <Link href="/attendance/mark" className="text-sm text-brand-600 underline ml-2 self-center">
          Web check-in
        </Link>
      </div>

      {/* Export Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => exportReport('excel')}
          className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={() => exportReport('pdf')}
          className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
        >
          Export PDF
        </button>
      </div>

      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white/80 mb-8">
        <table className="w-full text-sm">
          <thead className="bg-mist/50 text-left">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">In</th>
              <th className="px-3 py-2">Out</th>
              <th className="px-3 py-2">Late</th>
              <th className="px-3 py-2">Correct</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.employee.id} className="border-t border-mist">
                <td className="px-3 py-2">{r.employee.employeeCode}</td>
                <td className="px-3 py-2">
                  {r.employee.firstName} {r.employee.lastName}
                </td>
                <td className="px-3 py-2 text-ink/60">{r.employee.department ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[r.record?.status ?? 'A'] ?? 'bg-gray-100'}`}>
                    {r.record?.status ?? 'A'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.record?.checkInAt ? new Date(r.record.checkInAt).toLocaleTimeString() : '—'}
                </td>
                <td className="px-3 py-2">
                  {r.record?.checkOutAt ? new Date(r.record.checkOutAt).toLocaleTimeString() : '—'}
                </td>
                <td className="px-3 py-2">
                  {r.record?.isLate ? `${r.record.lateMinutes}m` : '—'}
                </td>
                <td className="px-3 py-2">
                  <select
                    className="text-xs border border-mist rounded px-1 py-1"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) correct(r.employee.id, e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Set…</option>
                    {['P', 'A', 'HD', 'L', 'WFH', 'OD', 'WO', 'H', 'ULOB', 'PL'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-ink/50">
                  {rows.length === 0 ? 'No active employees' : 'No employees match filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="font-display text-xl text-brand-700 mb-2">Late / ULOB counters</h2>
      <ul className="text-sm bg-white/80 border border-brand-100 rounded-lg divide-y divide-mist">
        {counters.length === 0 ? (
          <li className="p-3 text-ink/50">No counters yet</li>
        ) : (
          counters.map((c, i) => (
            <li key={i} className="p-3 flex justify-between">
              <span>
                {c.employee.employeeCode} {c.employee.firstName}
              </span>
              <span>
                Late {c.lateMarkCount} · ULOB {c.ulobCount}
              </span>
            </li>
          ))
        )}
      </ul>
    </main>
  );
}
