'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Ticket = {
  id: string;
  ticketNo: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  requester: { employeeCode: string; firstName: string };
  _count?: { comments: number };
};

export default function TicketsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Ticket[]>([]);
  const [category, setCategory] = useState('IT');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [hasEmployee, setHasEmployee] = useState(false);
  const [isHr, setIsHr] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<Ticket[]>('/tickets')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setHasEmployee(!!u.employeeId);
    setIsHr(u.roles.some((r) => ['CEO', 'HR', 'MANAGER'].includes(r)));
    load();
  }, [router]);

  async function create() {
    try {
      await api('/tickets', {
        method: 'POST',
        body: JSON.stringify({ category, subject, description, priority: 'MEDIUM' }),
      });
      setMessage('Ticket created');
      setSubject('');
      setDescription('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function resolve(id: string) {
    try {
      await api(`/tickets/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED' }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function escalate(id: string) {
    try {
      await api(`/tickets/${id}/escalate`, { method: 'POST', body: '{}' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function runSla() {
    try {
      const r = await api<{ escalated: number }>('/tickets/sla/run', { method: 'POST', body: '{}' });
      setMessage(`SLA run: escalated ${r.escalated}`);
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
      <h1 className="font-display text-3xl text-brand-700 mt-2">Helpdesk</h1>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {hasEmployee && (
        <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
          <select className="border border-mist rounded px-2 py-2 w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
            {['HR', 'IT', 'FINANCE', 'ADMIN'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input className="border border-mist rounded px-2 py-2 w-full" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="border border-mist rounded px-2 py-2 w-full" rows={3} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <button type="button" onClick={create} className="bg-brand-600 text-white px-4 py-2 rounded">
            Raise ticket
          </button>
        </section>
      )}

      {isHr && (
        <button type="button" onClick={runSla} className="mb-4 text-sm underline text-brand-600">
          Run SLA escalation job
        </button>
      )}

      <ul className="space-y-2 text-sm">
        {items.map((t) => (
          <li key={t.id} className="bg-white/80 border border-brand-100 rounded-lg p-3">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-medium">
                  {t.ticketNo} · {t.subject}
                </p>
                <p className="text-ink/50">
                  {t.category}/{t.priority} · {t.status} · {t.requester.employeeCode}{' '}
                  {t.requester.firstName}
                  {t._count ? ` · ${t._count.comments} comments` : ''}
                </p>
              </div>
              {isHr && t.status !== 'RESOLVED' && t.status !== 'CLOSED' && (
                <div className="flex flex-col gap-1">
                  <button type="button" className="text-xs bg-brand-600 text-white px-2 py-1 rounded" onClick={() => resolve(t.id)}>
                    Resolve
                  </button>
                  <button type="button" className="text-xs border px-2 py-1 rounded" onClick={() => escalate(t.id)}>
                    Escalate
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No tickets</li>}
      </ul>
    </main>
  );
}
