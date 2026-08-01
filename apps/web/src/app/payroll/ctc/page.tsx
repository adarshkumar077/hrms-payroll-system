'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Component = { id: string; code: string; name: string; type: string };
type Emp = { id: string; employeeCode: string; firstName: string; lastName?: string | null };

function parseMoneyInput(value: string) {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

export default function CtcPage() {
  const router = useRouter();
  const [components, setComponents] = useState<Component[]>([]);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [ctcAnnual, setCtcAnnual] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
    api<Component[]>('/salary/components')
      .then((c) => {
        setComponents(c);
      })
      .catch((e) => {
        setComponents([]);
        setError(e instanceof Error ? e.message : 'Failed to load salary components');
      });
    api<{ items: Emp[] }>('/employees?pageSize=100')
      .then((res) => {
        setEmployees(res.items ?? []);
        if (res.items?.[0]) setEmployeeId(res.items[0].id);
      })
      .catch(() => setEmployees([]));
  }, [router]);

  async function save() {
    setError('');
    setMessage('');
    const lines = Object.entries(amounts)
      .map(([componentId, raw]) => ({ componentId, amount: parseMoneyInput(raw) }))
      .filter((line) => line.amount > 0);
    if (!employeeId || lines.length === 0) {
      setError('Pick employee and enter at least one component amount');
      return;
    }
    try {
      await api('/salary/structures', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          effectiveFrom,
          ctcAnnual: parseMoneyInput(ctcAnnual),
          lines,
          reason: 'CTC assigned via web',
        }),
      });
      setMessage('Salary structure saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/payroll" className="text-sm text-brand-600 hover:underline">
        ← Payroll
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Assign CTC</h1>
      <p className="text-sm text-ink/60 mb-4">Monthly component amounts (Module 10)</p>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <label className="block text-sm mb-3">
        Employee
        <select
          className="block w-full border border-mist rounded px-2 py-2 mt-1"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.employeeCode} {e.firstName} {e.lastName}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="text-sm">
          CTC annual
          <input
            type="number"
            min={0}
            step="0.01"
            className="block w-full border border-mist rounded px-2 py-2 mt-1"
            value={ctcAnnual}
            onChange={(e) => setCtcAnnual(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Effective from
          <input
            type="date"
            className="block w-full border border-mist rounded px-2 py-2 mt-1"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </label>
      </div>

      {(() => {
        const grossComp = components.find((c) => c.code === 'BASIC');
        const esdComp = components.find((c) => c.code === 'ESD');
        const pfComp = components.find((c) => c.code === 'PF');
        const tdsComp = components.find((c) => c.code === 'PT');
        const grossEarnings = components
          .filter((c) => c.type === 'EARNING' && !['INCENTIVE', 'REIMB'].includes(c.code))
          .reduce((s, c) => s + parseMoneyInput(amounts[c.id] ?? ''), 0);
        const esdVal = esdComp ? parseMoneyInput(amounts[esdComp.id] ?? '') : 0;
        const pfVal = pfComp ? parseMoneyInput(amounts[pfComp.id] ?? '') : 0;
        const tdsVal = tdsComp ? parseMoneyInput(amounts[tdsComp.id] ?? '') : 0;
        const netSalary = Math.max(0, grossEarnings - esdVal - pfVal - tdsVal);
        return (
          <section className="bg-brand-50/50 border border-brand-100 rounded-lg p-4 mb-6">
            <h2 className="font-display text-lg text-brand-700 mb-3">Salary Overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="text-sm font-medium">
                Gross Salary
                <p className="mt-1 text-lg text-brand-700">{grossEarnings.toFixed(2)}</p>
              </label>
              {esdComp && (
                <label className="text-sm">
                  Deposit (ESD)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="block w-full border border-mist rounded px-2 py-2 mt-1"
                    value={amounts[esdComp.id] ?? ''}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [esdComp.id]: e.target.value }))
                    }
                  />
                </label>
              )}
              {pfComp && (
                <label className="text-sm">
                  PF
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="block w-full border border-mist rounded px-2 py-2 mt-1"
                    value={amounts[pfComp.id] ?? ''}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [pfComp.id]: e.target.value }))
                    }
                  />
                </label>
              )}
              {tdsComp && (
                <label className="text-sm">
                  TDS
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="block w-full border border-mist rounded px-2 py-2 mt-1"
                    value={amounts[tdsComp.id] ?? ''}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [tdsComp.id]: e.target.value }))
                    }
                  />
                </label>
              )}
            </div>
            <p className="mt-3 text-lg font-medium text-brand-700 border-t pt-2">
              Net Salary = {netSalary.toFixed(2)}
            </p>
          </section>
        );
      })()}

      <ul className="space-y-2 mb-6">
        {components
          .filter((c) => !['INCENTIVE', 'REIMB', 'ESD', 'LOAN_EMI', 'LOP', 'PF', 'PT', 'ASSET_DAMAGE'].includes(c.code))
          .map((c) => (
            <li key={c.id} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0">
                {c.name} <span className="text-ink/40">({c.type})</span>
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                className="border border-mist rounded px-2 py-1 w-32"
                value={amounts[c.id] ?? ''}
                onChange={(e) =>
                  setAmounts((prev) => ({ ...prev, [c.id]: e.target.value }))
                }
              />
            </li>
          ))}
      </ul>

      <button type="button" onClick={save} className="bg-brand-600 text-white px-4 py-2 rounded text-sm">
        Save structure
      </button>
      {employees.length === 0 && (
        <p className="text-sm text-ink/50 mt-4">No employees yet — add one from Employee Directory.</p>
      )}
    </main>
  );
}
