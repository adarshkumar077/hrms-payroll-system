'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, getApiBaseUrl, getToken } from '@/lib/api';

type EsdRow = {
  employeeCode: string;
  employeeName: string;
  month: number;
  year: number;
  deposit: number;
  pf: number;
  tds: number;
  balance: number;
  paid: boolean;
  id?: string;
};

type SummaryRow = {
  balance: number;
  employee: { employeeCode: string; firstName: string; lastName?: string | null };
};

type EmployeeEsd = {
  month: number;
  year: number;
  deposit: number;
  pf: number;
  tds: number;
  balance: number;
  paid: boolean;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function EsdSheetPage() {
  const router = useRouter();
  const [isHr, setIsHr] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [rows, setRows] = useState<EsdRow[]>([]);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [employeeData, setEmployeeData] = useState<EmployeeEsd[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('');
  const [filterYear, setFilterYear] = useState<string>(String(new Date().getFullYear()));

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }

    const hrAccess = u.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r));
    setIsHr(hrAccess);
    setEmployeeId(u.employeeId ?? null);

    if (hrAccess) {
      api<EsdRow[] | SummaryRow[]>('/esd/sheet')
        .then((data) => {
          if (data.length > 0 && 'month' in data[0]) {
            setRows(data as EsdRow[]);
          } else {
            setSummaryRows(data as SummaryRow[]);
          }
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
        .finally(() => setLoading(false));
    } else if (u.employeeId) {
      api<EmployeeEsd[]>(`/esd/${u.employeeId}`)
        .then(setEmployeeData)
        .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
        .finally(() => setLoading(false));
    } else {
      router.replace('/dashboard');
    }
  }, [router]);

  const filteredRows = useMemo(() => {
    let data = rows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(
        (r) =>
          (r.employeeName ?? '').toLowerCase().includes(q) ||
          (r.employeeCode ?? '').toLowerCase().includes(q),
      );
    }
    if (filterMonth) {
      data = data.filter((r) => r.month === Number(filterMonth));
    }
    if (filterYear) {
      data = data.filter((r) => r.year === Number(filterYear));
    }
    return data;
  }, [rows, searchQuery, filterMonth, filterYear]);

  async function markPaid(row: EsdRow) {
    try {
      await api(`/esd/${row.id ?? row.employeeCode}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ month: row.month, year: row.year }),
      });
      setRows((prev) =>
        prev.map((r) =>
          r.employeeCode === row.employeeCode && r.month === row.month && r.year === row.year
            ? { ...r, paid: true }
            : r,
        ),
      );
      setMessage('Marked as paid');
      setTimeout(() => setMessage(''), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark paid');
    }
  }

  function exportFile(format: 'excel' | 'pdf') {
    const token = getToken();
    const baseUrl = getApiBaseUrl();
    const params = new URLSearchParams();
    if (filterMonth) params.set('month', filterMonth);
    if (filterYear) params.set('year', filterYear);
    if (searchQuery) params.set('search', searchQuery);
    const url = `${baseUrl}/reports/esd/export/${format}?${params.toString()}`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `esd-sheet.${format === 'excel' ? 'xlsx' : 'pdf'}`;
        link.click();
        URL.revokeObjectURL(objectUrl);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Export failed'));
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-ink/50">Loading...</p>
      </main>
    );
  }

  // Employee view - read-only
  if (!isHr) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10">
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
          ← Dashboard
        </Link>
        <h1 className="font-display text-3xl text-brand-700 mt-2">My ESD Balance</h1>
        <p className="text-sm text-ink/60 mb-4">Your deposit, PF, and TDS summary</p>
        {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

        {employeeData.length > 0 ? (
          <table className="w-full text-sm bg-white/80 border border-brand-100 rounded-lg overflow-hidden">
            <thead className="bg-brand-50 text-left">
              <tr>
                <th className="p-3">Month</th>
                <th className="p-3 text-right">Deposit</th>
                <th className="p-3 text-right">PF</th>
                <th className="p-3 text-right">TDS</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {employeeData.map((r, i) => (
                <tr key={i} className="border-t border-mist">
                  <td className="p-3">{MONTHS[r.month - 1]} {r.year}</td>
                  <td className="p-3 text-right">₹{r.deposit.toFixed(2)}</td>
                  <td className="p-3 text-right">₹{r.pf.toFixed(2)}</td>
                  <td className="p-3 text-right">₹{r.tds.toFixed(2)}</td>
                  <td className="p-3 text-right font-medium">₹{r.balance.toFixed(2)}</td>
                  <td className="p-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${r.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {r.paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="bg-white/80 border border-brand-100 rounded-lg p-6 text-ink/50 text-sm">
            No ESD records found.
          </div>
        )}
      </main>
    );
  }

  // HR/CEO view - full management
  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <Link href="/payroll" className="text-sm text-brand-600 hover:underline">
        ← Payroll
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">ESD Balance Sheet</h1>
      <p className="text-sm text-ink/60 mb-4">Monthly tracking · Updated when payroll is approved</p>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          className="border border-mist rounded px-3 py-2 text-sm flex-1 min-w-[180px]"
          placeholder="Search employee..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="border border-mist rounded px-3 py-2 text-sm"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
        >
          <option value="">All Months</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          className="border border-mist rounded px-3 py-2 text-sm"
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
        >
          {[2024, 2025, 2026, 2027].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => exportFile('excel')}
          className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700"
        >
          Export Excel
        </button>
        <button
          type="button"
          onClick={() => exportFile('pdf')}
          className="bg-red-600 text-white px-3 py-2 rounded text-sm hover:bg-red-700"
        >
          Export PDF
        </button>
      </div>

      {/* Monthly detail table (if API returns detailed rows) */}
      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-white/80 border border-brand-100 rounded-lg overflow-hidden">
            <thead className="bg-brand-50 text-left">
              <tr>
                <th className="p-3">Employee</th>
                <th className="p-3">Month</th>
                <th className="p-3 text-right">Deposit</th>
                <th className="p-3 text-right">PF</th>
                <th className="p-3 text-right">TDS</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => (
                <tr key={i} className="border-t border-mist">
                  <td className="p-3">
                    <span className="font-medium">{r.employeeCode}</span>{' '}
                    {r.employeeName}
                  </td>
                  <td className="p-3">{MONTHS[r.month - 1]} {r.year}</td>
                  <td className="p-3 text-right">₹{r.deposit.toFixed(2)}</td>
                  <td className="p-3 text-right">₹{r.pf.toFixed(2)}</td>
                  <td className="p-3 text-right">₹{r.tds.toFixed(2)}</td>
                  <td className="p-3 text-right font-medium">₹{r.balance.toFixed(2)}</td>
                  <td className="p-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${r.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {r.paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    {!r.paid && (
                      <button
                        type="button"
                        onClick={() => markPaid(r)}
                        className="text-xs bg-brand-600 text-white px-2 py-1 rounded hover:bg-brand-700"
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-ink/50">
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Fallback: summary table when API only returns balance summaries */
        <table className="w-full text-sm bg-white/80 border border-brand-100 rounded-lg overflow-hidden">
          <thead className="bg-brand-50 text-left">
            <tr>
              <th className="p-3">Employee</th>
              <th className="p-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.map((r) => (
              <tr key={r.employee.employeeCode} className="border-t border-mist">
                <td className="p-3">
                  {r.employee.employeeCode} {r.employee.firstName} {r.employee.lastName}
                </td>
                <td className="p-3 text-right">₹{r.balance.toFixed(2)}</td>
              </tr>
            ))}
            {summaryRows.length === 0 && (
              <tr>
                <td colSpan={2} className="p-4 text-ink/50">
                  No employees
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
