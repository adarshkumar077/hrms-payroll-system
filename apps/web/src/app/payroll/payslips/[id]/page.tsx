'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Item = { code: string; name: string; amount: number };
type Slip = {
  id: string;
  netPay: number;
  grossEarnings: number;
  totalDeductions: number;
  earningsJson: Item[];
  deductionsJson: Item[];
  paidAt?: string | null;
  paidAmount?: number | null;
  payrollRun: { year: number; month: number };
  employee: { employeeCode: string; firstName: string; lastName?: string | null };
};

export default function PayslipDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [slip, setSlip] = useState<Slip | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    api<Slip>(`/payroll/my-payslips/${id}`)
      .then(setSlip)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [router, id]);

  return (
    <main className="max-w-xl mx-auto px-4 py-10">
      <Link href="/payroll/payslips" className="text-sm text-brand-600 hover:underline">
        ← Payslips
      </Link>
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
      {slip && (
        <div className="mt-4 bg-white/90 border border-brand-100 rounded-lg p-6 print:border-0">
          <p className="font-display text-2xl text-brand-700">EITF Payslip</p>
          <p className="text-sm text-ink/60 mt-1">
            {slip.payrollRun.year}-{String(slip.payrollRun.month).padStart(2, '0')} ·{' '}
            {slip.employee.employeeCode} {slip.employee.firstName}
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6 text-sm">
            <div>
              <p className="font-medium mb-2">Earnings</p>
              {(Array.isArray(slip.earningsJson) ? slip.earningsJson : []).map((e, i) => (
                <p key={i} className="flex justify-between gap-2">
                  <span>{e.name}</span>
                  <span>{Number(e.amount ?? 0).toFixed(2)}</span>
                </p>
              ))}
              <p className="flex justify-between font-medium mt-2 border-t pt-1">
                <span>Gross</span>
                <span>{Number(slip.grossEarnings ?? 0).toFixed(2)}</span>
              </p>
            </div>
            <div>
              <p className="font-medium mb-2">Deductions</p>
              {(Array.isArray(slip.deductionsJson) ? slip.deductionsJson : []).map((d, i) => (
                <p key={i} className="flex justify-between gap-2">
                  <span>{d.name}</span>
                  <span>{Number(d.amount ?? 0).toFixed(2)}</span>
                </p>
              ))}
              <p className="flex justify-between font-medium mt-2 border-t pt-1">
                <span>Total</span>
                <span>{Number(slip.totalDeductions ?? 0).toFixed(2)}</span>
              </p>
            </div>
          </div>
          <div className="mt-6 p-4 bg-brand-50/50 border border-brand-100 rounded-lg">
            <p className="font-medium text-ink/80 mb-2">Salary Breakdown</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <span>Gross Salary</span><span className="text-right">{Number(slip.grossEarnings ?? 0).toFixed(2)}</span>
              <span>Deposit (ESD)</span><span className="text-right">{(Array.isArray(slip.deductionsJson) ? slip.deductionsJson.find(d => d.code === 'ESD')?.amount ?? 0 : 0).toFixed(2)}</span>
              <span>PF</span><span className="text-right">{(Array.isArray(slip.deductionsJson) ? slip.deductionsJson.find(d => d.code === 'PF')?.amount ?? 0 : 0).toFixed(2)}</span>
              <span>TDS</span><span className="text-right">{(Array.isArray(slip.deductionsJson) ? slip.deductionsJson.find(d => d.code === 'PT')?.amount ?? 0 : 0).toFixed(2)}</span>
            </div>
            <p className="mt-3 text-lg font-medium text-brand-700 border-t pt-2">
              Net Salary: {slip.netPay.toFixed(2)}
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3">
            {slip.paidAt ? (
              <span className="inline-flex items-center gap-1 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-1">
                Paid on {new Date(slip.paidAt).toLocaleDateString()} {new Date(slip.paidAt).toLocaleTimeString()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1">
                Unpaid
              </span>
            )}
          </div>

          <button
            type="button"
            className="mt-4 text-sm underline text-ink/60 print:hidden"
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
        </div>
      )}
    </main>
  );
}
