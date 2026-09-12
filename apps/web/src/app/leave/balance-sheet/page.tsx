'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Sheet = {
  year: number;
  sheet: {
    employee: { employeeCode: string; firstName: string; lastName?: string | null; department?: string | null };
    balances: {
      available: number;
      accrued: number;
      used: number;
      opening: number;
      carriedForward: number;
      leaveType: { code: string; name: string };
    }[];
  }[];
};

export default function LeaveBalanceSheetPage() {
  const router = useRouter();
  const [data, setData] = useState<Sheet | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [error, setError] = useState('');
  const [accrualMsg, setAccrualMsg] = useState('');

  function load(y = year) {
    api<Sheet>(`/leave/balance-sheet?year=${y}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function runAccrual() {
    try {
      const res = await api<{ results: { credit: number }[] }>('/leave/accrual/run', { method: 'POST' });
      setAccrualMsg(`Accrual run: ${res.results.filter((r) => r.credit > 0).length} employees credited`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accrual failed');
    }
  }

  function exportCsv() {
    if (!data) return;
    const codes = (data.sheet[0]?.balances ?? []).map((b) => b.leaveType.code);
    const lines = [
      ['Code', 'Name', 'Dept', ...codes.flatMap((c) => [`${c}_avail`, `${c}_used`])].join(','),
      ...data.sheet.map((row) =>
        [
          row.employee.employeeCode,
          `${row.employee.firstName} ${row.employee.lastName ?? ''}`.trim(),
          row.employee.department ?? '',
          ...(row.balances ?? []).flatMap((b) => [b.available, b.used]),
        ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leave-balance-sheet-${year}.csv`;
    a.click();
  }

  function printView() {
    window.print();
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline print:hidden">
        ← Dashboard
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-4">
        <h1 className="font-display text-3xl text-brand-700">Leave Balance Sheet</h1>
        <div className="flex flex-wrap gap-2 print:hidden">
          <input
            type="number"
            className="w-24 rounded border border-mist px-2 py-1"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <button type="button" onClick={() => load()} className="px-3 py-1 rounded bg-white border border-mist text-sm">
            Load
          </button>
          <button type="button" onClick={runAccrual} className="px-3 py-1 rounded bg-brand-600 text-white text-sm">
            Run accrual
          </button>
          <button type="button" onClick={exportCsv} className="px-3 py-1 rounded bg-brand-700 text-white text-sm">
            Excel/CSV
          </button>
          <button type="button" onClick={printView} className="px-3 py-1 rounded border border-mist text-sm">
            Print / PDF
          </button>
        </div>
      </div>
      {accrualMsg && <p className="text-sm text-brand-700 mb-2 print:hidden">{accrualMsg}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-brand-100 bg-white/90">
        <table className="w-full text-xs">
          <thead className="bg-mist/60 text-left">
            <tr>
              <th className="px-2 py-2">Code</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Dept</th>
              {(data?.sheet[0]?.balances ?? []).map((b) => (
                <th key={`${b.leaveType.code}-h`} className="px-2 py-2 text-center" colSpan={2}>
                  {b.leaveType.code}
                </th>
              ))}
            </tr>
            <tr>
              <th key="e1" /><th key="e2" /><th key="e3" />
              {(data?.sheet[0]?.balances ?? []).flatMap((b) => [
                <th key={`${b.leaveType.code}-a`} className="px-2 py-1 font-normal text-ink/50">
                  Avail
                </th>,
                <th key={`${b.leaveType.code}-u`} className="px-2 py-1 font-normal text-ink/50">
                  Used
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {data?.sheet.map((row) => (
              <tr key={row.employee.employeeCode} className="border-t border-mist">
                <td className="px-2 py-1.5">{row.employee.employeeCode}</td>
                <td className="px-2 py-1.5">
                  {row.employee.firstName} {row.employee.lastName}
                </td>
                <td className="px-2 py-1.5">{row.employee.department ?? '—'}</td>
                {(row.balances ?? []).flatMap((b) => [
                  <td key={`${row.employee.employeeCode}-${b.leaveType.code}-a`} className="px-2 py-1.5">
                    {b.available}
                  </td>,
                  <td key={`${row.employee.employeeCode}-${b.leaveType.code}-u`} className="px-2 py-1.5">
                    {b.used}
                  </td>,
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
