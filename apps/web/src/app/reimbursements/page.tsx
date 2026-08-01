'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Claim = {
  id: string;
  category: string;
  amount: number;
  description?: string | null;
  status: string;
  hrApprovedAt?: string | null;
  ceoApprovedAt?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
};

const CATS = ['Travel', 'Petrol', 'Internet', 'Mobile', 'Medical', 'Food', 'Other'];

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-blue-100 text-blue-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function MyReimbursementsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Claim[]>([]);
  const [category, setCategory] = useState('Travel');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function parseMoneyInput(value: string) {
    if (!value.trim()) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
  }

  function load() {
    api<Claim[]>('/reimbursements/mine')
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

  async function submit() {
    try {
      const numericAmount = parseMoneyInput(amount);
      if (numericAmount <= 0) {
        setError('Please enter a valid amount.');
        return;
      }
      await api('/reimbursements', {
        method: 'POST',
        body: JSON.stringify({ category, amount: numericAmount, description }),
      });
      setMessage('Claim submitted (needs HR + Super Admin)');
      setAmount('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  const totalPending = items.filter((c) => c.status === 'PENDING').reduce((s, c) => s + c.amount, 0);
  const totalApproved = items.filter((c) => c.status === 'APPROVED').reduce((s, c) => s + c.amount, 0);
  const totalPaid = items.filter((c) => c.status === 'PAID').reduce((s, c) => s + c.amount, 0);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Reimbursements</h1>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 my-4 text-sm">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
          <p className="text-xs text-ink/50">Pending</p>
          <p className="font-semibold text-amber-800">₹{totalPending.toLocaleString()}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-xs text-ink/50">Approved</p>
          <p className="font-semibold text-blue-800">₹{totalApproved.toLocaleString()}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
          <p className="text-xs text-ink/50">Paid</p>
          <p className="font-semibold text-emerald-800">₹{totalPaid.toLocaleString()}</p>
        </div>
      </div>

      <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-3">
        <label className="block">
          Category
          <select
            className="block w-full border border-mist rounded px-2 py-2 mt-1"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
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
          Description
          <input
            className="block w-full border border-mist rounded px-2 py-2 mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <button type="button" onClick={submit} className="bg-brand-600 text-white px-4 py-2 rounded">
          Submit claim
        </button>
      </section>

      <h2 className="font-display text-lg text-brand-700 mb-2">Claim History</h2>
      <ul className="space-y-2 text-sm">
        {items.map((c) => (
          <li key={c.id} className="bg-white/80 border border-brand-100 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{c.category}</p>
                <p className="text-lg font-semibold text-brand-700">₹{c.amount.toLocaleString()}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[c.status] ?? 'bg-gray-100'}`}>
                {c.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/50 mt-2">
              <span>HR {c.hrApprovedAt ? '✓' : '—'}</span>
              <span>Super Admin {c.ceoApprovedAt ? '✓' : '—'}</span>
              {c.createdAt && (
                <span>
                  Submitted: {new Date(c.createdAt).toLocaleDateString()}{' '}
                  {new Date(c.createdAt).toLocaleTimeString()}
                </span>
              )}
              {c.paidAt && (
                <span className="text-emerald-700">
                  Paid: {new Date(c.paidAt).toLocaleDateString()}{' '}
                  {new Date(c.paidAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            {c.description && <p className="mt-2 text-ink/70">{c.description}</p>}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">
            No claims yet
          </li>
        )}
      </ul>
    </main>
  );
}
