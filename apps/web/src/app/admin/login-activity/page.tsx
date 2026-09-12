'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isSuperAdmin } from '@/lib/roles';
import {
  ModuleAlert,
  ModulePage,
  ModuleSecondaryButton,
  ModuleSelect,
  StatusPill,
} from '@/components/layout/ModulePage';

type Session = {
  id: string;
  userName: string;
  loginId: string;
  employeeId: string | null;
  roles: string[];
  loginAt: string;
  logoutAt: string | null;
  durationMinutes: number | null;
  ipAddress: string | null;
  device: string | null;
  browser: string | null;
  status: string;
  isOnline: boolean;
};

export default function LoginActivityPage() {
  const router = useRouter();
  const [items, setItems] = useState<Session[]>([]);
  const [filter, setFilter] = useState('today');
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');

  function load() {
    const q = new URLSearchParams();
    if (filter) q.set('filter', filter);
    if (userId.trim()) q.set('userId', userId.trim());
    api<Session[]>(`/admin/login-sessions?${q}`)
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!isSuperAdmin(u)) {
      router.replace('/dashboard');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const onlineCount = useMemo(() => items.filter((s) => s.isOnline).length, [items]);

  return (
    <ModulePage title="Login Activity" subtitle="Session history and live online users">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <div>
          <label className="text-xs text-ink/60 block mb-1">Period</label>
          <ModuleSelect className="w-40" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="today">Today</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="">All</option>
          </ModuleSelect>
        </div>
        <div>
          <label className="text-xs text-ink/60 block mb-1">User ID filter</label>
          <input
            className="border border-mist rounded px-2 py-2 text-sm w-48"
            placeholder="User ID (optional)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </div>
        <ModuleSecondaryButton type="button" onClick={load}>
          Apply
        </ModuleSecondaryButton>
        <StatusPill tone="success">{onlineCount} online</StatusPill>
      </div>

      <div className="overflow-x-auto bg-white/80 border border-brand-100 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist text-left text-ink/60">
              <th className="p-3">User</th>
              <th className="p-3">Employee ID</th>
              <th className="p-3">Role</th>
              <th className="p-3">Login</th>
              <th className="p-3">Logout</th>
              <th className="p-3">Duration</th>
              <th className="p-3">Device</th>
              <th className="p-3">IP</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-mist/50">
                <td className="p-3">
                  <p className="font-medium">{s.userName}</p>
                  <p className="text-xs text-ink/50">{s.loginId}</p>
                </td>
                <td className="p-3">{s.employeeId ?? '—'}</td>
                <td className="p-3">{s.roles.join(', ')}</td>
                <td className="p-3">{new Date(s.loginAt).toLocaleString()}</td>
                <td className="p-3">{s.logoutAt ? new Date(s.logoutAt).toLocaleString() : '—'}</td>
                <td className="p-3">{s.durationMinutes != null ? `${s.durationMinutes} min` : '—'}</td>
                <td className="p-3">
                  {s.device ?? '—'}
                  {s.browser ? ` · ${s.browser}` : ''}
                </td>
                <td className="p-3">{s.ipAddress ?? '—'}</td>
                <td className="p-3">
                  <StatusPill tone={s.isOnline ? 'success' : 'neutral'}>{s.status}</StatusPill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="p-4 text-ink/50 text-sm">No sessions found</p>}
      </div>
    </ModulePage>
  );
}
