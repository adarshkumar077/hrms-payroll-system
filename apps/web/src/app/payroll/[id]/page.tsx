'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type LineItem = { code: string; name: string; amount: number };
type Line = {
  id: string;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  lopDays: number;
  attendanceDays?: number | null;
  earningsJson: LineItem[];
  deductionsJson: LineItem[];
  paidAt?: string | null;
  paidAmount?: number | null;
  paidBy?: string | null;
  employee: {
    employeeCode: string;
    firstName: string;
    lastName?: string | null;
    department?: string | null;
  };
};
type Run = {
  id: string;
  year: number;
  month: number;
  status: string;
  lines: Line[];
};

export default function PayrollRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [canApprove, setCanApprove] = useState(false);
  const [canMarkPaid, setCanMarkPaid] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  function load() {
    api<Run>(`/payroll/runs/${id}`)
      .then(setRun)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setCanApprove(u.roles.some((r) => ['SUPER_ADMIN', 'ADMIN'].includes(r)));
    setCanMarkPaid(u.roles.some((r) => ['SUPER_ADMIN', 'ADMIN', 'HR'].includes(r)));
    load();
  }, [router, id]);

  async function handleMarkPaid(lineId: string) {
    if (!window.confirm('Mark this line as paid?')) return;
    setMarkingPaid(lineId);
    try {
      await api(`/payroll/lines/${lineId}/paid`, { method: 'POST', body: '{}' });
      setMessage('Marked as paid');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark paid failed');
    } finally {
      setMarkingPaid(null);
    }
  }

  async function approve() {
    if (!window.confirm('Approve and lock this payroll? ESD, loans, and reimbursements will post.')) {
      return;
    }
    try {
      await api(`/payroll/runs/${id}/approve`, { method: 'POST', body: '{}' });
      setMessage('Approved & locked');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed');
    }
  }

  if (!run && !error) return <main className="p-10 text-sm text-ink/50">Loading…</main>;

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/payroll" className="text-sm text-brand-600 hover:underline">
        ← Payroll
      </Link>
      {run && (
        <>
          <h1 className="font-display text-3xl text-brand-700 mt-2">
            Payroll {run.year}-{String(run.month).padStart(2, '0')}
          </h1>
          <p className="text-sm text-ink/60 mb-4">Status: {run.status}</p>
        </>
      )}
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <div className="flex flex-wrap gap-3 mb-6">
        {run && canApprove && !['APPROVED', 'LOCKED'].includes(run.status) && (
          <button
            type="button"
            onClick={approve}
            className="bg-brand-600 text-white px-4 py-2 rounded text-sm"
          >
            Approve & lock
          </button>
        )}
        {run && ['APPROVED', 'LOCKED'].includes(run.status) && (
          <>
            <Link
              href={`/reports/payroll/export/excel`}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
            >
              Export Excel
            </Link>
            <Link
              href={`/reports/payroll/export/pdf`}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700"
            >
              Export PDF
            </Link>
          </>
        )}
      </div>

      <ul className="space-y-3">
        {run?.lines.map((line) => (
          <li key={line.id} className="bg-white/80 border border-brand-100 rounded-lg p-4 text-sm">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-medium">
                  {line.employee.employeeCode} {line.employee.firstName} {line.employee.lastName}
                </p>
                <p className="text-ink/50 text-xs">
                  Present-ish {line.attendanceDays ?? 0} · LOP {line.lopDays}
                </p>
              </div>
              <div className="text-right">
                <p>Gross {line.grossEarnings.toFixed(2)}</p>
                <p className="text-ink/60">Ded {line.totalDeductions.toFixed(2)}</p>
                <p className="font-medium text-brand-700">Net {line.netPay.toFixed(2)}</p>
              </div>
            </div>
            {line.paidAt && (
              <p className="text-xs text-green-700 mt-1">
                Paid on {new Date(line.paidAt).toLocaleString()} · Amount {line.paidAmount?.toFixed(2)}
              </p>
            )}
            {!line.paidAt && run && ['APPROVED', 'LOCKED'].includes(run.status) && canMarkPaid && (
              <button
                type="button"
                disabled={markingPaid === line.id}
                onClick={() => handleMarkPaid(line.id)}
                className="mt-1 text-xs bg-brand-600 text-white px-3 py-1 rounded disabled:opacity-50"
              >
                {markingPaid === line.id ? 'Marking…' : 'Mark as Paid'}
              </button>
            )}
            <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs text-ink/70">
              <div>
                <p className="font-medium text-ink/90">Earnings</p>
                {Array.isArray(line.earningsJson) &&
                  line.earningsJson.map((e, i) => (
                  <p key={i}>
                    {e.name}: {e.amount}
                  </p>
                ))}
              </div>
              <div>
                <p className="font-medium text-ink/90">Deductions</p>
                {Array.isArray(line.deductionsJson) &&
                  line.deductionsJson.map((d, i) => (
                  <p key={i}>
                    {d.name}: {d.amount}
                  </p>
                ))}
                {(!Array.isArray(line.deductionsJson) || line.deductionsJson.length === 0) && <p>—</p>}
              </div>
            </div>
          </li>
        ))}
        {run && run.lines.length === 0 && (
          <li className="text-ink/50 text-sm p-4 border border-dashed border-mist rounded-lg">
            No employees in this run (assign CTC after adding employees)
          </li>
        )}
      </ul>
    </main>
  );
}
