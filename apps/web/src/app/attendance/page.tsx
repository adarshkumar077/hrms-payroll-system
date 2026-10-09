'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';
import { canManageAttendance, canUpdateAttendance } from '@/lib/roles';
import { notifyAttendanceChanged, onAttendanceChanged } from '@/lib/attendance-sync';

type Row = {
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName?: string | null;
    department?: string | null;
  };
  record: {
    status: string;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    isLate: boolean;
    lateMinutes: number;
    method?: string | null;
    selfieUrl?: string | null;
    checkInSelfieUrl?: string | null;
    checkOutSelfieUrl?: string | null;
    checkInAddress?: string | null;
    checkOutAddress?: string | null;
    checkInMapsUrl?: string | null;
    checkOutMapsUrl?: string | null;
    checkInLatitude?: number | null;
    checkInLongitude?: number | null;
    checkOutLatitude?: number | null;
    checkOutLongitude?: number | null;
    workMinutes?: number | null;
    overtimeMinutes?: number;
    todaysEarnings?: number | null;
    checkOutSource?: string | null;
    checkOutLabel?: string | null;
  } | null;
};

type RecordDetail = {
  employee: { id: string; employeeCode: string; firstName: string; lastName?: string | null };
  date: string;
  record: Row['record'] & { id?: string } | null;
  punches: unknown[];
  auditLogs: { id: string; action: string; createdAt: string; note?: string | null }[];
  formatted: {
    inTime: string;
    outTime: string;
    inLocation: string;
    outLocation: string;
    workingHours: string;
    overtime: string;
    checkOutSource?: string | null;
    checkOutLabel?: string | null;
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

function shortLocation(address?: string | null): string {
  if (!address?.trim()) return '—';
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}, ${parts[1]}`;
}

function mapsEmbedUrl(mapsUrl?: string | null, lat?: number | null, lng?: number | null): string | null {
  if (lat != null && lng != null) {
    return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
  }
  if (mapsUrl) {
    try {
      const u = new URL(mapsUrl);
      const q = u.searchParams.get('q');
      if (q) return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function punchedAtForDate(dateStr: string, localDateTime: string): string {
  const fromInput = datetimeLocalToIso(localDateTime);
  if (fromInput) return fromInput;
  const now = new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), 0).toISOString();
}

export default function AttendanceConsolePage() {
  return (
    <Suspense
      fallback={
        <main className="max-w-6xl mx-auto px-4 py-10">
          <p className="text-sm text-ink/50">Loading attendance…</p>
        </main>
      }
    >
      <AttendanceConsoleInner />
    </Suspense>
  );
}

function AttendanceConsoleInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [date, setDate] = useState(
    searchParams.get('date') ?? new Date().toISOString().slice(0, 10),
  );
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
  const [detail, setDetail] = useState<RecordDetail | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canUpdate, setCanUpdate] = useState(false);
  const [editStatus, setEditStatus] = useState('P');
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(d = date) {
    setError('');
    try {
      const [nextRows, nextCounters] = await Promise.all([
        api<Row[]>(`/attendance/console?date=${d}`),
        api<typeof counters>('/attendance/counters').catch(() => [] as typeof counters),
      ]);
      setRows(nextRows);
      setCounters(nextCounters);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attendance');
    }
  }

  async function openDetail(employeeId: string, d: string) {
    setError('');
    try {
      const res = await api<RecordDetail>(`/attendance/records/${employeeId}/${d}`);
      setDetail(res);
      setEditStatus(res.record?.status ?? 'P');
      setEditIn(toDatetimeLocal(res.record?.checkInAt));
      setEditOut(toDatetimeLocal(res.record?.checkOutAt));
      setEditNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load detail');
    }
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    setCanManage(canManageAttendance(u));
    setCanUpdate(canUpdateAttendance(u));
    void load();
    const empId = searchParams.get('employeeId');
    const d = searchParams.get('date');
    if (empId && d) {
      void openDetail(empId, d);
    }
    return onAttendanceChanged(() => {
      void load(date);
      if (detail?.employee.id) void openDetail(detail.employee.id, detail.date);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function correct(employeeId: string, status: string) {
    setMessage('');
    setError('');
    try {
      await api(`/attendance/${employeeId}/${date}`, {
        method: 'PUT',
        body: JSON.stringify({ status, correctionNote: `Manual set to ${status}` }),
      });
      setMessage('Corrected');
      notifyAttendanceChanged({ employeeId, date, source: 'console-correct' });
      await load();
      if (detail?.employee.id === employeeId) await openDetail(employeeId, date);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Correction failed');
    }
  }

  async function saveCorrection() {
    if (!detail || !canUpdate) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      // Status/note always; punch times only when HR/Super Admin fills them.
      // Never send selfie/location/method so original capture data is preserved.
      const body: Record<string, unknown> = {
        status: editStatus,
        correctionNote:
          editNote.trim() || `Attendance updated to ${editStatus} by Admin/HR/Super Admin`,
      };
      if (canManage) {
        const inIso = datetimeLocalToIso(editIn);
        const outIso = datetimeLocalToIso(editOut);
        if (inIso) body.checkInAt = inIso;
        if (outIso) body.checkOutAt = outIso;
      }
      await api(`/attendance/${detail.employee.id}/${detail.date}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setMessage('Attendance updated');
      notifyAttendanceChanged({
        employeeId: detail.employee.id,
        date: detail.date,
        source: 'console-save',
      });
      await load(detail.date);
      await openDetail(detail.employee.id, detail.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function manualPunch(punchType: 'IN' | 'OUT') {
    if (!detail || !canManage) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await api('/attendance/manual', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: detail.employee.id,
          punchType,
          method: 'MANUAL',
          punchedAt: punchedAtForDate(detail.date, punchType === 'IN' ? editIn : editOut),
          note: editNote.trim() || `HR/Super Admin manual ${punchType}`,
        }),
      });
      setMessage(`Marked ${punchType}`);
      notifyAttendanceChanged({
        employeeId: detail.employee.id,
        date: detail.date,
        source: `console-${punchType}`,
      });
      await load(detail.date);
      await openDetail(detail.employee.id, detail.date);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Mark ${punchType} failed`);
    } finally {
      setSaving(false);
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

  const inEmbed = detail?.record
    ? mapsEmbedUrl(
        detail.record.checkInMapsUrl,
        detail.record.checkInLatitude,
        detail.record.checkInLongitude,
      )
    : null;
  const outEmbed =
    detail?.record && detail.record.checkOutSource !== 'SYSTEM_LOGOUT'
      ? mapsEmbedUrl(
          detail.record.checkOutMapsUrl,
          detail.record.checkOutLatitude,
          detail.record.checkOutLongitude,
        )
      : null;

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Attendance Console</h1>
      <p className="text-sm text-ink/60 mb-4">
        Daily grid · late marks · ULOB counters
        {canUpdate
          ? ' · Admin / HR / Super Admin can Edit / Update Attendance'
          : ' · view only'}
        {canManage ? ' · HR / Super Admin can also Mark IN/OUT' : ''}
      </p>

      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <Link href="/attendance/sheet" className="text-brand-600 underline">
          Attendance Sheet
        </Link>
        <Link href="/attendance/mark" className="text-brand-600 underline">
          Web check-in
        </Link>
      </div>

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
              <option key={d} value={d}>
                {d}
              </option>
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
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
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
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => (viewTab === 'daily' ? load() : handleMonthYearLoad())}
          className="bg-brand-600 text-white px-4 py-2 rounded text-sm"
        >
          Load
        </button>
      </div>

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
              <th className="px-3 py-2">Selfie</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">In</th>
              <th className="px-3 py-2">Out</th>
              <th className="px-3 py-2">OUT source</th>
              <th className="px-3 py-2">Late</th>
              <th className="px-3 py-2">Edit / Update</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => {
              const selfie =
                r.record?.checkInSelfieUrl || r.record?.selfieUrl || r.record?.checkOutSelfieUrl;
              const loc = shortLocation(r.record?.checkInAddress || r.record?.checkOutAddress);
              return (
                <tr key={r.employee.id} className="border-t border-mist">
                  <td className="px-3 py-2">{r.employee.employeeCode}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-brand-600 hover:underline text-left"
                      onClick={() => openDetail(r.employee.id, date)}
                    >
                      {r.employee.firstName} {r.employee.lastName}
                    </button>
                    <div className="text-xs">
                      <Link
                        href={`/attendance/sheet?employeeId=${r.employee.id}`}
                        className="text-ink/50 hover:text-brand-600"
                      >
                        Sheet
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {selfie ? (
                      <button type="button" onClick={() => setLightbox(selfie)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={selfie}
                          alt="Selfie"
                          className="w-9 h-9 rounded object-cover border border-mist"
                        />
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink/70 max-w-[140px]">
                    {r.record?.checkInMapsUrl ? (
                      <a
                        href={r.record.checkInMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 hover:underline"
                      >
                        {loc}
                      </a>
                    ) : (
                      loc
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[r.record?.status ?? 'A'] ?? 'bg-gray-100'}`}
                    >
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
                    {r.record?.checkOutLabel ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          r.record.checkOutSource === 'SYSTEM_LOGOUT'
                            ? 'bg-amber-100 text-amber-900 font-medium'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {r.record.checkOutLabel}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.record?.isLate ? `${r.record.lateMinutes}m` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {canUpdate ? (
                      <select
                        className="text-xs border border-mist rounded px-1 py-1"
                        defaultValue=""
                        aria-label="Edit / Update Attendance"
                        onChange={(e) => {
                          if (e.target.value) correct(r.employee.id, e.target.value);
                          e.target.value = '';
                        }}
                      >
                        <option value="">Edit…</option>
                        {['P', 'A', 'HD', 'L', 'WFH', 'OD', 'WO', 'H', 'PH', 'ULOB', 'PL'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-ink/40">View only</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-ink/50">
                  {rows.length === 0 ? 'No active employees' : 'No employees match filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="mb-8 p-4 rounded-lg border border-brand-100 bg-white/90">
          <div className="flex justify-between items-start gap-2 mb-3">
            <div>
              <h2 className="font-display text-xl text-brand-700">
                {detail.employee.employeeCode} {detail.employee.firstName}{' '}
                {detail.employee.lastName}
              </h2>
              <p className="text-sm text-ink/60">{detail.date}</p>
            </div>
            <button
              type="button"
              className="text-sm text-ink/50 hover:text-ink"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
          {detail.record ? (
            <>
              <div className="grid sm:grid-cols-2 gap-3 text-sm mb-4">
                <div>
                  <p className="font-medium">Check-in</p>
                  <p>{detail.formatted?.inTime ?? '—'}</p>
                  <p className="text-ink/60 text-xs">{detail.formatted?.inLocation}</p>
                  {detail.record.checkInSelfieUrl && (
                    <button
                      type="button"
                      className="mt-1"
                      onClick={() => setLightbox(detail.record!.checkInSelfieUrl!)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.record.checkInSelfieUrl}
                        alt="Check-in selfie"
                        className="w-20 h-20 rounded object-cover border"
                      />
                    </button>
                  )}
                  {inEmbed && (
                    <iframe
                      title="Check-in map"
                      src={inEmbed}
                      className="mt-2 w-full h-40 rounded border border-mist"
                      loading="lazy"
                    />
                  )}
                </div>
                <div>
                  <p className="font-medium">Check-out</p>
                  <p>{detail.formatted?.outTime ?? '—'}</p>
                  {detail.record.checkOutLabel && (
                    <p
                      className={`text-xs font-medium mt-0.5 ${
                        detail.record.checkOutSource === 'SYSTEM_LOGOUT'
                          ? 'text-amber-800'
                          : 'text-ink/70'
                      }`}
                    >
                      {detail.record.checkOutLabel}
                    </p>
                  )}
                  {detail.record.checkOutSource !== 'SYSTEM_LOGOUT' && (
                    <p className="text-ink/60 text-xs">{detail.formatted?.outLocation}</p>
                  )}
                  {detail.record.checkOutSource === 'SYSTEM_LOGOUT' && (
                    <p className="text-xs text-ink/50 mt-1">
                      Automatic OUT at 10:00 PM — no selfie or GPS.
                    </p>
                  )}
                  {detail.record.checkOutSelfieUrl && (
                    <button
                      type="button"
                      className="mt-1"
                      onClick={() => setLightbox(detail.record!.checkOutSelfieUrl!)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.record.checkOutSelfieUrl}
                        alt="Check-out selfie"
                        className="w-20 h-20 rounded object-cover border"
                      />
                    </button>
                  )}
                  {outEmbed && (
                    <iframe
                      title="Check-out map"
                      src={outEmbed}
                      className="mt-2 w-full h-40 rounded border border-mist"
                      loading="lazy"
                    />
                  )}
                </div>
              </div>
              <p className="text-sm mb-2">
                Status: {detail.record.status} · Hours: {detail.formatted?.workingHours} · OT:{' '}
                {detail.formatted?.overtime}
                {detail.record.todaysEarnings != null
                  ? ` · Earnings: ₹${detail.record.todaysEarnings.toFixed(2)}`
                  : ''}
              </p>
              {detail.auditLogs.length > 0 && (
                <div className="text-xs text-ink/60">
                  <p className="font-medium text-ink/80 mb-1">Audit</p>
                  <ul className="space-y-0.5">
                    {detail.auditLogs.map((a) => (
                      <li key={a.id}>
                        {a.action} · {new Date(a.createdAt).toLocaleString()}
                        {a.note ? ` — ${a.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-ink/50">No record for this date</p>
          )}
          {canUpdate && (
            <div className="mt-4 pt-4 border-t border-mist space-y-3">
              <p className="font-medium text-sm text-brand-700">Edit / Update Attendance</p>
              <p className="text-xs text-ink/50">
                Updates the existing record (no duplicate). Original photo, location, and punch
                times are kept unless HR/Super Admin changes times below. Audit log records every
                change.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <label className="flex flex-col gap-1">
                  Status
                  <select
                    className="rounded border border-mist px-2 py-1.5"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    {['P', 'A', 'HD', 'L', 'WFH', 'OD', 'WO', 'H', 'PH', 'ULOB', 'PL'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  Update note
                  <input
                    className="rounded border border-mist px-2 py-1.5"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="Reason for this change"
                  />
                </label>
                {canManage && (
                  <>
                    <label className="flex flex-col gap-1">
                      Check-in
                      <input
                        type="datetime-local"
                        className="rounded border border-mist px-2 py-1.5"
                        value={editIn}
                        onChange={(e) => setEditIn(e.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      Check-out
                      <input
                        type="datetime-local"
                        className="rounded border border-mist px-2 py-1.5"
                        value={editOut}
                        onChange={(e) => setEditOut(e.target.value)}
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {canManage && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => manualPunch('IN')}
                      className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white disabled:opacity-60"
                    >
                      Mark IN
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => manualPunch('OUT')}
                      className="text-sm px-3 py-1.5 rounded bg-brand-900 text-white disabled:opacity-60"
                    >
                      Mark OUT
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveCorrection}
                  className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 disabled:opacity-60"
                >
                  Update Attendance
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
            className="max-w-full max-h-[90vh] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}
