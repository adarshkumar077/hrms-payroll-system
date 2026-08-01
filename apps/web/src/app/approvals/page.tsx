'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { formatRoleLabel } from '@/lib/roles';

type Instance = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  summary?: string | null;
  status: string;
  currentStepOrder: number;
  workflow: { steps: { stepOrder: number; approverRole: string; label?: string | null }[] };
};

type HistoryItem = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  summary?: string | null;
  status: string;
  employeeName: string;
  completedAt: string;
  createdAt: string;
};

export default function ApprovalsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Instance[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'APPROVED' | 'REJECTED'>('ALL');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<Instance[]>('/approvals/pending')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    loadHistory();
  }

  function loadHistory(status?: string) {
    const qs = status && status !== 'ALL' ? `?status=${status}` : '';
    api<HistoryItem[]>(`/approvals/history${qs}`)
      .then(setHistory)
      .catch(() => undefined);
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['CEO', 'HR', 'MANAGER', 'FINANCE'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [router]);

  useEffect(() => {
    loadHistory(historyFilter);
  }, [historyFilter]);

  async function act(id: string, action: 'APPROVE' | 'REJECT') {
    try {
      await api(`/approvals/${id}/act`, {
        method: 'POST',
        body: JSON.stringify({ action, comment: action }),
      });
      setMessage(`${action} recorded`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Approvals Inbox</h1>
      <p className="text-sm text-ink/60 mb-4">Unified workflow queue (Module 24)</p>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <section className="mb-8">
        <h2 className="font-display text-lg text-brand-700 mb-3">Pending Approvals</h2>
        <ul className="space-y-3">
          {items.map((item) => {
            const step = item.workflow.steps.find((s) => s.stepOrder === item.currentStepOrder);
            return (
              <li key={item.id} className="bg-white/80 border border-brand-100 rounded-lg p-4 text-sm flex justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {item.type} · {item.summary ?? item.entityType}
                  </p>
                  <p className="text-ink/50 text-xs">
                    Step {item.currentStepOrder} ({formatRoleLabel(step?.label ?? step?.approverRole ?? '')}) · {item.entityId.slice(0, 8)}…
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button type="button" className="bg-brand-600 text-white px-3 py-1 rounded text-xs" onClick={() => act(item.id, 'APPROVE')}>
                    Approve
                  </button>
                  <button type="button" className="border border-red-300 text-red-700 px-3 py-1 rounded text-xs" onClick={() => act(item.id, 'REJECT')}>
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No pending approvals for your roles</li>
          )}
        </ul>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-brand-700">Approval History</h2>
          <div className="flex gap-1">
            {(['ALL', 'APPROVED', 'REJECTED'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setHistoryFilter(f)}
                className={`px-3 py-1 rounded text-xs ${historyFilter === f ? 'bg-brand-600 text-white' : 'border border-brand-200 text-ink/60'}`}
              >
                {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-brand-100 rounded-lg overflow-hidden">
              <thead className="bg-brand-50">
                <tr>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Employee</th>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Date</th>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Time</th>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-ink/60 font-medium">Request Type</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const dt = new Date(h.completedAt);
                  return (
                    <tr key={h.id} className="border-t border-brand-50">
                      <td className="px-3 py-2 font-medium">{h.employeeName || '—'}</td>
                      <td className="px-3 py-2 text-ink/60">{dt.toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-ink/60">{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${h.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {h.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-ink/60">{h.type}{h.summary ? ` — ${h.summary}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-ink/50 text-sm p-4 border border-dashed border-mist rounded-lg">No approval history</p>
        )}
      </section>
    </main>
  );
}
