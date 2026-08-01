'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type CalItem = {
  id: string;
  fromDate: string;
  toDate: string;
  days: number;
  status: string;
  leaveType: { name: string; code: string };
  employee: { employeeCode: string; firstName: string; lastName?: string | null; department?: string | null };
};

const STATUS_OPTIONS = ['ALL', 'APPROVED', 'PENDING', 'REJECTED'] as const;

const statusColors: Record<string, string> = {
  APPROVED: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  REJECTED: 'bg-red-100 text-red-800',
  WITHDRAWN: 'bg-gray-100 text-gray-600',
};

export default function LeaveCalendarPage() {
  const router = useRouter();
  const [items, setItems] = useState<CalItem[]>([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('ALL');
  const year = new Date().getFullYear();

  function load(s = search, dept = department, st = status) {
    const params = new URLSearchParams();
    params.set('from', `${year}-01-01`);
    params.set('to', `${year}-12-31`);
    if (s) params.set('search', s);
    if (dept) params.set('department', dept);
    if (st && st !== 'ALL') params.set('status', st);
    api<CalItem[]>(`/leave/calendar?${params}`)
      .then(setItems)
      .catch(() => setItems([]));
  }

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, year]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Leave Calendar</h1>
      <p className="text-sm text-ink/60 mb-4">Leave records for {year}</p>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className="flex-1 min-w-[180px] rounded border border-mist px-3 py-2 bg-white text-sm"
          placeholder="Search employee name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <input
          className="w-40 rounded border border-mist px-3 py-2 bg-white text-sm"
          placeholder="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <select
          className="w-36 rounded border border-mist px-3 py-2 bg-white text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            load(search, department, e.target.value);
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'All Status' : s}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => load()}
          className="px-4 py-2 rounded bg-white border border-mist text-sm"
        >
          Search
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white/80">
        <table className="w-full text-sm">
          <thead className="bg-mist/60 text-left">
            <tr>
              <th className="px-3 py-2">Employee</th>
              <th className="px-3 py-2">Department</th>
              <th className="px-3 py-2">Leave Type</th>
              <th className="px-3 py-2">From</th>
              <th className="px-3 py-2">To</th>
              <th className="px-3 py-2">Days</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink/50">
                  No leave records found for the selected filters.
                </td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={i.id} className="border-t border-mist hover:bg-mist/30">
                  <td className="px-3 py-2 font-medium">
                    {i.employee.firstName} {i.employee.lastName ?? ''}
                    <span className="text-ink/50 ml-1 text-xs">({i.employee.employeeCode})</span>
                  </td>
                  <td className="px-3 py-2 text-ink/70">{i.employee.department ?? '—'}</td>
                  <td className="px-3 py-2">{i.leaveType.name}</td>
                  <td className="px-3 py-2">{new Date(i.fromDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{new Date(i.toDate).toLocaleDateString()}</td>
                  <td className="px-3 py-2">{i.days}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${statusColors[i.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {i.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink/40 mt-2">{items.length} records</p>
    </main>
  );
}
