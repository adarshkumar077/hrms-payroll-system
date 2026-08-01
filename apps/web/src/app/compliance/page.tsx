'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';



const KINDS = [
  { kind: 'pf', label: 'PF' },
  { kind: 'esic', label: 'ESIC' },
  { kind: 'pt', label: 'Professional Tax' },
  { kind: 'lwf', label: 'LWF' },
  { kind: 'tds', label: 'TDS' },
  { kind: 'form16', label: 'Form 16 (monthly snap)' },
  { kind: 'form24q', label: 'Form 24Q' },
  { kind: 'salary_register', label: 'Salary Register' },
  { kind: 'attendance_register', label: 'Attendance Register' },
  { kind: 'salary', label: 'Salary Summary' },
  { kind: 'deposit', label: 'Deposit / ESD' },
  { kind: 'reimbursement', label: 'Reimbursements' },
  { kind: 'asset', label: 'Assets' },
  { kind: 'leave', label: 'Leave Summary' },
  { kind: 'payroll', label: 'Payroll Summary' },
] as const;

const SUMMARY_COLUMNS = ['Added', 'Deducted', 'Paid', 'Pending', 'Balance'];

type Pack = { kind: string; year: number; month: number; title: string; rows: Record<string, unknown>[]; note?: string; summary?: Record<string, number> };

export default function CompliancePage() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [kind, setKind] = useState('pf');
  const [data, setData] = useState<Pack | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['CEO', 'HR', 'FINANCE'].includes(r))) {
      router.replace('/dashboard');
    }
  }, [router]);

  async function load(k = kind) {
    setError('');
    try {
      const res = await api<Pack>(`/security/compliance/${k}?year=${year}&month=${month}`);
      setData(res);
      setKind(k);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  }

  async function exportReport(fmt: 'csv' | 'excel' | 'pdf') {
    setError('');
    try {
      const token = getToken();
      const path = `/security/compliance/${kind}/export/${fmt}?year=${year}&month=${month}`;
      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Export failed (${res.status})`);
      }
      if (fmt === 'pdf') {
        const html = await res.text();
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${kind}-${year}-${month}.${fmt === 'excel' ? 'xlsx' : 'csv'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  const columns = data?.rows?.length ? Object.keys(data.rows[0]) : [];

  const summaryRow = data?.summary ?? (data?.rows?.length ? buildSummary(data.rows) : null);

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Compliance Reports</h1>
      <p className="text-sm text-ink/60 mb-6">PF · ESIC · PT · LWF · TDS · Form 16/24Q · Registers · Salary · Deposit · Reimbursements · Assets · Leave · Payroll</p>

      <div className="flex flex-wrap gap-3 mb-4 text-sm items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">Year</label>
          <input
            type="number"
            className="border border-brand-200 rounded px-2 py-1 w-24"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">Month</label>
          <input
            type="number"
            min={1}
            max={12}
            className="border border-brand-200 rounded px-2 py-1 w-20"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 mb-6">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            onClick={() => load(k.kind)}
            className={`text-left p-3 rounded-lg border bg-white/70 hover:bg-white text-sm transition ${
              kind === k.kind && data ? 'border-brand-600 ring-1 ring-brand-600' : 'border-brand-200'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}

      {data && (
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="font-display text-xl text-brand-700 mr-auto">{data.title}</h2>
            <button
              type="button"
              onClick={() => exportReport('csv')}
              className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => exportReport('excel')}
              className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
            >
              Excel
            </button>
            <button
              type="button"
              onClick={() => exportReport('pdf')}
              className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
            >
              PDF
            </button>
          </div>
          {data.note && <p className="text-xs text-ink/50 mb-2">{data.note}</p>}

          {/* Summary bar */}
          {summaryRow && (
            <div className="grid grid-cols-5 gap-2 mb-4 text-sm">
              {SUMMARY_COLUMNS.map((col) => {
                const key = col.toLowerCase();
                const val = summaryRow[key] ?? 0;
                return (
                  <div key={col} className="bg-white/80 border border-brand-100 rounded-lg p-3 text-center">
                    <p className="text-xs text-ink/50">{col}</p>
                    <p className="font-semibold text-brand-700">₹{Number(val).toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="overflow-x-auto border border-brand-100 rounded-lg bg-white/80">
            <table className="min-w-full text-xs">
              <thead className="bg-brand-50 text-left">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-2 py-2 whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data.rows ?? []).slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-t border-brand-50">
                    {columns.map((c) => (
                      <td key={c} className="px-2 py-1.5 whitespace-nowrap">
                        {row[c] == null ? '' : String(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(data.rows?.length ?? 0) > 100 && (
              <p className="text-xs text-ink/50 p-2">Showing first 100 of {data.rows?.length ?? 0} — use export for full set</p>
            )}
            {!data.rows.length && <p className="text-sm text-ink/50 p-4">No rows</p>}
          </div>
        </section>
      )}
    </main>
  );
}

function buildSummary(rows: Record<string, unknown>[]): Record<string, number> | null {
  const numericKeys = ['added', 'deducted', 'paid', 'pending', 'balance', 'amount', 'total', 'gross', 'net', 'deduction'];
  const allKeys = rows.length > 0 ? Object.keys(rows[0]).map((k) => k.toLowerCase()) : [];
  const matchedKeys = numericKeys.filter((nk) => allKeys.some((ak) => ak.includes(nk)));
  if (matchedKeys.length === 0) return null;

  const result: Record<string, number> = {};
  for (const mk of matchedKeys) {
    const actualKey = Object.keys(rows[0]).find((k) => k.toLowerCase().includes(mk));
    if (!actualKey) continue;
    result[mk] = rows.reduce((sum, r) => sum + (Number(r[actualKey]) || 0), 0);
  }
  return Object.keys(result).length > 0 ? result : null;
}
