'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Training = {
  id: string;
  code: string;
  title: string;
  status: string;
  _count?: { assignments: number };
};

type Mine = {
  id: string;
  status: string;
  training: { id: string; title: string; code: string };
  certification?: { certificateNo?: string | null } | null;
};

export default function TrainingsPage() {
  const router = useRouter();
  const [list, setList] = useState<Training[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [employees, setEmployees] = useState<{ id: string; employeeCode: string; firstName: string }[]>([]);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [isHr, setIsHr] = useState(false);
  const [hasEmployee, setHasEmployee] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<Training[]>('/trainings').then(setList).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setIsHr(u.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r)));
    setHasEmployee(!!u.employeeId);
    load();
    if (u.employeeId) {
      api<Mine[]>('/me/trainings').then(setMine).catch(() => undefined);
    }
    if (u.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r))) {
      api<{ items: { id: string; employeeCode: string; firstName: string }[] }>('/employees?pageSize=100&isActive=true')
        .then((r) => setEmployees(r.items ?? []))
        .catch(() => undefined);
    }
  }, [router]);

  async function create() {
    try {
      await api('/trainings', { method: 'POST', body: JSON.stringify({ code, title }) });
      setMessage('Training created');
      setCode('');
      setTitle('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function assign(trainingId: string) {
    const employeeId = employees[0]?.id ?? window.prompt('Employee id');
    if (!employeeId) return;
    try {
      await api(`/trainings/${trainingId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ employeeId }),
      });
      setMessage('Assigned');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function complete(trainingId: string) {
    try {
      await api(`/trainings/${trainingId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ score: 90, issueCertificate: true }),
      });
      setMessage('Completed + certificate');
      api<Mine[]>('/me/trainings').then(setMine);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Training</h1>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {isHr && (
        <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
          <input className="border border-mist rounded px-2 py-2 w-full" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="border border-mist rounded px-2 py-2 w-full" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="button" onClick={create} className="bg-brand-600 text-white px-4 py-2 rounded">
            Create training
          </button>
        </section>
      )}

      <ul className="space-y-2 text-sm mb-8">
        {list.map((t) => (
          <li key={t.id} className="bg-white/80 border border-brand-100 rounded-lg p-3 flex justify-between gap-2">
            <div>
              <p className="font-medium">
                {t.code} · {t.title}
              </p>
              <p className="text-ink/50">
                {t.status} · {t._count?.assignments ?? 0} assigned
              </p>
            </div>
            {isHr && (
              <button type="button" className="text-xs bg-brand-600 text-white px-2 py-1 rounded h-fit" onClick={() => assign(t.id)}>
                Assign
              </button>
            )}
          </li>
        ))}
      </ul>

      {hasEmployee && (
        <>
          <h2 className="font-display text-xl text-brand-700 mb-2">My assignments</h2>
          <ul className="space-y-2 text-sm">
            {mine.map((m) => (
              <li key={m.id} className="bg-white/80 border border-brand-100 rounded-lg p-3 flex justify-between">
                <div>
                  <p className="font-medium">{m.training.title}</p>
                  <p className="text-ink/50">
                    {m.status}
                    {m.certification?.certificateNo ? ` · ${m.certification.certificateNo}` : ''}
                  </p>
                </div>
                {m.status !== 'COMPLETED' && (
                  <button type="button" className="text-xs bg-brand-600 text-white px-2 py-1 rounded" onClick={() => complete(m.training.id)}>
                    Complete
                  </button>
                )}
              </li>
            ))}
            {mine.length === 0 && <li className="text-ink/50">No assignments</li>}
          </ul>
        </>
      )}
    </main>
  );
}
