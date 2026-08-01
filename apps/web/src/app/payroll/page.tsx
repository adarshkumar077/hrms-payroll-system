'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Run = {
  id: string;
  year: number;
  month: number;
  status: string;
  generatedAt?: string | null;
  _count?: { lines: number };
};

export default function PayrollPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<Run[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterYear, setFilterYear] = useState<number | ''>('');
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [anomalies, setAnomalies] = useState<{
    averageNet?: number;
    anomalies: { employeeCode: string; name: string; flags: string[]; net: number }[];
    note?: string;
  } | null>(null);

  function load() {
    api<Run[]>('/payroll/runs')
      .then(setRuns)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['CEO', 'HR', 'FINANCE'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    load();
    api<NonNullable<typeof anomalies>>(`/ai/payroll/anomalies?year=${year}&month=${month}`)
      .then(setAnomalies)
      .catch(() => undefined);
  }, [router]);

  async function generate() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const run = await api<Run>('/payroll/generate', {
        method: 'POST',
        body: JSON.stringify({ year, month }),
      });
      setMessage(`Generated ${run.year}-${String(run.month).padStart(2, '0')} (${run.status})`);
      load();
      router.push(`/payroll/${run.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Payroll</h1>
      <p className="text-sm text-ink/60 mb-4">Generate draft → review → approve & lock</p>

      {anomalies && (
        <section className="mb-6 p-4 border border-amber-200 bg-amber-50/60 rounded-lg text-sm">
          <h2 className="font-display text-lg text-brand-700 mb-1">AI anomaly panel</h2>
          <p className="text-xs text-ink/50 mb-2">
            {anomalies.note} · avg net {anomalies.averageNet ?? '—'}
          </p>
          {(anomalies.anomalies ?? []).length === 0 ? (
            <p className="text-ink/60">No anomalies flagged for current period filters.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {anomalies.anomalies.map((a) => (
                <li key={a.employeeCode}>
                  {a.employeeCode} {a.name} (net {a.net}): {a.flags.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-3 mb-6 text-sm">
        <Link href="/payroll/ctc" className="text-brand-600 underline">
          Assign CTC
        </Link>
        <Link href="/esd" className="text-brand-600 underline">
          ESD sheet
        </Link>
        <Link href="/loans/queue" className="text-brand-600 underline">
          Loan queue
        </Link>
        <Link href="/reimbursements/queue" className="text-brand-600 underline">
          Reimbursements
        </Link>
      </div>

      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-8">
        <h2 className="font-display text-lg text-brand-700 mb-3">Generate run</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-sm">
            Year
            <input
              type="number"
              className="block border border-mist rounded px-2 py-1 mt-1 w-24"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <label className="text-sm">
            Month
            <input
              type="number"
              min={1}
              max={12}
              className="block border border-mist rounded px-2 py-1 mt-1 w-20"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={generate}
            className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Generate / regenerate'}
          </button>
        </div>
      </section>

      <section className="flex flex-wrap gap-3 items-end mb-4">
        <label className="text-sm">
          Filter year
          <select
            className="block border border-mist rounded px-2 py-1 mt-1 w-28"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All</option>
            {Array.from(new Set(runs.map((r) => r.year)))
              .sort((a, b) => b - a)
              .map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
          </select>
        </label>
        <label className="text-sm">
          Filter month
          <select
            className="block border border-mist rounded px-2 py-1 mt-1 w-28"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">All</option>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
              <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </label>
      </section>

      <ul className="space-y-2">
        {runs
          .filter((r) => (filterYear ? r.year === filterYear : true))
          .filter((r) => (filterMonth ? r.month === filterMonth : true))
          .map((r) => (
          <li key={r.id}>
            <Link
              href={`/payroll/${r.id}`}
              className="block bg-white/80 border border-brand-100 rounded-lg p-4 text-sm hover:bg-white"
            >
              <span className="font-medium">
                {r.year}-{String(r.month).padStart(2, '0')}
              </span>{' '}
              <span className="text-ink/50">· {r.status}</span>
              {r._count && <span className="text-ink/40"> · {r._count.lines} lines</span>}
            </Link>
          </li>
        ))}
        {runs.length === 0 && (
          <li className="text-ink/50 text-sm p-4 border border-dashed border-mist rounded-lg">
            No payroll runs yet
          </li>
        )}
      </ul>
    </main>
  );
}
