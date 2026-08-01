'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { StickySaveButton } from '@/components/ui/StickySaveButton';

type LeaveType = { id: string; code: string; name: string };
type Balance = {
  available: number;
  accrued: number;
  used: number;
  leaveType: LeaveType;
};
type AppRow = {
  id: string;
  fromDate: string;
  toDate: string;
  days: number;
  status: string;
  reason?: string | null;
  leaveType: LeaveType;
};

export default function ApplyLeavePage() {
  const router = useRouter();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [form, setForm] = useState({
    leaveTypeId: '',
    fromDate: '',
    toDate: '',
    isHalfDay: false,
    reason: '',
    otherTypeNote: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    api<LeaveType[]>('/leave/types').then(setTypes).catch(() => {});
    api<Balance[]>('/me/leave/balances')
      .then(setBalances)
      .catch((e) => setError(e instanceof Error ? e.message : 'No employee profile'));
    api<AppRow[]>('/me/leave/applications').then(setApps).catch(() => {});
  }

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    load();
  }, [router]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await api('/me/leave/apply', { method: 'POST', body: JSON.stringify(form) });
      setMessage('Leave applied — pending approval');
      setForm({ ...form, reason: '', otherTypeNote: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setSaving(false);
    }
  }

  const selected = types.find((t) => t.id === form.leaveTypeId);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <StickySaveButton saving={saving} onClick={() => void submit()} label="Save" />
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Apply Leave</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-4">
        {balances.map((b) => (
          <div key={b.leaveType.id} className="bg-white/80 border border-brand-100 rounded-lg p-3 text-sm">
            <p className="text-ink/50 text-xs">{b.leaveType.code}</p>
            <p className="font-display text-xl text-brand-700">{b.available}</p>
            <p className="text-xs text-ink/50">used {b.used}</p>
          </div>
        ))}
      </div>

      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <form onSubmit={submit} className="bg-white/80 border border-brand-100 rounded-lg p-5 space-y-3 mb-8">
        <label className="block text-sm">
          Leave type
          <select
            className="mt-1 w-full rounded border border-mist px-3 py-2"
            value={form.leaveTypeId}
            onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
            required
          >
            <option value="">Select…</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
        </label>
        {selected?.code === 'OTHER' && (
          <label className="block text-sm">
            Describe Other
            <input
              className="mt-1 w-full rounded border border-mist px-3 py-2"
              value={form.otherTypeNote}
              onChange={(e) => setForm({ ...form, otherTypeNote: e.target.value })}
              required
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            From
            <input
              type="date"
              className="mt-1 w-full rounded border border-mist px-3 py-2"
              value={form.fromDate}
              onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
              required
            />
          </label>
          <label className="block text-sm">
            To
            <input
              type="date"
              className="mt-1 w-full rounded border border-mist px-3 py-2"
              value={form.toDate}
              onChange={(e) => setForm({ ...form, toDate: e.target.value })}
              required
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isHalfDay}
            onChange={(e) => setForm({ ...form, isHalfDay: e.target.checked })}
          />
          Half day
        </label>
        <label className="block text-sm">
          Reason
          <textarea
            className="mt-1 w-full rounded border border-mist px-3 py-2"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            rows={3}
          />
        </label>
        <button type="submit" className="w-full bg-brand-600 text-white py-2.5 rounded">
          Submit
        </button>
      </form>

      <h2 className="font-display text-lg mb-2">My applications</h2>
      <ul className="text-sm bg-white/80 border border-brand-100 rounded-lg divide-y divide-mist">
        {apps.map((a) => (
          <li key={a.id} className="p-3 flex justify-between gap-2">
            <div>
              <p className="font-medium">
                {a.leaveType.name} · {a.days}d
              </p>
              <p className="text-ink/60">
                {new Date(a.fromDate).toLocaleDateString()} – {new Date(a.toDate).toLocaleDateString()}
              </p>
            </div>
            <span className="text-xs">{a.status}</span>
          </li>
        ))}
        {apps.length === 0 && <li className="p-3 text-ink/50">None yet</li>}
      </ul>
    </main>
  );
}
