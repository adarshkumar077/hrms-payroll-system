'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';



const REPORTS = [
  { kind: 'attendance', label: 'Attendance', hint: 'Month punch / day status' },
  { kind: 'leave', label: 'Leave', hint: 'Applications by year' },
  { kind: 'payroll', label: 'Payroll', hint: 'Run lines (gross / net)' },
  { kind: 'employee', label: 'Employee master', hint: 'Headcount & status' },
  { kind: 'department', label: 'Department', hint: 'Active headcount' },
  { kind: 'cost', label: 'Cost / CTC', hint: 'Active salary structures' },
  { kind: 'compliance', label: 'Compliance', hint: 'PF / PT from payroll' },
  { kind: 'audit', label: 'Audit log', hint: 'Recent audit actions' },
  { kind: 'performance', label: 'Performance', hint: 'Goals & reviews' },
  { kind: 'reimbursement', label: 'Reimbursements', hint: 'Claims & payouts' },
  { kind: 'asset', label: 'Assets', hint: 'Issued & returned assets' },
  { kind: 'exit', label: 'Exit / F&F', hint: 'Resignations & settlements' },
  { kind: 'esd', label: 'ESD / Deposit', hint: 'Employee security deposits' },
] as const;

const BALANCES = [
  { kind: 'leave', label: 'Leave balance' },
  { kind: 'salary', label: 'Salary balance' },
  { kind: 'deposit', label: 'ESD deposit' },
  { kind: 'loan', label: 'Loan' },
  { kind: 'advance', label: 'Advance' },
  { kind: 'overtime', label: 'Overtime (OD/HD)' },
  { kind: 'incentive', label: 'Incentive' },
  { kind: 'fnf', label: 'F&F settlements' },
] as const;

type RowPack = { rows: Record<string, unknown>[]; year?: number; month?: number; note?: string };

export default function ReportsPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [active, setActive] = useState<{ base: 'reports' | 'balance-sheets'; kind: string } | null>(
    null,
  );
  const [data, setData] = useState<RowPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    params.set('year', String(year));
    params.set('month', String(month));
    if (filterEmployee) params.set('employee', filterEmployee);
    if (filterDepartment) params.set('department', filterDepartment);
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    return `?${params.toString()}`;
  }, [year, month, filterEmployee, filterDepartment, dateFrom, dateTo]);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN', 'ADMIN'].includes(r))) {
      router.replace('/dashboard');
    }
  }, [router]);

  async function load(base: 'reports' | 'balance-sheets', kind: string) {
    setError('');
    setMsg('');
    setLoading(true);
    setActive({ base, kind });
    try {
      const path =
        base === 'reports'
          ? `/reports/${kind}${qs}`
          : `/balance-sheets/${kind}${qs}`;
      const res = await api<RowPack>(path);
      setData(res);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }

  async function download(fmt: 'csv' | 'excel' | 'pdf') {
    if (!active) return;
    setError('');
    try {
      const token = getToken();
      const path = `/${active.base}/${active.kind}/export/${fmt}${qs}`;
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
      a.download = `${active.kind}.${fmt === 'excel' ? 'xlsx' : 'csv'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  async function emailExport() {
    if (!active) return;
    setError('');
    setMsg('');
    try {
      const res = await api<{ ok: boolean; rows: number }>(
        `/${active.base}/${active.kind}/export/email${qs}`,
        { method: 'POST', body: '{}' },
      );
      setMsg(`Email stub queued (${res.rows} rows) — check notifications / dispatch log`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Email failed');
    }
  }

  async function generateSummary() {
    if (!active || active.base !== 'reports') {
      setError('AI summary is available for reports (not balance sheets)');
      return;
    }
    setError('');
    setAiSummary('');
    try {
      const res = await api<{ summary: string }>(
        `/ai/reports/${active.kind}/summary${qs}`,
        { method: 'POST', body: '{}' },
      );
      setAiSummary(res.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Summary failed');
    }
  }

  const columns = data?.rows?.length ? Object.keys(data.rows[0]) : [];

  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    if (filterEmployee) {
      const term = filterEmployee.toLowerCase();
      rows = rows.filter((r) => {
        const name = String(r['name'] ?? r['employeeName'] ?? r['firstName'] ?? '').toLowerCase();
        const code = String(r['employeeCode'] ?? r['code'] ?? '').toLowerCase();
        return name.includes(term) || code.includes(term);
      });
    }
    if (filterDepartment) {
      rows = rows.filter((r) => {
        const dept = String(r['department'] ?? r['dept'] ?? '');
        return dept === filterDepartment;
      });
    }
    return rows;
  }, [data, filterEmployee, filterDepartment]);

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Reports & Balance Sheets</h1>
      <p className="text-sm text-ink/60 mb-6">Module 22 — query layer with CSV / print PDF / email stub</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 text-sm items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">Employee</label>
          <input
            type="text"
            placeholder="Search name/code…"
            className="border border-brand-200 rounded px-2 py-1 w-40"
            value={filterEmployee}
            onChange={(e) => setFilterEmployee(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">Department</label>
          <input
            type="text"
            placeholder="Department…"
            className="border border-brand-200 rounded px-2 py-1 w-36"
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
          />
        </div>
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
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">From</label>
          <input
            type="date"
            className="border border-brand-200 rounded px-2 py-1"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-ink/60">To</label>
          <input
            type="date"
            className="border border-brand-200 rounded px-2 py-1"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
      {msg && <p className="text-sm text-brand-700 mb-3">{msg}</p>}

      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">Reports</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {REPORTS.map((r) => (
            <button
              key={r.kind}
              type="button"
              onClick={() => load('reports', r.kind)}
              className={`text-left p-4 rounded-lg border bg-white/70 hover:bg-white transition ${
                active?.base === 'reports' && active?.kind === r.kind
                  ? 'border-brand-600 ring-1 ring-brand-600'
                  : 'border-brand-200'
              }`}
            >
              <span className="font-medium text-brand-700">{r.label}</span>
              <p className="text-xs text-ink/50 mt-1">{r.hint}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">Balance sheets</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {BALANCES.map((b) => (
            <button
              key={b.kind}
              type="button"
              onClick={() => load('balance-sheets', b.kind)}
              className={`text-left p-4 rounded-lg border bg-white/70 hover:bg-white transition ${
                active?.base === 'balance-sheets' && active?.kind === b.kind
                  ? 'border-brand-600 ring-1 ring-brand-600'
                  : 'border-brand-200'
              }`}
            >
              <span className="font-medium text-brand-700">{b.label}</span>
            </button>
          ))}
        </div>
      </section>

      {active && (
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="font-display text-xl text-brand-700 mr-auto">
              {active.base === 'reports' ? 'Report' : 'Balance'}: {active.kind}
              {loading ? ' …' : ''}
            </h2>
            <button
              type="button"
              onClick={() => download('csv')}
              className="text-sm px-3 py-1.5 rounded bg-brand-600 text-white"
            >
              CSV
            </button>
            <button
              type="button"
              onClick={() => download('excel')}
              className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
            >
              Excel
            </button>
            <button
              type="button"
              onClick={() => download('pdf')}
              className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
            >
              Print PDF
            </button>
            <button
              type="button"
              onClick={() => emailExport()}
              className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
            >
              Email stub
            </button>
            {active.base === 'reports' && (
              <button
                type="button"
                onClick={() => generateSummary()}
                className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
              >
                Generate Summary
              </button>
            )}
          </div>
          {aiSummary && (
            <p className="text-sm bg-brand-50 border border-brand-100 rounded p-3 mb-3 whitespace-pre-wrap">
              {aiSummary}
            </p>
          )}
          {data?.note && <p className="text-xs text-ink/50 mb-2">{data.note}</p>}
          <div className="overflow-x-auto border border-brand-100 rounded-lg bg-white/80">
            <table className="min-w-full text-xs">
              <thead className="bg-brand-50 text-left">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="px-2 py-2 font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 100).map((row, i) => (
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
            {filteredRows.length > 100 && (
              <p className="text-xs text-ink/50 p-2">Showing first 100 of {filteredRows.length} — use export for full set</p>
            )}
            {!loading && data && filteredRows.length === 0 && (
              <p className="text-sm text-ink/50 p-4">
                {data.rows.length === 0 ? 'No rows' : 'No rows match the current filters'}
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
