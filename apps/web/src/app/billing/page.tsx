'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isSuperAdmin, isAdmin } from '@/lib/roles';
import { ModuleAlert, ModulePage, ModuleSection } from '@/components/layout/ModulePage';
import { PLAN_LIST, PLANS, formatInr, planOf, type PlanId } from '@/lib/billing-plans';

type SeatStats = { used: number; seats: number; plan: PlanId };

export default function BillingPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [stats, setStats] = useState<SeatStats>({ used: 0, seats: PLANS.free.seats, plan: 'free' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!isAdmin(u) && !isSuperAdmin(u)) {
      router.replace('/dashboard');
      return;
    }

    // Prefer company user count from admin users API when available; fall back to free plan.
    api<{ items?: unknown[]; total?: number; users?: unknown[] } | unknown[]>('/auth/admin-users')
      .then((res) => {
        let used = 1;
        if (Array.isArray(res)) used = res.length;
        else if (res && typeof res === 'object') {
          const r = res as { items?: unknown[]; total?: number; users?: unknown[] };
          if (typeof r.total === 'number') used = r.total;
          else if (Array.isArray(r.items)) used = r.items.length;
          else if (Array.isArray(r.users)) used = r.users.length;
        }
        const plan: PlanId = 'free';
        setStats({ used, seats: PLANS[plan].seats, plan });
      })
      .catch(() => {
        setStats({ used: 1, seats: PLANS.free.seats, plan: 'free' });
      })
      .finally(() => setLoading(false));
  }, [router]);

  const currentPlan = planOf(stats.plan);
  const planMeta = PLANS[currentPlan];
  const pct =
    stats.seats > 0 ? Math.min(100, Math.round((stats.used / stats.seats) * 100)) : 0;
  const overCapacity = stats.used > stats.seats;
  const remaining = Math.max(0, stats.seats - stats.used);

  return (
    <ModulePage
      title="Billing & Plans"
      subtitle="Manage your subscription, seats, and payment method."
    >
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <ModuleSection className="mb-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Current Plan</p>
          <p className="font-display text-2xl font-bold text-brand-700 mt-2">
            {loading ? '…' : planMeta.name}
          </p>
          <p className="text-xs text-ink/50 mt-1">Active</p>
        </ModuleSection>
        <ModuleSection className="mb-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Seats Used</p>
          <p className="font-display text-2xl font-bold text-brand-700 mt-2">
            {loading ? '…' : `${stats.used} / ${stats.seats}`}
          </p>
          <p className={`text-xs mt-1 ${overCapacity ? 'text-rose-600' : 'text-ink/50'}`}>
            {overCapacity ? 'Over capacity — upgrade' : `${remaining} available`}
          </p>
        </ModuleSection>
        <ModuleSection className="mb-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Monthly Price</p>
          <p className="font-display text-2xl font-bold text-brand-700 mt-2">
            {planMeta.priceMonthly ? formatInr(planMeta.priceMonthly) : 'Free'}
          </p>
          <p className="text-xs text-ink/50 mt-1">Billed monthly</p>
        </ModuleSection>
        <ModuleSection className="mb-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Payment Mode</p>
          <p className="font-display text-2xl font-bold text-brand-700 mt-2">Manual</p>
          <p className="text-xs text-ink/50 mt-1">Configure Razorpay for online checkout</p>
        </ModuleSection>
      </div>

      <ModuleSection className="mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink/80">Seat usage</span>
          <span className="text-ink/50">
            {stats.used} of {stats.seats} seats
            {overCapacity && <span className="text-rose-600"> (over capacity)</span>}
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
          <div
            className={`h-full rounded-full ${overCapacity ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </ModuleSection>

      <div className="grid gap-4 md:grid-cols-3">
        {PLAN_LIST.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <ModuleSection
              key={plan.id}
              className={`mb-0 flex flex-col ${isCurrent ? 'ring-2 ring-brand-500' : ''}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
                {isCurrent && (
                  <span className="badge-brand text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-medium">
                    Active
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-ink/50">{plan.blurb}</p>
              <div className="mt-3">
                <span className="text-2xl font-bold text-ink">
                  {plan.priceMonthly ? formatInr(plan.priceMonthly) : 'Free'}
                </span>
                {plan.priceMonthly > 0 && (
                  <span className="text-sm text-ink/40"> / month</span>
                )}
              </div>
              <div className="mt-1 text-sm font-medium text-brand-700">{plan.seats} seats</div>
              <ul className="mt-3 space-y-1.5 text-sm text-ink/70 flex-1">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>Up to {plan.limits.customFieldsPerModule} custom fields per module</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className={plan.limits.aiOnboarding ? 'text-emerald-500' : 'text-ink/30'}>
                    {plan.limits.aiOnboarding ? '✓' : '—'}
                  </span>
                  <span>AI onboarding</span>
                </li>
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isCurrent}
                onClick={() =>
                  setError(
                    isCurrent
                      ? ''
                      : 'Plan changes are manual in this environment. Contact Super Admin to upgrade.',
                  )
                }
                className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  isCurrent
                    ? 'bg-ink-100 text-ink/50 cursor-default'
                    : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}
              >
                {isCurrent ? 'Current plan' : 'Select plan'}
              </button>
            </ModuleSection>
          );
        })}
      </div>
    </ModulePage>
  );
}
