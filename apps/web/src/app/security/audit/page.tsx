'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';



type Row = {
  id: string;
  at: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  actorEmail: string;
  ipAddress: string;
};

export default function AuditLogPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [error, setError] = useState('');

  function load(a = action, e = entityType) {
    const qs = new URLSearchParams({ limit: '300' });
    if (a) qs.set('action', a);
    if (e) qs.set('entityType', e);
    api<{ rows: Row[] }>(`/security/audit?${qs}`)
      .then((r) => setRows(r.rows))
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.includes('CEO')) {
      router.replace('/dashboard');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function exportCsv() {
    const token = getToken();
    const res = await fetch(`${getApiBaseUrl()}/security/audit/export/csv?limit=1000`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <Link href="/security" className="text-sm text-brand-600 hover:underline">
        ← Security Settings
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Audit Log</h1>
      <p className="text-sm text-ink/60 mb-4">Credential and permission changes, logins, updates</p>

      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        <input
          className="border border-brand-200 rounded px-2 py-1"
          placeholder="Action filter"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <input
          className="border border-brand-200 rounded px-2 py-1"
          placeholder="Entity type"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
        />
        <button
          type="button"
          onClick={() => load()}
          className="px-3 py-1.5 rounded bg-brand-600 text-white"
        >
          Filter
        </button>
        <button
          type="button"
          onClick={() => exportCsv()}
          className="px-3 py-1.5 rounded border border-brand-300"
        >
          Export CSV
        </button>
      </div>

      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}

      <div className="overflow-x-auto border border-brand-100 rounded-lg bg-white/80">
        <table className="min-w-full text-xs">
          <thead className="bg-brand-50 text-left">
            <tr>
              <th className="px-2 py-2">At</th>
              <th className="px-2 py-2">Action</th>
              <th className="px-2 py-2">Entity</th>
              <th className="px-2 py-2">Actor</th>
              <th className="px-2 py-2">IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-brand-50">
                <td className="px-2 py-1.5 whitespace-nowrap">{new Date(r.at).toLocaleString()}</td>
                <td className="px-2 py-1.5">{r.action}</td>
                <td className="px-2 py-1.5">
                  {r.entityType}
                  {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ''}
                </td>
                <td className="px-2 py-1.5">{r.actorName || r.actorEmail || '—'}</td>
                <td className="px-2 py-1.5">{r.ipAddress || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="text-sm text-ink/50 p-4">No audit rows</p>}
      </div>
    </main>
  );
}
