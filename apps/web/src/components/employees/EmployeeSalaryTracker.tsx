'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EARNING_COLOR_CLASS, formatEarningAmount } from '@/lib/payroll-calculator';
import { onAttendanceChanged } from '@/lib/attendance-sync';

type DailyRow = {
  date: string;
  dayName: string;
  status: string;
  checkIn?: string | null;
  checkOut?: string | null;
  workingHours?: number | null;
  dailySalary: number;
  dailyEarning: number;
  color: keyof typeof EARNING_COLOR_CLASS;
  runningMonthlyTotal: number;
  remarks?: string | null;
};

type TrackerData = {
  year: number;
  month: number;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  lateMarks: number;
  paidLeaves: number;
  weekOffs: number;
  holidays: number;
  currentGrossEarnings: number;
  currentTotalDeductions: number;
  currentNetSalary: number;
  attendanceIncentive: number;
  expectedMonthEndSalary: number;
  daily: DailyRow[];
};

type Props = {
  employeeId?: string;
  useMeEndpoint?: boolean;
  title?: string;
};

function money(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(v?: string | null) {
  if (!v) return '—';
  return new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function EmployeeSalaryTracker({ employeeId, useMeEndpoint, title }: Props) {
  const [data, setData] = useState<TrackerData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    function refresh(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      setError('');
      const path = useMeEndpoint
        ? '/me/salary-tracker'
        : `/employees/${employeeId}/salary-tracker`;
      api<TrackerData>(path, { retries: 0, timeoutMs: 15000 })
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load salary tracker');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    // Defer heavy tracker so dashboard shell paints first on mobile.
    const boot = window.setTimeout(() => refresh(true), 400);
    const unsub = onAttendanceChanged(() => refresh(false));
    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      unsub();
    };
  }, [employeeId, useMeEndpoint]);

  if (loading && !data) return <p className="text-sm text-ink/60">Loading salary tracker…</p>;
  if (error && !data) {
    return (
      <p className="text-sm text-red-700">
        {error}{' '}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Retry
        </button>
      </p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      {title && <h3 className="text-sm font-medium text-brand-700">{title}</h3>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div className="rounded border border-mist p-2"><span className="text-ink/60 block text-xs">Working Days</span>{data.workingDays}</div>
        <div className="rounded border border-mist p-2"><span className="text-ink/60 block text-xs">Present</span>{data.presentDays}</div>
        <div className="rounded border border-red-200 p-2"><span className="text-ink/60 block text-xs">Absent</span>{data.absentDays}</div>
        <div className="rounded border border-amber-200 p-2"><span className="text-ink/60 block text-xs">Half Days</span>{data.halfDays}</div>
        <div className="rounded border border-mist p-2"><span className="text-ink/60 block text-xs">Late Marks</span>{data.lateMarks}</div>
        <div className="rounded border border-blue-200 p-2"><span className="text-ink/60 block text-xs">Paid Leaves</span>{data.paidLeaves}</div>
        <div className="rounded border border-purple-200 p-2"><span className="text-ink/60 block text-xs">Week Offs</span>{data.weekOffs}</div>
        <div className="rounded border border-purple-200 p-2"><span className="text-ink/60 block text-xs">Holidays</span>{data.holidays}</div>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 text-sm rounded-lg border border-brand-200 bg-mist/30 p-3">
        <div><span className="text-ink/60 block text-xs">Current Gross Earnings</span><span className="font-medium text-emerald-700">{money(data.currentGrossEarnings)}</span></div>
        <div><span className="text-ink/60 block text-xs">Current Deductions</span><span className="font-medium text-red-700">{money(data.currentTotalDeductions)}</span></div>
        <div><span className="text-ink/60 block text-xs">Current Net Salary</span><span className="font-semibold text-brand-700">{money(data.currentNetSalary)}</span></div>
        <div><span className="text-ink/60 block text-xs">Attendance Incentive</span>{money(data.attendanceIncentive)}</div>
        <div className="sm:col-span-2"><span className="text-ink/60 block text-xs">Expected Month-End Salary</span><span className="font-semibold">{money(data.expectedMonthEndSalary)}</span></div>
      </div>

      <div className="overflow-x-auto rounded border border-mist">
        <table className="w-full text-xs">
          <thead className="bg-mist/60 text-left">
            <tr>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Day</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">In</th>
              <th className="px-2 py-2">Out</th>
              <th className="px-2 py-2">Hours</th>
              <th className="px-2 py-2">Daily Salary</th>
              <th className="px-2 py-2">Today&apos;s Earnings</th>
              <th className="px-2 py-2">Running Total</th>
            </tr>
          </thead>
          <tbody>
            {data.daily.length === 0 ? (
              <tr><td colSpan={9} className="px-2 py-4 text-center text-ink/50">No attendance records this month.</td></tr>
            ) : (
              data.daily.map((row) => (
                <tr key={row.date} className="border-t border-mist">
                  <td className="px-2 py-1.5">{String(row.date).slice(0, 10)}</td>
                  <td className="px-2 py-1.5">{row.dayName}</td>
                  <td className="px-2 py-1.5">{row.status}</td>
                  <td className="px-2 py-1.5">{fmtTime(row.checkIn)}</td>
                  <td className="px-2 py-1.5">{fmtTime(row.checkOut)}</td>
                  <td className="px-2 py-1.5">{row.workingHours != null ? row.workingHours.toFixed(1) : '—'}</td>
                  <td className="px-2 py-1.5">{money(row.dailySalary)}</td>
                  <td className={`px-2 py-1.5 font-medium ${EARNING_COLOR_CLASS[row.color]}`}>
                    {formatEarningAmount(row.dailyEarning)}
                  </td>
                  <td className="px-2 py-1.5">{money(row.runningMonthlyTotal)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
