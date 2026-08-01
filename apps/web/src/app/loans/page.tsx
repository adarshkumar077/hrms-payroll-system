'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Loan = {
  id: string;
  type: string;
  amount: number;
  tenureMonths: number;
  emiAmount: number;
  outstanding: number;
  status: string;
  reason?: string | null;
};

export default function MyLoansPage() {
  const router = useRouter();
  const [items, setItems] = useState<Loan[]>([]);
  const [type, setType] = useState<'LOAN' | 'ADVANCE'>('ADVANCE');
  const [amount, setAmount] = useState('');
  const [tenureMonths, setTenure] = useState(5);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<Loan[]>('/loans/mine')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    load();
  }, [router]);

  function parseMoneyInput(value: string) {
    if (!value.trim()) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
  }

  async function submit() {
    try {
      const numericAmount = parseMoneyInput(amount);
      if (numericAmount <= 0) {
        setError('Please enter a valid amount.');
        return;
      }
      await api('/loans', {
        method: 'POST',
        body: JSON.stringify({ type, amount: numericAmount, tenureMonths, reason }),
      });
      setMessage('Loan/advance submitted');
      setAmount('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Loans & Advances</h1>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-3">
        <h2 className="font-display text-lg text-brand-700">Request</h2>
        <label className="block">
          Type
          <select
            className="block w-full border border-mist rounded px-2 py-2 mt-1"
            value={type}
            onChange={(e) => setType(e.target.value as 'LOAN' | 'ADVANCE')}
          >
            <option value="ADVANCE">Advance</option>
            <option value="LOAN">Loan</option>
          </select>
        </label>
        <label className="block">
          Amount
          <input
            type="number"
            step="0.01"
            className="block w-full border border-mist rounded px-2 py-2 mt-1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="block">
          Tenure (months)
          <input
            type="number"
            className="block w-full border border-mist rounded px-2 py-2 mt-1"
            value={tenureMonths}
            onChange={(e) => setTenure(Number(e.target.value))}
          />
        </label>
        <label className="block">
          Reason
          <input
            className="block w-full border border-mist rounded px-2 py-2 mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <button type="button" onClick={submit} className="bg-brand-600 text-white px-4 py-2 rounded">
          Submit
        </button>
      </section>

      <ul className="space-y-2 text-sm">
        {items.map((l) => (
          <li key={l.id} className="bg-white/80 border border-brand-100 rounded-lg p-4">
            <p className="font-medium">
              {l.type} · {l.amount} · {l.status}
            </p>
            <p className="text-ink/60">
              EMI {l.emiAmount} · Outstanding {l.outstanding} · {l.tenureMonths} mo
            </p>
            {l.reason && <p className="mt-1">{l.reason}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
