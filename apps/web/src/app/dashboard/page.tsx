'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser, SessionUser, isConnectionError } from '@/lib/api';
import { isAdmin, isCeo } from '@/lib/roles';
import { Card } from '@/components/ui/Card';
import { NavIconSvg } from '@/components/ui/Icons';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConnectionError } from '@/components/ui/ConnectionError';
import { EmployeeSalaryTracker } from '@/components/employees/EmployeeSalaryTracker';
import { onAttendanceChanged } from '@/lib/attendance-sync';

type EmpDash = {
  monthAttendanceDays?: number;
  leaveBalances?: { code: string; available: number }[];
  openTickets?: number;
  activeLoans?: number;
  loanOutstanding?: number;
  latestPayslip?: { netPay: number; year: number; month: number } | null;
  activeGoals?: number;
  earnings?: {
    monthsOfService: number;
    plEligible: boolean;
    plStatus: string;
    dailySalary: number;
    monthlySalary: number;
    todaysEarnings: number | null;
    todayStatus: string | null;
  };
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
  lastPayrollPeriod?: { year: number; month: number } | null;
  attendancePct: number;
  employeeGrowth: number;
  attritionRate: number;
  depositLiabilities: number;
  departmentHeadcount?: Record<string, number>;
  departmentCost?: Record<string, number>;
  hiringStatus?: { hiredThisYear: number; pendingOnboarding: number; onProbation: number };
  liabilities?: { loans: number; deposits: number };
};

type Announcement = {
  id: string;
  title: string;
  body?: string;
  publishedAt?: string;
};

type AiPredictions = {
  attrition: {
    yearToDateResignations: number;
    activeHeadcount: number;
    attritionRatePct: number;
    outlook: string;
  };
  attendanceRisk: {
    employeeCode: string;
    name: string;
    riskScore: number;
    prediction: string;
    department?: string;
  }[];
  note?: string;
};

type AiPerformanceInsights = {
  totals: Record<string, number>;
  completionRatePct: number;
  insight: string;
  activeGoalsSample: { employeeCode: string; name: string; title: string; status: string }[];
};

type AiPayrollAnomalies = {
  year: number;
  month: number;
  averageNet: number;
  anomalies: {
    employeeCode: string;
    name: string;
    net: number;
    gross: number;
    lopDays: number;
    flags: string[];
  }[];
  note?: string;
};

function formatCurrency(n: number) {
  if (!Number.isFinite(n)) return '—';
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function monthRange(d = new Date()) {
  const from = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
  const to = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  };
}

function computeHealthScore(input: {
  attendancePct?: number;
  attritionRate?: number;
  pendingOnboarding?: number;
}) {
  const attendance = clamp(input.attendancePct ?? 0, 0, 100);
  const attrition = clamp((input.attritionRate ?? 0) * 2, 0, 100);
  const pending = clamp((input.pendingOnboarding ?? 0) * 8, 0, 100);
  const score = Math.round(attendance * 0.55 + (100 - attrition) * 0.30 + (100 - pending) * 0.15);
  return clamp(score, 0, 100);
}

function RadialGauge({ value }: { value: number }) {
  const pct = clamp(value, 0, 100);
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <div className="flex items-center gap-4">
      <svg width="86" height="86" viewBox="0 0 86 86" className="shrink-0">
        <circle cx="43" cy="43" r={r} stroke="rgba(15,23,42,0.08)" strokeWidth="10" fill="none" />
        <circle
          cx="43"
          cy="43"
          r={r}
          stroke="url(#grad)"
          strokeWidth="10"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 43 43)"
        />
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="86" y2="86">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="50%" stopColor="#4f46e5" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Health score</p>
        <p className="font-display text-3xl font-bold text-ink-900">{pct}</p>
        <p className="text-xs text-ink-500 mt-1">
          Outlook: {pct >= 80 ? 'Excellent' : pct >= 60 ? 'Stable' : 'Needs review'}
        </p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [emp, setEmp] = useState<EmpDash | null>(null);
  const [hr, setHr] = useState<HrDash | null>(null);
  const [ceo, setCeo] = useState<CeoDash | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [aiPred, setAiPred] = useState<AiPredictions | null>(null);
  const [aiPerf, setAiPerf] = useState<AiPerformanceInsights | null>(null);
  const [aiPayroll, setAiPayroll] = useState<AiPayrollAnomalies | null>(null);
  const [leaveCalendar, setLeaveCalendar] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const persona = useMemo(() => {
    if (!user) return 'Employee';
    if (isCeo(user)) return 'Super Admin';
    if (isAdmin(user)) return 'HR Admin';
    return 'Employee';
  }, [user]);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setUser(u);
    setLoading(true);
    setError('');

    const r = monthRange(new Date());
    const admin = isAdmin(u);
    const ceoRole = ['SUPER_ADMIN', 'HR', 'ADMIN'].some((x) => u.roles.includes(x));
    const ceoAi = ['SUPER_ADMIN', 'HR'].some((x) => u.roles.includes(x));
    const payrollAi = ['SUPER_ADMIN', 'HR', 'ADMIN'].some((x) => u.roles.includes(x));

    // Critical path — paint dashboard KPIs ASAP on mobile LAN.
    Promise.allSettled([
      admin
        ? api<HrDash>('/dashboard/hr', { timeoutMs: 10000 })
        : api<EmpDash>('/dashboard/employee', { timeoutMs: 10000 }),
      admin && ceoRole ? api<CeoDash>('/dashboard/ceo', { timeoutMs: 10000 }) : Promise.resolve(null),
      api<Announcement[]>('/announcements', { retries: 0, timeoutMs: 8000 }),
    ])
      .then((results) => {
        const [a, b, c] = results;
        if (a.status === 'fulfilled') {
          if (admin) setHr(a.value as HrDash);
          else setEmp(a.value as EmpDash);
        } else if (a.status === 'rejected') {
          const reason = a.reason;
          setError(
            isConnectionError(reason)
              ? 'Unable to reach the server on this network. Check Wi‑Fi and retry.'
              : reason instanceof Error
                ? reason.message
                : 'Dashboard failed to load',
          );
        }
        if (b.status === 'fulfilled' && b.value) setCeo(b.value as CeoDash);
        if (c.status === 'fulfilled') setAnnouncements(c.value ?? []);
      })
      .finally(() => setLoading(false));

    // Secondary widgets — load after first paint (do not block UI).
    const defer = window.setTimeout(() => {
      Promise.allSettled([
        admin ? api<any[]>('/approvals/pending', { retries: 0 }).catch(() => []) : Promise.resolve([]),
        admin
          ? api<any[]>(`/security/audit?limit=10`, { retries: 0 }).catch(() => [])
          : api<any[]>('/notifications/mine', { retries: 0 }).catch(() => []),
        api<any[]>('/me/documents', { retries: 0 }).catch(() => []),
        api<any[]>(
          `/leave/calendar?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`,
          { retries: 0 },
        ).catch(() => []),
        ceoAi ? api<AiPredictions>('/ai/predictions', { retries: 0 }).catch(() => null) : Promise.resolve(null),
        ceoAi
          ? api<AiPerformanceInsights>('/ai/performance/insights', { retries: 0 }).catch(() => null)
          : Promise.resolve(null),
        payrollAi
          ? api<AiPayrollAnomalies>(`/ai/payroll/anomalies?year=${r.year}&month=${r.month}`, {
              retries: 0,
            }).catch(() => null)
          : Promise.resolve(null),
      ]).then((results) => {
        const [d, e, f, g, i, j, k] = results;
        if (d.status === 'fulfilled') setPendingApprovals(d.value ?? []);
        if (e.status === 'fulfilled') {
          const raw = e.value as unknown;
          if (Array.isArray(raw)) setAudit(raw);
          else if (raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)) {
            setAudit((raw as { rows: any[] }).rows);
          } else setAudit([]);
        }
        if (f.status === 'fulfilled') setDocs(f.value ?? []);
        if (g.status === 'fulfilled') setLeaveCalendar(g.value ?? []);
        if (i.status === 'fulfilled') setAiPred(i.value as AiPredictions | null);
        if (j.status === 'fulfilled') setAiPerf(j.value as AiPerformanceInsights | null);
        if (k.status === 'fulfilled') setAiPayroll(k.value as AiPayrollAnomalies | null);
      });
    }, 50);

    return () => window.clearTimeout(defer);
  }, [router]);

  useEffect(() => {
    return onAttendanceChanged(() => {
      const u = getStoredUser();
      if (!u) return;
      const admin = isAdmin(u);
      api(admin ? '/dashboard/hr' : '/dashboard/employee')
        .then((v) => {
          if (admin) setHr(v as HrDash);
          else setEmp(v as EmpDash);
        })
        .catch(() => undefined);
    });
  }, []);

  const month = monthRange(new Date());

  const healthScore = useMemo(() => {
    return computeHealthScore({
      attendancePct: ceo?.attendancePct,
      attritionRate: ceo?.attritionRate,
      pendingOnboarding: ceo?.hiringStatus?.pendingOnboarding ?? hr?.pendingOnboarding,
    });
  }, [ceo, hr]);

  const deptTop = useMemo(() => {
    const entries = ceo?.departmentHeadcount ? Object.entries(ceo.departmentHeadcount) : [];
    return entries.sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [ceo]);

  const riskLeaders = useMemo(() => {
    const list = aiPred?.attendanceRisk ?? [];
    return [...list].sort((a, b) => a.riskScore - b.riskScore).slice(0, 6);
  }, [aiPred]);

  const riskHotspots = useMemo(() => {
    const list = aiPred?.attendanceRisk ?? [];
    const map = new Map<string, { sum: number; n: number }>();
    for (const r of list) {
      const d = r.department?.trim() || 'Unassigned';
      const cur = map.get(d) ?? { sum: 0, n: 0 };
      map.set(d, { sum: cur.sum + r.riskScore, n: cur.n + 1 });
    }
    const items = [...map.entries()].map(([department, v]) => ({
      department,
      avgRisk: v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0,
    }));
    return items.sort((a, b) => b.avgRisk - a.avgRisk).slice(0, 8);
  }, [aiPred]);

  const leaveDotByDay = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leaveCalendar ?? []) {
      const start = new Date(l.fromDate);
      const end = new Date(l.toDate);
      const status = l.status ?? 'PENDING';
      const color =
        status === 'APPROVED' ? 'bg-success' : status === 'REJECTED' ? 'bg-danger' : 'bg-warning';
      const cur = new Date(start);
      while (cur <= end) {
        const key = cur.toISOString().slice(0, 10);
        map.set(key, color);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    return map;
  }, [leaveCalendar]);

  const calCells = useMemo(() => {
    const first = new Date(Date.UTC(month.year, month.month - 1, 1));
    const last = new Date(Date.UTC(month.year, month.month, 0));
    const startWeekday = first.getUTCDay();
    const daysInMonth = last.getUTCDate();
    const cells: { key: string | null; day: number | null }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ key: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(month.year, month.month - 1, d));
      cells.push({ key: dt.toISOString().slice(0, 10), day: d });
    }
    while (cells.length % 7 !== 0) cells.push({ key: null, day: null });
    return cells;
  }, [month.month, month.year]);

  function renderApprovals() {
    if (!pendingApprovals.length) {
      return (
        <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
          No pending approvals right now.
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {pendingApprovals.slice(0, 6).map((a) => (
          <div
            key={a.id}
            className="flex items-start justify-between gap-3 p-3 rounded-2xl border border-ink-100 bg-white/70 hover:bg-brand-50/30 transition-all duration-200"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-800 truncate">{a.summary ?? a.type ?? 'Approval request'}</p>
              <p className="text-xs text-ink-500 mt-1">Type: {a.type ?? '—'} · Status: Pending</p>
            </div>
            <div className="text-xs text-ink-500 shrink-0">
              {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : ''}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderAnnouncements() {
    if (!announcements.length) {
      return (
        <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
          No announcements yet.
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {announcements.slice(0, 4).map((a) => (
          <div
            key={a.id}
            className="p-4 rounded-2xl border border-ink-100 bg-white/70 hover:bg-brand-50/30 transition-all duration-200"
          >
            <p className="text-sm font-semibold text-ink-800">{a.title}</p>
            <p className="text-xs text-ink-500 mt-1">
              {a.publishedAt ? new Date(a.publishedAt).toLocaleString() : '—'}
            </p>
            {a.body && <p className="text-sm text-ink-600 mt-2">{a.body}</p>}
          </div>
        ))}
      </div>
    );
  }

  function renderHeatmap() {
    if (!riskHotspots.length) {
      return (
        <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4 mt-2">
          AI prediction data not available yet.
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-3">
        {riskHotspots.map((d) => {
          const tone =
            d.avgRisk >= 70 ? 'bg-danger-light/70' : d.avgRisk >= 40 ? 'bg-warning-light/60' : 'bg-success-light/60';
          return (
            <div
              key={d.department}
              className={`rounded-2xl border border-ink-100 p-4 ${tone} hover:shadow-soft transition-all duration-200`}
            >
              <p className="text-xs text-ink-600 font-semibold">{d.department}</p>
              <p className="text-xl font-display font-bold text-ink-900 mt-1">{d.avgRisk}</p>
              <p className="text-[11px] text-ink-500 mt-1">Avg risk</p>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] space-y-8 py-2">
      <section className="rounded-3xl gradient-banner p-6 md:p-8 text-white shadow-elevated relative overflow-hidden">
        <div className="absolute -top-16 -right-24 w-72 h-72 bg-white/10 rounded-full" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-white/8 rounded-full" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <p className="text-white/80 text-sm font-medium">{new Date().toLocaleDateString('en-US', { weekday: 'long' })}</p>
            <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">
              Welcome, {user?.displayName ?? '—'}
            </h1>
            <p className="text-white/75 text-sm mt-2">
              {persona === 'Super Admin' ? 'Super Admin Dashboard' : persona === 'HR Admin' ? 'HR Dashboard' : 'Employee Dashboard'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/notifications" className="btn bg-white text-brand-700 hover:bg-white/90 shadow-soft">
              Notifications
            </Link>
            {isAdmin(user as SessionUser) ? (
              <Link
                href="/approvals"
                className="btn bg-white/20 hover:bg-white/30 text-white border border-white/20 backdrop-blur"
              >
                Approval Center
              </Link>
            ) : (
              <Link
                href="/leave/apply"
                className="btn bg-white/20 hover:bg-white/30 text-white border border-white/20 backdrop-blur"
              >
                Apply Leave
              </Link>
            )}
          </div>
        </div>
      </section>

      {error && (
        <ConnectionError
          title="Could not load dashboard"
          message={error}
          onRetry={() => window.location.reload()}
        />
      )}

      {loading && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-3xl bg-white border border-ink-100 shadow-soft p-5">
              <Skeleton className="h-6 w-2/3" />
              <div className="mt-4">
                <Skeleton className="h-10 w-3/5" />
              </div>
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-16" />
              </div>
            </div>
          ))}
        </section>
      )}

      {!loading && persona === 'Super Admin' && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-6">
              <RadialGauge value={healthScore} />
            </Card>
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Live employee count</p>
              <p className="font-display text-3xl font-bold text-ink-900 mt-3">{ceo?.totalEmployees ?? 0}</p>
              <p className="text-sm text-ink-500 mt-2">Growth: {ceo ? `${ceo.employeeGrowth}%` : '—'}</p>
            </Card>
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Attendance summary</p>
                  <p className="font-display text-3xl font-bold text-ink-900 mt-3">
                    {ceo ? `${ceo.attendancePct}%` : '—'}
                  </p>
                  <p className="text-sm text-ink-500 mt-2">Presentish days vs records</p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-700">
                  <NavIconSvg name="attendance" className="w-6 h-6" />
                </div>
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Payroll summary</p>
                  <p className="font-display text-3xl font-bold text-ink-900 mt-3">
                    {formatCurrency(ceo?.payrollCost ?? 0)}
                  </p>
                  <p className="text-sm text-ink-500 mt-2">
                    Latest:{' '}
                    {ceo?.lastPayrollPeriod
                      ? `${ceo.lastPayrollPeriod.month}/${ceo.lastPayrollPeriod.year}`
                      : '—'}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-brand-700">
                  <NavIconSvg name="payroll" className="w-6 h-6" />
                </div>
              </div>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink-800">Department Distribution</h2>
                  <p className="text-sm text-ink-500">Headcount signals by department (live)</p>
                </div>
                <Link href="/reports" className="text-sm text-brand-600 hover:underline font-medium">
                  Reports & Analytics →
                </Link>
              </div>
              <div className="mt-5 space-y-4">
                {deptTop.length ? (
                  deptTop.map(([dept, count]) => (
                    <div key={dept}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-ink-700 font-medium truncate">{dept}</span>
                        <span className="text-ink-900 font-semibold">{count}</span>
                      </div>
                      <div className="h-2 bg-ink-100 rounded-full overflow-hidden mt-2">
                        <div
                          className="h-full rounded-full bg-brand-600 transition-all duration-500"
                          style={{
                            width: `${Math.round((count / Math.max(1, deptTop[0]?.[1] ?? 1)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
                    No department metrics found yet.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Hiring Progress</h2>
              <p className="text-sm text-ink-500 mt-1">Cohort signals & onboarding queue</p>
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between text-sm bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
                  <span className="text-ink-600">Hired this year</span>
                  <span className="font-semibold text-ink-900">{ceo?.hiringStatus?.hiredThisYear ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
                  <span className="text-ink-600">On probation</span>
                  <span className="font-semibold text-ink-900">{ceo?.hiringStatus?.onProbation ?? 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
                  <span className="text-ink-600">Pending onboarding</span>
                  <span className="font-semibold text-ink-900">
                    {ceo?.hiringStatus?.pendingOnboarding ?? 0}
                  </span>
                </div>
                <Link href="/onboarding" className="btn-primary inline-flex w-full justify-center mt-2">
                  Open Onboarding
                </Link>
              </div>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink-800">Executive AI Insights</h2>
                  <p className="text-sm text-ink-500">Predictions from attendance, performance, and payroll signals</p>
                </div>
                <Link href="/performance" className="text-sm text-brand-600 hover:underline font-medium">
                  Performance
                </Link>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-ink-100 bg-white/70 p-4">
                  <p className="text-xs text-ink-500 font-semibold uppercase tracking-wider">Attrition outlook</p>
                  <p className="font-display text-2xl font-bold text-ink-900 mt-2">{aiPred?.attrition.outlook ?? '—'}</p>
                  <p className="text-sm text-ink-600 mt-1">
                    YTD resignations: {aiPred?.attrition.yearToDateResignations ?? 0} · Rate:{' '}
                    {aiPred?.attrition.attritionRatePct != null ? `${aiPred.attrition.attritionRatePct}%` : '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-ink-100 bg-white/70 p-4">
                  <p className="text-xs text-ink-500 font-semibold uppercase tracking-wider">Goal completion</p>
                  <p className="font-display text-2xl font-bold text-ink-900 mt-2">
                    {aiPerf ? `${aiPerf.completionRatePct}%` : '—'}
                  </p>
                  <p className="text-sm text-ink-600 mt-1">{aiPerf?.insight ?? '—'}</p>
                </div>
                <div className="rounded-2xl border border-ink-100 bg-white/70 p-4 md:col-span-2">
                  <p className="text-xs text-ink-500 font-semibold uppercase tracking-wider">Expense analytics (payroll anomalies)</p>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-lg font-semibold text-ink-900">
                        Average net: {aiPayroll ? formatCurrency(aiPayroll.averageNet) : '—'}
                      </p>
                      <p className="text-sm text-ink-600 mt-1">Flagged anomalies: {aiPayroll?.anomalies?.length ?? 0}</p>
                    </div>
                    <Link href="/compliance" className="btn-secondary">
                      Review
                    </Link>
                  </div>
                  {aiPayroll?.anomalies?.length ? (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {aiPayroll.anomalies.slice(0, 4).map((a) => (
                        <div key={a.employeeCode} className="p-3 rounded-2xl border border-ink-100 bg-brand-50/40">
                          <p className="text-sm font-semibold text-ink-800 truncate">{a.name}</p>
                          <p className="text-xs text-ink-500 mt-1">
                            Net: {formatCurrency(a.net)} · LOP: {a.lopDays}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {(a.flags ?? []).slice(0, 3).map((f) => (
                              <span key={f} className="badge badge-warning">{f}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-500 mt-3">No payroll anomaly flags for this period.</p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Risk Heatmap</h2>
              <p className="text-sm text-ink-500">Department-level attendance risk (heuristic)</p>
              <div className="mt-5">{renderHeatmap()}</div>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Approval Center</h2>
              <p className="text-sm text-ink-500 mt-1">Pending instances for your roles</p>
              <div className="mt-5">{renderApprovals()}</div>
              <Link href="/approvals" className="btn-secondary inline-flex w-full justify-center mt-4">
                Open Inbox
              </Link>
            </Card>

            <Card className="p-6 lg:col-span-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink-800">Calendar</h2>
                  <p className="text-sm text-ink-500 mt-1">{month.label}</p>
                </div>
                <Link href="/leave/calendar" className="text-sm text-brand-600 hover:underline font-medium">
                  Leave Calendar →
                </Link>
              </div>
              <div className="mt-5">
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-ink-500">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2 mt-2">
                  {calCells.map((c, idx) => {
                    if (!c.day || !c.key) return <div key={idx} className="h-10" />;
                    const dot = leaveDotByDay.get(c.key);
                    return (
                      <div
                        key={c.key}
                        className="h-10 rounded-2xl border border-ink-100 bg-white/70 flex items-center justify-center relative"
                      >
                        <span className="text-sm text-ink-700">{c.day}</span>
                        {dot && <span className={`absolute -bottom-1.5 h-3 w-3 rounded-full ${dot}`} />}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-ink-500 mt-3">Dots: Approved (green), Pending (orange), Rejected (red).</p>
              </div>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Company Notifications</h2>
              <p className="text-sm text-ink-500 mt-1">Latest announcements for your organization</p>
              <div className="mt-5">{renderAnnouncements()}</div>
            </Card>
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Recent Activities</h2>
              <p className="text-sm text-ink-500 mt-1">Audit signals (latest)</p>
              <div className="mt-5 space-y-3">
                {audit?.length ? (
                  audit.slice(0, 6).map((a) => (
                    <div key={a.id ?? `${a.entityType}-${a.at}`} className="p-4 rounded-2xl border border-ink-100 bg-white/70">
                      <p className="text-sm font-semibold text-ink-800">{a.action ?? a.type ?? 'Activity'}</p>
                      <p className="text-xs text-ink-500 mt-1">
                        {a.at ? new Date(a.at).toLocaleString() : a.completedAt ? new Date(a.completedAt).toLocaleString() : '—'}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">No activity items found.</div>
                )}
              </div>
              <Link href="/security/audit" className="btn-secondary inline-flex w-full justify-center mt-4">
                Open Audit Logs
              </Link>
            </Card>
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Top Employees</h2>
              <p className="text-sm text-ink-500 mt-1">Lowest attendance risk (best stability)</p>
              <div className="mt-5 space-y-2">
                {riskLeaders.length ? (
                  riskLeaders.map((e) => (
                    <div key={e.employeeCode} className="flex items-start justify-between gap-3 p-3 rounded-2xl border border-ink-100 bg-white/70">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink-800 truncate">{e.name}</p>
                        <p className="text-xs text-ink-500 mt-1">{e.department ?? '—'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-display font-bold text-ink-900">{e.riskScore}</p>
                        <p className="text-xs text-ink-500">{e.prediction}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">AI attendance data not available.</div>
                )}
              </div>
              <Link href="/analytics" className="btn-secondary inline-flex w-full justify-center mt-4">
                Explore Analytics
              </Link>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <h2 className="font-display text-lg font-semibold text-ink-800">Recent Documents</h2>
              <p className="text-sm text-ink-500 mt-1">Your latest uploaded documents</p>
              <div className="mt-5">
                {docs?.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {docs.slice(0, 4).map((d) => (
                      <div key={d.id} className="p-4 rounded-2xl border border-ink-100 bg-white/70">
                        <p className="text-sm font-semibold text-ink-800 truncate">
                          {d.title ?? d.documentType?.code ?? 'Document'}
                        </p>
                        <p className="text-xs text-ink-500 mt-1">
                          {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}
                        </p>
                        <Link
                          href={`/me/documents`}
                          className="text-sm text-brand-600 hover:underline mt-3 inline-block"
                        >
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
                    No documents found.
                  </div>
                )}
              </div>
            </Card>
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Quick Actions</h2>
              <p className="text-sm text-ink-500 mt-1">Move faster with premium shortcuts</p>
              <div className="mt-5 space-y-2">
                {[
                  { href: '/employees', label: 'Employee Management', icon: 'users' },
                  { href: '/leave/approvals', label: 'Leave Approvals', icon: 'leave' },
                  { href: '/payroll', label: 'Payroll Processing', icon: 'payroll' },
                  { href: '/assistant', label: 'EITF AI Assistant', icon: 'assistant' },
                  { href: '/studio', label: 'Studio', icon: 'studio' },
                  { href: '/security', label: 'Security Settings', icon: 'security' },
                ].map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-ink-100 bg-white/70 hover:bg-brand-50/30 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">
                        <NavIconSvg name={a.icon as any} className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-semibold text-ink-800 truncate">{a.label}</span>
                    </div>
                    <span className="text-sm text-brand-700">→</span>
                  </Link>
                ))}
              </div>
            </Card>
          </section>
        </>
      )}

      {!loading && persona === 'HR Admin' && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Live employee count</p>
              <p className="font-display text-3xl font-bold text-ink-900 mt-3">{hr?.activeEmployees ?? 0}</p>
              <p className="text-sm text-ink-500 mt-2">On probation: {hr?.onProbation ?? 0}</p>
            </Card>
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Leave approval queue</p>
              <p className="font-display text-3xl font-bold text-ink-900 mt-3">{hr?.pendingLeave ?? 0}</p>
              <p className="text-sm text-ink-500 mt-2">Review and decide</p>
            </Card>
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Onboarding tracker</p>
              <p className="font-display text-3xl font-bold text-ink-900 mt-3">{hr?.pendingOnboarding ?? 0}</p>
              <p className="text-sm text-ink-500 mt-2">Keep teams moving</p>
            </Card>
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Payroll anomalies</p>
              <p className="font-display text-3xl font-bold text-ink-900 mt-3">{aiPayroll?.anomalies?.length ?? 0}</p>
              <p className="text-sm text-ink-500 mt-2">{aiPayroll ? `${aiPayroll.month}/${aiPayroll.year}` : '—'}</p>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <h2 className="font-display text-lg font-semibold text-ink-800">Leave Approval Queue</h2>
              <p className="text-sm text-ink-500 mt-1">Pending approval instances (workflow)</p>
              <div className="mt-5">{renderApprovals()}</div>
            </Card>
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Recruitment Pipeline</h2>
              <p className="text-sm text-ink-500 mt-1">Onboarding progress signals</p>
              <div className="mt-5 space-y-3">
                <div className="p-4 rounded-2xl border border-ink-100 bg-white/70">
                  <p className="text-sm font-semibold text-ink-800">Pending onboarding</p>
                  <p className="text-sm text-ink-500 mt-1">{hr?.pendingOnboarding ?? 0} in progress</p>
                </div>
                <Link href="/onboarding" className="btn-primary w-full justify-center">
                  Open Tracker
                </Link>
              </div>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Department Analytics</h2>
              <p className="text-sm text-ink-500 mt-1">Headcount distribution</p>
              <div className="mt-5 space-y-3">
                {deptTop.length ? (
                  deptTop.map(([d, c]) => (
                    <div
                      key={d}
                      className="flex items-center justify-between p-3 rounded-2xl border border-ink-100 bg-white/70"
                    >
                      <span className="text-sm font-semibold text-ink-800">{d}</span>
                      <span className="text-sm text-ink-500">{c}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
                    No analytics available.
                  </div>
                )}
              </div>
            </Card>
            <Card className="p-6 lg:col-span-2">
              <h2 className="font-display text-lg font-semibold text-ink-800">Calendar</h2>
              <p className="text-sm text-ink-500 mt-1">{month.label}</p>
              <div className="mt-5">
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-ink-500">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2 mt-2">
                  {calCells.map((c, idx) => {
                    if (!c.day || !c.key) return <div key={idx} className="h-10" />;
                    const dot = leaveDotByDay.get(c.key);
                    return (
                      <div
                        key={c.key}
                        className="h-10 rounded-2xl border border-ink-100 bg-white/70 flex items-center justify-center relative"
                      >
                        <span className="text-sm text-ink-700">{c.day}</span>
                        {dot && <span className={`absolute -bottom-1.5 h-3 w-3 rounded-full ${dot}`} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <Link href="/leave/calendar" className="btn-secondary inline-flex w-full justify-center mt-4">
                Open Full Calendar
              </Link>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">HR Notifications</h2>
              <p className="text-sm text-ink-500 mt-1">Latest company announcements</p>
              <div className="mt-5">{renderAnnouncements()}</div>
            </Card>
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Recent Activities</h2>
              <p className="text-sm text-ink-500 mt-1">Audit signals (latest)</p>
              <div className="mt-5 space-y-3">
                {audit?.length ? (
                  audit.slice(0, 6).map((a) => (
                    <div
                      key={a.id ?? `${a.entityType}-${a.at}`}
                      className="p-4 rounded-2xl border border-ink-100 bg-white/70"
                    >
                      <p className="text-sm font-semibold text-ink-800">{a.action ?? a.type ?? 'Activity'}</p>
                      <p className="text-xs text-ink-500 mt-1">
                        {a.at ? new Date(a.at).toLocaleString() : a.completedAt ? new Date(a.completedAt).toLocaleString() : '—'}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
                    No activity items found.
                  </div>
                )}
              </div>
              <Link href="/security/audit" className="btn-secondary inline-flex w-full justify-center mt-4">
                Open Audit Logs
              </Link>
            </Card>
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Quick Actions</h2>
              <p className="text-sm text-ink-500 mt-1">Most-used HR workflows</p>
              <div className="mt-5 space-y-2">
                {[
                  { href: '/employees', label: 'Employees', icon: 'users' },
                  { href: '/attendance', label: 'Attendance Console', icon: 'attendance' },
                  { href: '/payroll', label: 'Payroll Processing', icon: 'payroll' },
                  { href: '/assistant', label: 'EITF AI Assistant', icon: 'assistant' },
                  { href: '/documents', label: 'Documents', icon: 'documents' },
                  { href: '/assets', label: 'Assets', icon: 'assets' },
                ].map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="flex items-center justify-between gap-3 p-4 rounded-2xl border border-ink-100 bg-white/70 hover:bg-brand-50/30 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center">
                        <NavIconSvg name={a.icon as any} className="w-6 h-6" />
                      </div>
                      <span className="text-sm font-semibold text-ink-800 truncate">{a.label}</span>
                    </div>
                    <span className="text-sm text-brand-700">→</span>
                  </Link>
                ))}
              </div>
            </Card>
          </section>
        </>
      )}

      {!loading && persona === 'Employee' && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Monthly attendance</p>
              <p className="font-display text-3xl font-bold text-ink-900 mt-3">{emp?.monthAttendanceDays ?? 0}</p>
              <p className="text-sm text-ink-500 mt-2">Days recorded this month</p>
            </Card>
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Today&apos;s Earnings</p>
              <p className="font-display text-3xl font-bold text-ink-900 mt-3">
                {emp?.earnings?.todaysEarnings != null
                  ? formatCurrency(emp.earnings.todaysEarnings)
                  : '—'}
              </p>
              <p className="text-sm text-ink-500 mt-2">
                Daily {emp?.earnings?.dailySalary != null ? formatCurrency(emp.earnings.dailySalary) : '—'} · Monthly{' '}
                {emp?.earnings?.monthlySalary != null ? formatCurrency(emp.earnings.monthlySalary) : '—'}
              </p>
            </Card>
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">PL eligibility</p>
              <p className="font-display text-2xl font-bold text-ink-900 mt-3">
                {emp?.earnings?.plEligible ? 'Eligible' : 'Locked'}
              </p>
              <p className="text-sm text-ink-500 mt-2">
                {emp?.earnings?.plStatus ?? 'Completes after 7 months of service'}
              </p>
            </Card>
            <Card className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Latest payslip</p>
              <p className="font-display text-3xl font-bold text-ink-900 mt-3">
                {emp?.latestPayslip ? formatCurrency(emp.latestPayslip.netPay) : '—'}
              </p>
              <p className="text-sm text-ink-500 mt-2">
                {emp?.latestPayslip ? `${emp.latestPayslip.month}/${emp.latestPayslip.year}` : 'Generate payroll to view'}
              </p>
            </Card>
          </section>

          <Card className="p-6">
            <EmployeeSalaryTracker useMeEndpoint title="Monthly Live Salary Tracker" />
          </Card>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <h2 className="font-display text-lg font-semibold text-ink-800">Leave calendar</h2>
              <p className="text-sm text-ink-500 mt-1">Premium micro cues for your month</p>
              <div className="mt-5">
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-ink-500">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                    <div key={d} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2 mt-2">
                  {calCells.map((c, idx) => {
                    if (!c.day || !c.key) return <div key={idx} className="h-10" />;
                    const dot = leaveDotByDay.get(c.key);
                    return (
                      <div key={c.key} className="h-10 rounded-2xl border border-ink-100 bg-white/70 flex items-center justify-center relative">
                        <span className="text-sm text-ink-700">{c.day}</span>
                        {dot && <span className={`absolute -bottom-1.5 h-3 w-3 rounded-full ${dot}`} />}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href="/attendance/mark" className="btn-primary inline-flex">
                  Mark Attendance
                </Link>
                <Link href="/leave/apply" className="btn-secondary inline-flex">
                  Apply Leave
                </Link>
                <Link href="/payroll/payslips" className="btn-secondary inline-flex">
                  Payslips
                </Link>
                <Link href="/assistant" className="btn-secondary inline-flex">
                  EITF AI Assistant
                </Link>
                <Link href="/documents" className="btn-secondary inline-flex">
                  Documents
                </Link>
              </div>
            </Card>
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Company announcements</h2>
              <p className="text-sm text-ink-500 mt-1">{month.label}</p>
              <div className="mt-5">{renderAnnouncements()}</div>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold text-ink-800">Performance score</h2>
              <p className="text-sm text-ink-500 mt-1">Goal completion insight (AI)</p>
              <div className="mt-5 p-4 rounded-2xl border border-ink-100 bg-white/70">
                <p className="text-xs text-ink-500 font-semibold uppercase tracking-wider">Completion rate</p>
                <p className="font-display text-3xl font-bold text-ink-900 mt-2">
                  {aiPerf ? `${aiPerf.completionRatePct}%` : '—'}
                </p>
                <p className="text-sm text-ink-600 mt-1">{aiPerf?.insight ?? 'AI insights unavailable'}</p>
              </div>
              <Link href="/performance" className="btn-secondary inline-flex w-full justify-center mt-4">
                Open Performance
              </Link>
            </Card>
            <Card className="p-6 lg:col-span-2">
              <h2 className="font-display text-lg font-semibold text-ink-800">Your documents</h2>
              <p className="text-sm text-ink-500 mt-1">Latest uploads</p>
              <div className="mt-5">
                {docs?.length ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {docs.slice(0, 4).map((d) => (
                      <div key={d.id} className="p-4 rounded-2xl border border-ink-100 bg-white/70">
                        <p className="text-sm font-semibold text-ink-800 truncate">
                          {d.title ?? d.documentType?.code ?? 'Document'}
                        </p>
                        <p className="text-xs text-ink-500 mt-1">
                          {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '—'}
                        </p>
                        <Link href="/me/documents" className="text-sm text-brand-600 hover:underline mt-3 inline-block">
                          Open
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-ink-500 bg-ink-50/50 border border-ink-100 rounded-2xl p-4">
                    No documents found.
                  </div>
                )}
              </div>
            </Card>
          </section>
        </>
      )}

    </div>
  );
}

