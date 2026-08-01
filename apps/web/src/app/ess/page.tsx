'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Home = {
  unreadNotifications: number;
  announcements: { id: string; title: string }[];
  notifications: { id: string; title: string; body: string }[];
};

type Reports = { links: { key: string; path: string; count: number }[] };

export default function EssPage() {
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [reports, setReports] = useState<Reports | null>(null);
  const [salary, setSalary] = useState<{ ctcAnnual: number } | null>(null);
  const [deposits, setDeposits] = useState<{ balance: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.employeeId) {
      setError('ESS requires an employee profile');
      return;
    }
    api<Home>('/me')
      .then(setHome)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    api<Reports>('/me/reports')
      .then(setReports)
      .catch(() => undefined);
    api<{ ctcAnnual: number }>('/me/salary')
      .then(setSalary)
      .catch(() => setSalary(null));
    api<{ balance: number }>('/me/deposits')
      .then(setDeposits)
      .catch(() => undefined);
  }, [router]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Employee Self-Service</h1>
      <p className="text-sm text-ink/60 mb-4">Unified /me APIs</p>
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {home && (
        <p className="text-sm mb-4">
          Unread notifications: <strong>{home.unreadNotifications}</strong>
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3 text-sm mb-6">
        <Link href="/me/profile" className="p-4 border border-brand-100 rounded-lg bg-white/80 hover:bg-white">
          Profile
        </Link>
        <Link href="/payroll/payslips" className="p-4 border border-brand-100 rounded-lg bg-white/80 hover:bg-white">
          Payslips
        </Link>
        <Link href="/leave/apply" className="p-4 border border-brand-100 rounded-lg bg-white/80 hover:bg-white">
          Leave
        </Link>
        <Link href="/attendance/mark" className="p-4 border border-brand-100 rounded-lg bg-white/80 hover:bg-white">
          Attendance
        </Link>
        <Link href="/loans" className="p-4 border border-brand-100 rounded-lg bg-white/80 hover:bg-white">
          Loans / Advances
        </Link>
        <Link href="/notifications" className="p-4 border border-brand-100 rounded-lg bg-white/80 hover:bg-white">
          Notifications
        </Link>
      </div>

      <div className="text-sm space-y-2 mb-6">
        <p>CTC annual: {salary ? salary.ctcAnnual : 'Not assigned'}</p>
        <p>ESD balance: {deposits ? deposits.balance : '—'}</p>
      </div>

      {reports && (
        <ul className="text-sm space-y-1">
          {(reports.links ?? []).map((l) => (
            <li key={l.key}>
              {l.key}: {l.count}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
