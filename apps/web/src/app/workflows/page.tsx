'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { formatRoleLabel } from '@/lib/roles';

type Step = { stepOrder: number; approverRole: string; label?: string | null };
type Wf = { id: string; type: string; name: string; steps: Step[] };

export default function WorkflowsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Wf[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editType, setEditType] = useState('LEAVE');
  const [stepsJson, setStepsJson] = useState(
    '[{"stepOrder":1,"approverRole":"MANAGER","label":"Manager"},{"stepOrder":2,"approverRole":"HR","label":"HR"}]',
  );

  function load() {
    api<Wf[]>('/workflows')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['CEO', 'HR'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [router]);

  async function save() {
    try {
      const steps = JSON.parse(stepsJson);
      await api(`/workflows/${editType}/config`, {
        method: 'POST',
        body: JSON.stringify({ steps }),
      });
      setMessage(`Saved ${editType}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Approval Workflows</h1>
      <p className="text-sm text-ink/60 mb-4">Configure chains for leave, loan, expense, resignation</p>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <ul className="space-y-2 text-sm mb-8">
        {items.map((w) => (
          <li key={w.id} className="bg-white/80 border border-brand-100 rounded-lg p-3">
            <p className="font-medium">
              {w.type} · {w.name}
            </p>
            <p className="text-ink/50">
              {w.steps.map((s) => `${s.stepOrder}:${formatRoleLabel(s.label ?? s.approverRole)}`).join(' → ')}
            </p>
          </li>
        ))}
      </ul>

      <section className="bg-white/80 border border-brand-100 rounded-lg p-4 text-sm space-y-2">
        <h2 className="font-display text-lg text-brand-700">Edit config</h2>
        <select className="border border-mist rounded px-2 py-2 w-full" value={editType} onChange={(e) => setEditType(e.target.value)}>
          {['LEAVE', 'LOAN', 'ADVANCE', 'EXPENSE', 'RESIGNATION', 'SALARY'].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <textarea className="border border-mist rounded px-2 py-2 w-full font-mono text-xs" rows={5} value={stepsJson} onChange={(e) => setStepsJson(e.target.value)} />
        <button type="button" onClick={save} className="bg-brand-600 text-white px-4 py-2 rounded">
          Save
        </button>
      </section>

      <p className="mt-4 text-sm">
        <Link href="/approvals" className="text-brand-600 underline">
          Open approvals inbox →
        </Link>
      </p>
    </main>
  );
}
