'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type EmpDash = {
  monthAttendanceDays?: number;
  leaveBalances?: { code: string; available: number }[];
  openTickets?: number;
  activeLoans?: number;
  loanOutstanding?: number;
  latestPayslip?: { netPay: number; year: number; month: number } | null;
  activeGoals?: number;
  message?: string;
};

type HrDash = {
  activeEmployees: number;
  onProbation: number;
  onNotice: number;
  pendingLeave: number;
  openTickets: number;
  pendingOnboarding: number;
};

type CeoDash = {
  totalEmployees: number;
  payrollCost: number;
  attendancePct: number;
  employeeGrowth: number;
  attritionRate: number;
  depositLiabilities: number;
  liabilities?: { loans: number; deposits: number };
  hiringStatus?: { hiredThisYear: number; pendingOnboarding: number; onProbation: number };
  departmentHeadcount?: Record<string, number>;
  cached?: boolean;
  computedAt?: string;
};

const QUICK_REPORTS = [
  { label: 'Attendance Report', href: '/reports', kind: 'attendance' },
  { label: 'Payroll Report', href: '/reports', kind: 'payroll' },
  { label: 'Leave Report', href: '/reports', kind: 'leave' },
  { label: 'Employee Report', href: '/reports', kind: 'employee' },
  { label: 'Compliance Report', href: '/compliance' },
  { label: 'Reimbursement Report', href: '/reports', kind: 'reimbursement' },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const [emp, setEmp] = useState<EmpDash | null>(null);
  const [hr, setHr] = useState<HrDash | null>(null);
  const [ceo, setCeo] = useState<CeoDash | null>(null);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [pred, setPred] = useState<{
    attrition: { attritionRatePct: number; outlook: string; yearToDateResignations: number };
    attendanceRisk: { employeeCode: string; name: string; riskScore: number; prediction: string }[];
    note?: string;
  } | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setRoles(u.roles);
    api<EmpDash>('/dashboard/employee')
      .then(setEmp)
      .catch(() => undefined);
    if (u.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r))) {
      api<HrDash>('/dashboard/hr')
        .then(setHr)
        .catch((e) => setError(e instanceof Error ? e.message : 'HR dash failed'));
    }
    if (u.roles.some((r) => ['SUPER_ADMIN', 'HR', 'ADMIN'].includes(r))) {
      api<CeoDash>('/dashboard/ceo')
        .then(setCeo)
        .catch((e) => setError(e instanceof Error ? e.message : 'Super Admin dash failed'));
    }
    if (u.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r))) {
      api<NonNullable<typeof pred>>('/ai/predictions')
        .then(setPred)
        .catch(() => undefined);
    }
  }, [router]);

  async function refresh() {
    try {
      const m = await api<CeoDash>('/dashboard/ceo/refresh', { method: 'POST', body: '{}' });
      setCeo(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    }
  }

  const isHrOrCeo = roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r));

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Analytics</h1>
      <p className="text-sm text-ink/60 mb-6">Employee · HR · Super Admin metrics (cached)</p>
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {/* My Snapshot */}
      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">My snapshot</h2>
        {emp && !emp.message ? (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Attendance days (month)" value={emp.monthAttendanceDays ?? 0} />
            <Stat label="Open tickets" value={emp.openTickets ?? 0} />
            <Stat label="Active goals" value={emp.activeGoals ?? 0} />
            <Stat label="Loan outstanding" value={emp.loanOutstanding ?? 0} />
            <Stat
              label="Latest net pay"
              value={
                emp.latestPayslip
                  ? `₹${emp.latestPayslip.netPay.toLocaleString()} (${emp.latestPayslip.year}-${emp.latestPayslip.month})`
                  : '—'
              }
            />
            <div className="bg-white/80 border border-brand-100 rounded-lg p-4">
              <p className="text-ink/50 text-xs">Leave available</p>
              <p className="mt-1">
                {(emp.leaveBalances ?? []).map((b) => `${b.code}:${b.available}`).join(' · ') || '—'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Attendance days (month)" value={0} />
            <Stat label="Open tickets" value={0} />
            <Stat label="Active goals" value={0} />
          </div>
        )}
      </section>

      {/* HR Section */}
      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">HR</h2>
        {hr ? (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Active employees" value={hr.activeEmployees} />
            <Stat label="On probation" value={hr.onProbation} />
            <Stat label="On notice" value={hr.onNotice} />
            <Stat label="Pending leave" value={hr.pendingLeave} />
            <Stat label="Open tickets" value={hr.openTickets} />
            <Stat label="Onboarding in progress" value={hr.pendingOnboarding} />
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Active employees" value="—" />
            <Stat label="On probation" value="—" />
            <Stat label="Pending leave" value="—" />
          </div>
        )}
      </section>

      {/* Super Admin Section */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-display text-xl text-brand-700">Super Admin</h2>
          {isHrOrCeo && (
            <button type="button" onClick={refresh} className="text-xs underline text-brand-600">
              Refresh cache {ceo?.cached ? '(cached)' : ''}
            </button>
          )}
        </div>
        {ceo ? (
          <>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <Stat label="Total employees" value={ceo.totalEmployees} />
              <Stat label="Payroll cost (last)" value={`₹${ceo.payrollCost.toLocaleString()}`} />
              <Stat label="Attendance %" value={`${ceo.attendancePct}%`} />
              <Stat label="Hired this year" value={ceo.employeeGrowth} />
              <Stat label="Attrition %" value={`${ceo.attritionRate}%`} />
              <Stat label="ESD liabilities" value={`₹${ceo.depositLiabilities.toLocaleString()}`} />
              <Stat label="Loan liabilities" value={`₹${(ceo.liabilities?.loans ?? 0).toLocaleString()}`} />
              <Stat label="Pending onboarding" value={ceo.hiringStatus?.pendingOnboarding ?? 0} />
            </div>
            {ceo.departmentHeadcount && Object.keys(ceo.departmentHeadcount).length > 0 && (
              <div className="mt-4 bg-white/80 border border-brand-100 rounded-lg p-4">
                <p className="text-xs text-ink/50 mb-2 font-medium">Headcount by department</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                  {Object.entries(ceo.departmentHeadcount).map(([dept, count]) => (
                    <div key={dept} className="flex justify-between px-2 py-1 bg-brand-50 rounded">
                      <span className="text-ink/70">{dept}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Total employees" value="—" />
            <Stat label="Payroll cost" value="—" />
            <Stat label="Attendance %" value="—" />
          </div>
        )}
      </section>

      {/* AI Predictions */}
      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">AI predictions</h2>
        {pred ? (
          <>
            <div className="grid sm:grid-cols-3 gap-3 text-sm mb-3">
              <Stat label="YTD resignations" value={pred.attrition.yearToDateResignations} />
              <Stat label="Attrition outlook %" value={`${pred.attrition.attritionRatePct}%`} />
              <Stat label="Outlook" value={pred.attrition.outlook} />
            </div>
            {pred.note && <p className="text-xs text-ink/50 mb-2">{pred.note}</p>}
            {pred.attendanceRisk.length > 0 && (
              <div className="bg-white/80 border border-brand-100 rounded-lg p-3">
                <p className="text-xs font-medium text-ink/60 mb-1">Attendance risk</p>
                <ul className="text-xs space-y-1">
                  {pred.attendanceRisk.slice(0, 8).map((r) => (
                    <li key={r.employeeCode} className="flex justify-between">
                      <span>{r.employeeCode} {r.name}</span>
                      <span className={r.riskScore > 0.7 ? 'text-red-700' : r.riskScore > 0.4 ? 'text-amber-700' : 'text-ink/60'}>
                        Risk {(r.riskScore * 100).toFixed(0)}% · {r.prediction}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-ink/50 bg-white/80 border border-brand-100 rounded-lg p-4">
            {isHrOrCeo ? 'Loading predictions…' : 'Predictions available for HR/Super Admin roles'}
          </p>
        )}
      </section>

      {/* Quick Report Links */}
      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-3">Quick reports</h2>
        <div className="grid sm:grid-cols-3 gap-2">
          {QUICK_REPORTS.map((r) => (
            <Link
              key={r.label}
              href={r.href}
              className="p-3 rounded-lg border border-brand-200 bg-white/70 hover:bg-white transition text-sm text-brand-700 font-medium hover:underline"
            >
              {r.label} →
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/80 border border-brand-100 rounded-lg p-4">
      <p className="text-ink/50 text-xs">{label}</p>
      <p className="font-medium text-lg mt-1">{value}</p>
    </div>
  );
}
