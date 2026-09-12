'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Shift = { id: string; code: string; name: string; startTime: string; endTime: string };
type Assignment = {
  id: string;
  date: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName?: string | null };
  shift: Shift;
};
type ChangeReq = {
  id: string;
  date: string;
  status: string;
  reason?: string | null;
  employee: { employeeCode: string; firstName: string };
  fromShift?: Shift | null;
  toShift: Shift;
};
type Emp = { id: string; employeeCode: string; firstName: string; lastName?: string | null };

export default function ShiftsPage() {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [roster, setRoster] = useState<Assignment[]>([]);
  const [changes, setChanges] = useState<ChangeReq[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [assign, setAssign] = useState({ employeeId: '', shiftId: '' });
  const [error, setError] = useState('');

  async function load(d = date) {
    try {
      let s = await api<Shift[]>('/shifts');
      if (s.length === 0) {
        s = await api<Shift[]>('/shifts/seed-defaults', { method: 'POST' });
      }
      setShifts(s);
      setRoster(await api<Assignment[]>(`/shifts/roster?from=${d}&to=${d}`));
      setChanges(await api<ChangeReq[]>('/shift-changes?status=PENDING'));
      const list = await api<{ items: Emp[] }>('/employees?pageSize=100');
      setEmployees(list.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function doAssign(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/shifts/assign', {
        method: 'POST',
        body: JSON.stringify({ ...assign, date }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed');
    }
  }

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      await api(`/shift-changes/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Shift Roster</h1>
      {error && <p className="text-red-700 text-sm mt-2">{error}</p>}

      <div className="flex gap-2 my-4 items-center">
        <input type="date" className="rounded border border-mist px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" onClick={() => load()} className="bg-brand-600 text-white px-3 py-1 rounded text-sm">
          Load day
        </button>
      </div>

      <section className="mb-6">
        <h2 className="font-display text-lg mb-2">Shifts</h2>
        <ul className="text-sm space-y-1">
          {shifts.map((s) => (
            <li key={s.id}>
              <span className="font-mono text-brand-700">{s.code}</span> {s.name} ({s.startTime}–{s.endTime})
            </li>
          ))}
        </ul>
      </section>

      <form onSubmit={doAssign} className="flex flex-wrap gap-2 mb-6 items-end bg-white/80 border border-brand-100 p-4 rounded-lg">
        <label className="text-sm">
          Employee
          <select
            className="block mt-1 rounded border border-mist px-2 py-2"
            value={assign.employeeId}
            onChange={(e) => setAssign({ ...assign, employeeId: e.target.value })}
            required
          >
            <option value="">Select…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employeeCode} {e.firstName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Shift
          <select
            className="block mt-1 rounded border border-mist px-2 py-2"
            value={assign.shiftId}
            onChange={(e) => setAssign({ ...assign, shiftId: e.target.value })}
            required
          >
            <option value="">Select…</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="bg-brand-600 text-white px-4 py-2 rounded text-sm">
          Assign
        </button>
      </form>

      <h2 className="font-display text-lg mb-2">Roster for {date}</h2>
      <ul className="text-sm bg-white/80 border border-brand-100 rounded-lg divide-y divide-mist mb-8">
        {roster.map((r) => (
          <li key={r.id} className="p-3 flex justify-between">
            <span>
              {r.employee.employeeCode} {r.employee.firstName}
            </span>
            <span className="font-mono text-brand-700">{r.shift.code}</span>
          </li>
        ))}
        {roster.length === 0 && <li className="p-3 text-ink/50">No assignments</li>}
      </ul>

      <h2 className="font-display text-lg mb-2">Pending shift changes</h2>
      <ul className="text-sm bg-white/80 border border-brand-100 rounded-lg divide-y divide-mist">
        {changes.map((c) => (
          <li key={c.id} className="p-3 flex flex-wrap justify-between gap-2">
            <div>
              {c.employee.employeeCode} {c.employee.firstName} · {new Date(c.date).toLocaleDateString()}
              <br />
              {c.fromShift?.code ?? '—'} → {c.toShift.code}
            </div>
            <div className="flex gap-2">
              <button type="button" className="text-brand-700" onClick={() => review(c.id, 'APPROVED')}>
                Approve
              </button>
              <button type="button" className="text-red-700" onClick={() => review(c.id, 'REJECTED')}>
                Reject
              </button>
            </div>
          </li>
        ))}
        {changes.length === 0 && <li className="p-3 text-ink/50">None pending</li>}
      </ul>
    </main>
  );
}
