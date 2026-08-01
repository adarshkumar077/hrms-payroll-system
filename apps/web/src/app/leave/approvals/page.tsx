'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { formatRoleLabel } from '@/lib/roles';

type QueueItem = {
  id: string;
  days: number;
  fromDate: string;
  toDate: string;
  reason?: string | null;
  status: string;
  currentStep: number;
  leaveType: { name: string; code: string };
  employee: { employeeCode: string; firstName: string; lastName?: string | null; department?: string | null };
  steps: { stepOrder: number; approverRole?: string | null; status: string }[];
};

export default function LeaveApprovalsPage() {
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<QueueItem[]>('/leave/approvals')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['CEO', 'HR', 'MANAGER'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [router]);

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    const comment = window.prompt(`Comment for ${status}`) ?? undefined;
    try {
      await api(`/leave/approvals/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, comment }),
      });
      setMessage(`Marked ${status}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Leave Approval Queue</h1>
      <p className="text-sm text-ink/60 mb-4">Multi-level: Manager → HR</p>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="bg-white/80 border border-brand-100 rounded-lg p-4 text-sm">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-medium">
                  {item.employee.employeeCode} {item.employee.firstName} {item.employee.lastName}
                </p>
                <p className="text-ink/60">
                  {item.leaveType.name} · {item.days} day(s) ·{' '}
                  {new Date(item.fromDate).toLocaleDateString()} –{' '}
                  {new Date(item.toDate).toLocaleDateString()}
                </p>
                {item.reason && <p className="mt-1">{item.reason}</p>}
                <p className="text-xs text-ink/40 mt-1">
                  Step {item.currentStep}:{' '}
                  {item.steps.map((s) => `${s.stepOrder}:${formatRoleLabel(s.approverRole ?? '')}/${s.status}`).join(' → ')}
                </p>
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
            </div>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 text-sm p-4 border border-dashed border-mist rounded-lg">
            No pending leave requests
          </li>
        )}
      </ul>
    </main>
  );
}
