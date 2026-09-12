'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Task = { id: string; code: string; title: string; status: string };
type Row = {
  id: string;
  status: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName?: string | null };
  tasks: Task[];
};

export default function OnboardingPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<{ id: string; employeeCode: string; firstName: string }[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [candName, setCandName] = useState('');
  const [roleTarget, setRoleTarget] = useState('Software Developer');
  const [resumeText, setResumeText] = useState('');
  const [screenResult, setScreenResult] = useState<{ score: number; summary: string } | null>(null);

  function load() {
    api<Row[]>('/onboarding')
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    load();
    api<{ items: { id: string; employeeCode: string; firstName: string }[] }>('/employees?pageSize=100')
      .then((r) => {
        setEmployees(r.items ?? []);
        if (r.items?.[0]) setEmployeeId(r.items[0].id);
      })
      .catch(() => undefined);
  }, [router]);

  async function start() {
    try {
      await api('/onboarding/start', {
        method: 'POST',
        body: JSON.stringify({ employeeId }),
      });
      setMessage('Onboarding started');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function markDone(checklistId: string, taskId: string) {
    try {
      await api(`/onboarding/${checklistId}/task/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'DONE' }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function screenResume() {
    setError('');
    try {
      const r = await api<{ score: number; summary: string }>('/ai/resume/screen', {
        method: 'POST',
        body: JSON.stringify({
          candidateName: candName || 'Candidate',
          roleTarget,
          resumeText,
        }),
      });
      setScreenResult(r);
      setMessage(`Resume screened: ${r.score}/100`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Screening failed');
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Onboarding</h1>
      <p className="text-sm text-ink/60 mb-4">Checklist: registration → docs → account → welcome → assets → training</p>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <section className="flex flex-wrap gap-2 items-end mb-6 text-sm">
        <select
          className="border border-mist rounded px-2 py-2"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.employeeCode} {e.firstName}
            </option>
          ))}
        </select>
        <button type="button" onClick={start} className="bg-brand-600 text-white px-4 py-2 rounded">
          Start checklist
        </button>
      </section>

      <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
        <h2 className="font-display text-lg text-brand-700">AI resume screening</h2>
        <input
          className="border border-mist rounded px-2 py-2 w-full"
          placeholder="Candidate name"
          value={candName}
          onChange={(e) => setCandName(e.target.value)}
        />
        <input
          className="border border-mist rounded px-2 py-2 w-full"
          placeholder="Role target"
          value={roleTarget}
          onChange={(e) => setRoleTarget(e.target.value)}
        />
        <textarea
          className="border border-mist rounded px-2 py-2 w-full"
          rows={5}
          placeholder="Paste resume text"
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
        />
        <button type="button" onClick={screenResume} className="bg-brand-600 text-white px-4 py-2 rounded">
          Screen resume
        </button>
        {screenResult && (
          <p className="text-ink/70">
            Score {screenResult.score}: {screenResult.summary}
          </p>
        )}
      </section>

      <ul className="space-y-4">
        {rows.map((row) => (
          <li key={row.id} className="bg-white/80 border border-brand-100 rounded-lg p-4 text-sm">
            <p className="font-medium">
              {row.employee.employeeCode} {row.employee.firstName} · {row.status}
            </p>
            <ul className="mt-2 space-y-1">
              {row.tasks.map((t) => (
                <li key={t.id} className="flex justify-between gap-2 items-center">
                  <span>
                    {t.title}{' '}
                    <span className="text-ink/40">({t.status})</span>
                  </span>
                  {t.status === 'PENDING' && (
                    <button
                      type="button"
                      className="text-xs bg-brand-600 text-white px-2 py-1 rounded"
                      onClick={() => markDone(row.id, t.id)}
                    >
                      Done
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No checklists yet</li>
        )}
      </ul>
    </main>
  );
}
