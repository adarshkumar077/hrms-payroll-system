'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Goal = {
  id: string;
  title: string;
  kra?: string | null;
  kpi?: string | null;
  cycleYear: number;
  status: string;
  employee: { employeeCode: string; firstName: string };
};

type Reward = {
  id: string;
  type: string;
  title: string;
  description?: string;
  amount?: number;
  date?: string;
};

export default function PerformancePage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [employees, setEmployees] = useState<{ id: string; employeeCode: string; firstName: string }[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [title, setTitle] = useState('');
  const [kra, setKra] = useState('');
  const [kpi, setKpi] = useState('');
  const [summary, setSummary] = useState('');
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(4);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isHr, setIsHr] = useState(false);
  const [hasEmployee, setHasEmployee] = useState(false);
  const [insight, setInsight] = useState<{
    completionRatePct: number;
    insight: string;
    totals: Record<string, number>;
  } | null>(null);
  const year = new Date().getFullYear();

  function load() {
    api<Goal[]>(`/performance/goals?cycleYear=${year}`)
      .then(setGoals)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }

    const hrAccess = u.roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN'].includes(r));
    setIsHr(hrAccess);
    setHasEmployee(!!u.employeeId);

    if (hrAccess) {
      load();
      api<NonNullable<typeof insight>>('/ai/performance/insights')
        .then(setInsight)
        .catch(() => undefined);
      api<{ items: { id: string; employeeCode: string; firstName: string }[] }>(
        '/employees?pageSize=100&isActive=true',
      )
        .then((r) => {
          setEmployees(r.items ?? []);
          if (r.items?.[0]) setEmployeeId(r.items[0].id);
        })
        .catch(() => undefined);
    } else {
      // Employee: load their own rewards and performance summary
      api<Reward[]>('/me/rewards')
        .then(setRewards)
        .catch(() => undefined);
      api<Goal[]>(`/performance/goals?cycleYear=${year}`)
        .then(setGoals)
        .catch(() => undefined);
    }
  }, [router]);

  async function addGoal() {
    try {
      await api('/performance/goals', {
        method: 'POST',
        body: JSON.stringify({ employeeId, cycleYear: year, title, kra, kpi }),
      });
      setMessage('Goal created');
      setTitle('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function submitSelf() {
    try {
      await api('/performance/self-assessment', {
        method: 'POST',
        body: JSON.stringify({ cycleYear: year, summary, selfRating: rating }),
      });
      setMessage('Self-assessment submitted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function submitReview() {
    try {
      await api('/performance/manager-review', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          cycleYear: year,
          feedback,
          rating,
          recommendPromotion: rating >= 4,
          proposedDesignation: rating >= 4 ? 'Senior' : undefined,
        }),
      });
      setMessage('Manager review saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  // Employee view - Rewards only
  if (!isHr) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="font-display text-3xl text-brand-700 mt-2">Rewards</h1>
        <p className="text-sm text-ink/60 mb-4">Your rewards, recognition & increments</p>
        {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

        {/* Performance Summary (read-only) */}
        {goals.length > 0 && (
          <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm">
            <h2 className="font-display text-lg text-brand-700 mb-2">Performance Summary</h2>
            <ul className="space-y-2">
              {goals.map((g) => (
                <li key={g.id} className="flex justify-between items-center border-b border-mist pb-2 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium">{g.title}</p>
                    <p className="text-ink/50 text-xs">
                      {g.kra && `KRA: ${g.kra}`}
                      {g.kpi && ` · KPI: ${g.kpi}`}
                    </p>
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    g.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                    g.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {g.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Rewards, Recognition, Bonus, Increments */}
        <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm">
          <h2 className="font-display text-lg text-brand-700 mb-2">Rewards & Recognition</h2>
          {rewards.length > 0 ? (
            <ul className="space-y-3">
              {rewards.map((r) => (
                <li key={r.id} className="border-b border-mist pb-3 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{r.title}</p>
                      {r.description && <p className="text-ink/50 text-xs mt-0.5">{r.description}</p>}
                      {r.date && (
                        <p className="text-xs text-ink/40 mt-1">
                          {new Date(r.date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        r.type === 'BONUS' ? 'bg-green-100 text-green-700' :
                        r.type === 'INCREMENT' ? 'bg-blue-100 text-blue-700' :
                        r.type === 'RECOGNITION' ? 'bg-purple-100 text-purple-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {r.type}
                      </span>
                      {r.amount != null && (
                        <p className="text-sm font-medium text-brand-700 mt-1">₹{r.amount.toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink/50">No rewards or recognition yet.</p>
          )}
        </section>

        {/* Self-assessment for employees */}
        {hasEmployee && (
          <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
            <h2 className="font-display text-lg text-brand-700">Self-assessment</h2>
            <textarea
              className="border border-mist rounded px-2 py-2 w-full"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summary of your performance this cycle"
            />
            <button type="button" onClick={submitSelf} className="bg-brand-600 text-white px-4 py-2 rounded">
              Submit
            </button>
            {message && <p className="text-sm text-brand-700 mt-1">{message}</p>}
          </section>
        )}
      </main>
    );
  }

  // HR/CEO/Manager view - Full performance management
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Performance</h1>
      <p className="text-sm text-ink/60 mb-4">Goals · KRA/KPI · Self-assessment · Manager review ({year})</p>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {insight && (
        <section className="bg-brand-50/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm">
          <h2 className="font-display text-lg text-brand-700">AI performance insights</h2>
          <p className="mt-1">Completion {insight.completionRatePct}%</p>
          <p className="text-ink/70 mt-1">{insight.insight}</p>
          <p className="text-xs text-ink/50 mt-2">
            Totals: {Object.entries(insight.totals).map(([k, v]) => `${k}:${v}`).join(' · ') || '—'}
          </p>
        </section>
      )}

      <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
        <h2 className="font-display text-lg text-brand-700">Add goal</h2>
        <select className="border border-mist rounded px-2 py-2 w-full" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.employeeCode} {e.firstName}
            </option>
          ))}
        </select>
        <input className="border border-mist rounded px-2 py-2 w-full" placeholder="Goal title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="border border-mist rounded px-2 py-2 w-full" placeholder="KRA" value={kra} onChange={(e) => setKra(e.target.value)} />
        <input className="border border-mist rounded px-2 py-2 w-full" placeholder="KPI" value={kpi} onChange={(e) => setKpi(e.target.value)} />
        <button type="button" onClick={addGoal} className="bg-brand-600 text-white px-4 py-2 rounded">
          Save goal
        </button>
      </section>

      {hasEmployee && (
        <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
          <h2 className="font-display text-lg text-brand-700">Self-assessment</h2>
          <textarea className="border border-mist rounded px-2 py-2 w-full" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" />
          <button type="button" onClick={submitSelf} className="bg-brand-600 text-white px-4 py-2 rounded">
            Submit
          </button>
        </section>
      )}

      <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
        <h2 className="font-display text-lg text-brand-700">Manager review</h2>
        <select className="border border-mist rounded px-2 py-2 w-full" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.employeeCode} {e.firstName}
            </option>
          ))}
        </select>
        <textarea className="border border-mist rounded px-2 py-2 w-full" rows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback" />
        <input type="number" min={1} max={5} className="border border-mist rounded px-2 py-2 w-24" value={rating} onChange={(e) => setRating(Number(e.target.value))} />
        <button type="button" onClick={submitReview} className="bg-brand-600 text-white px-4 py-2 rounded block">
          Save review
        </button>
      </section>

      <ul className="space-y-2 text-sm">
        {goals.map((g) => (
          <li key={g.id} className="bg-white/80 border border-brand-100 rounded-lg p-3">
            <p className="font-medium">
              {g.employee.employeeCode} {g.employee.firstName} · {g.title}
            </p>
            <p className="text-ink/50">
              {g.kra && `KRA: ${g.kra} · `}
              {g.kpi && `KPI: ${g.kpi} · `}
              {g.status}
            </p>
          </li>
        ))}
        {goals.length === 0 && <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No goals yet</li>}
      </ul>
    </main>
  );
}
