'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, getToken, getApiBaseUrl } from '@/lib/api';



type Item = {
  id: string;
  category: string;
  amount: number;
  description?: string | null;
  status: string;
  hrApprovedAt?: string | null;
  ceoApprovedAt?: string | null;
  paidAt?: string | null;
  createdAt?: string | null;
  employee: { employeeCode: string; firstName: string; lastName?: string | null };
};

export default function ReimbursementQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [isCeo, setIsCeo] = useState(false);

  function load() {
    api<Item[]>('/reimbursements/queue')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['CEO', 'HR'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    setIsCeo(u.roles.includes('CEO'));
    load();
  }, [router]);

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    try {
      await api(`/reimbursements/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setMessage(status === 'APPROVED' ? 'Approval recorded' : 'Rejected');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function markPaid(id: string) {
    try {
      await api(`/reimbursements/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status: 'PAID' }),
      });
      setMessage('Marked as paid');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function exportReport(fmt: 'excel' | 'pdf') {
    setError('');
    try {
      const token = getToken();
      const path = `/reports/reimbursements/export/${fmt}`;
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
      a.download = `reimbursements.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  const filtered = statusFilter ? items.filter((i) => i.status === statusFilter) : items;

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/payroll" className="text-sm text-brand-600 hover:underline">
        ← Payroll
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Reimbursement Queue</h1>
      <p className="text-sm text-ink/60 mb-4">
        {isCeo ? 'Super Admin can approve, reject, and mark paid.' : 'HR can view claims only. Approvals are Super Admin-only.'}
      </p>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select
          className="rounded border border-mist px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="PAID">Paid</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => exportReport('excel')}
            className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
          >
            Export Excel
          </button>
          <button
            type="button"
            onClick={() => exportReport('pdf')}
            className="text-sm px-3 py-1.5 rounded border border-brand-300 hover:bg-brand-50 transition"
          >
            Export PDF
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <ul className="space-y-3">
        {filtered.map((item) => (
          <li key={item.id} className="bg-white/80 border border-brand-100 rounded-lg p-4 text-sm">
            <div className="flex justify-between gap-3">
              <div className="flex-1">
                <p className="font-medium">
                  {item.employee.employeeCode} {item.employee.firstName}
                  {item.employee.lastName ? ` ${item.employee.lastName}` : ''} · {item.category}
                </p>
                <p className="text-lg font-semibold text-brand-700 mt-1">₹{item.amount.toLocaleString()}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/50 mt-1">
                  <span>
                    Status:{' '}
                    <span className={
                      item.status === 'PAID' ? 'text-emerald-700 font-medium' :
                      item.status === 'APPROVED' ? 'text-blue-700 font-medium' :
                      item.status === 'REJECTED' ? 'text-red-700 font-medium' :
                      'text-amber-700 font-medium'
                    }>
                      {item.status}
                    </span>
                  </span>
                  <span>HR {item.hrApprovedAt ? '✓' : '—'}</span>
                  <span>Super Admin {item.ceoApprovedAt ? '✓' : '—'}</span>
                  {item.createdAt && (
                    <span>
                      Submitted: {new Date(item.createdAt).toLocaleDateString()}{' '}
                      {new Date(item.createdAt).toLocaleTimeString()}
                    </span>
                  )}
                  {item.paidAt && (
                    <span className="text-emerald-700">
                      Paid: {new Date(item.paidAt).toLocaleDateString()}{' '}
                      {new Date(item.paidAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                {item.description && <p className="mt-1 text-ink/70">{item.description}</p>}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {isCeo && item.status === 'PENDING' && (
                  <>
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
                  </>
                )}
                {isCeo && item.status === 'APPROVED' && (
                  <button
                    type="button"
                    className="bg-emerald-600 text-white px-3 py-1 rounded text-xs"
                    onClick={() => markPaid(item.id)}
                  >
                    Mark Paid
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="text-ink/50 text-sm p-4 border border-dashed border-mist rounded-lg">
            {items.length === 0 ? 'Queue empty' : 'No items match the selected status'}
          </li>
        )}
      </ul>
    </main>
  );
}
