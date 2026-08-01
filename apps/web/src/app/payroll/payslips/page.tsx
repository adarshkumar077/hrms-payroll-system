'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type EarningItem = { code: string; name: string; amount: number };
type Payslip = {
  id: string;
  netPay: number;
  grossEarnings: number;
  totalDeductions: number;
  earningsJson?: EarningItem[];
  deductionsJson?: EarningItem[];
  paidAt?: string | null;
  paidAmount?: number | null;
  payrollRun: { year: number; month: number; status: string };
};

export default function MyPayslipsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Payslip[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    api<Payslip[]>('/payroll/my-payslips')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [router]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">My Payslips</h1>
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
      <ul className="mt-4 space-y-2">
        {items.map((p) => {
          const esd = p.deductionsJson?.find((d) => d.code === 'ESD')?.amount ?? 0;
          const pf = p.deductionsJson?.find((d) => d.code === 'PF')?.amount ?? 0;
          const tds = p.deductionsJson?.find((d) => d.code === 'PT')?.amount ?? 0;
          return (
            <li key={p.id}>
              <Link
                href={`/payroll/payslips/${p.id}`}
                className="block bg-white/80 border border-brand-100 rounded-lg p-4 text-sm hover:bg-white"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">
                      {p.payrollRun.year}-{String(p.payrollRun.month).padStart(2, '0')}
                    </p>
                    <p className="text-xs text-ink/50 mt-1">
                      Gross {p.grossEarnings.toFixed(2)} · ESD {esd.toFixed(2)} · PF {pf.toFixed(2)} · TDS {tds.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-brand-700">Net {p.netPay.toFixed(2)}</p>
                    {p.paidAt ? (
                      <p className="text-xs text-green-700 mt-1">
                        Paid {new Date(p.paidAt).toLocaleDateString()}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-600 mt-1">Unpaid</p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="text-ink/50 text-sm p-4 border border-dashed border-mist rounded-lg">
            No locked payslips yet
          </li>
        )}
      </ul>
    </main>
  );
}
