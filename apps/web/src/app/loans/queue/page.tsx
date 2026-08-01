'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Item = {
  id: string;
  type: string;
  amount: number;
  tenureMonths: number;
  emiAmount: number;
  reason?: string | null;
  employee: { employeeCode: string; firstName: string; lastName?: string | null };
};

export default function LoanQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<Item[]>('/loans/queue')
      .then(setItems)
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
  }, [router]);

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      await api(`/loans/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setMessage(`Marked ${status}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/payroll" className="text-sm text-brand-600 hover:underline">
        ← Payroll
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Loan Approval Queue</h1>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="bg-white/80 border border-brand-100 rounded-lg p-4 text-sm flex justify-between gap-3">
            <div>
              <p className="font-medium">
                {item.employee.employeeCode} {item.employee.firstName} · {item.type} {item.amount}
              </p>
              <p className="text-ink/60">
                {item.tenureMonths} mo · EMI {item.emiAmount}
              </p>
              {item.reason && <p>{item.reason}</p>}
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                className="bg-brand-600 text-white px-3 py-1 rounded text-xs"
                onClick={() => review(item.id, 'APPROVED')}
              >
                Approve
              </button>
              <button
                type="button"
                className="border border-red-300 text-red-700 px-3 py-1 rounded text-xs"
                onClick={() => review(item.id, 'REJECTED')}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 text-sm p-4 border border-dashed border-mist rounded-lg">
            No pending loans
          </li>
        )}
      </ul>
    </main>
  );
}
