import { requireSession } from "@/lib/auth";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import { inr } from "@/lib/format";
import { PLAN_LIST, getSubscription, seatUsage, planOf } from "@/lib/billing";
import { razorpayConfigured } from "@/lib/payments";
import { UpgradeButton } from "./PlanActions";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const s = await requireSession();
  if (!(await can(s, "billing", "read"))) return <NoAccess label="Billing" />;

  const [sub, usage] = await Promise.all([
    getSubscription(s.tenantId),
    seatUsage(s.tenantId),
  ]);
  const currentPlan = planOf(sub.plan);
  const pct = usage.seats > 0 ? Math.min(100, Math.round((usage.used / usage.seats) * 100)) : 0;

  return (
    <div>
      <PageHeader
        title="Billing & Plans"
        subtitle="Manage your Orbit subscription, seats, and payment method."
      />

      {!razorpayConfigured && (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="font-semibold">Razorpay not configured — running in manual mode.</span>{" "}
          Plan changes apply immediately (no online payment). Set{" "}
          <span className="font-mono">RAZORPAY_KEY_ID</span> +{" "}
          <span className="font-mono">RAZORPAY_KEY_SECRET</span> in{" "}
          <span className="font-mono">.env</span> (see{" "}
          <span className="font-mono">.env.payments.example</span>) to collect payments online.
        </div>
      )}

      {/* Current status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Current Plan" value={usage.planName} accent="brand" hint={sub.status} />
        <StatCard
          label="Seats Used"
          value={`${usage.used} / ${usage.seats}`}
          accent={usage.overCapacity ? "red" : usage.remaining <= 1 ? "amber" : "green"}
          hint={usage.overCapacity ? "Over capacity — upgrade" : `${usage.remaining} available`}
        />
        <StatCard
          label="Monthly Price"
          value={PLAN_LIST.find((p) => p.id === currentPlan)?.priceMonthly ? inr(PLAN_LIST.find((p) => p.id === currentPlan)!.priceMonthly) : "Free"}
          accent="slate"
          hint="Billed monthly"
        />
        <StatCard
          label="Payment Mode"
          value={razorpayConfigured ? "Razorpay" : "Manual"}
          accent={razorpayConfigured ? "green" : "amber"}
          hint={razorpayConfigured ? "Online checkout" : "No provider set"}
        />
      </div>

      {/* Seat usage bar */}
      <div className="card p-4 mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-800">Seat usage</span>
          <span className="text-slate-500">
            {usage.used} of {usage.seats} seats {usage.overCapacity && <span className="text-rose-600">(over capacity)</span>}
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${usage.overCapacity ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Plans table */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLAN_LIST.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isDowngrade = PLAN_LIST.findIndex((p) => p.id === plan.id) < PLAN_LIST.findIndex((p) => p.id === currentPlan);
          return (
            <div
              key={plan.id}
              className={`card p-5 flex flex-col ${isCurrent ? "ring-2 ring-brand-500" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                {isCurrent && <Badge tone="brand">Active</Badge>}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">{plan.blurb}</p>
              <div className="mt-3">
                <span className="text-2xl font-bold text-slate-900">
                  {plan.priceMonthly ? inr(plan.priceMonthly) : "Free"}
                </span>
                {plan.priceMonthly > 0 && <span className="text-sm text-slate-400"> / month</span>}
              </div>
              <div className="mt-1 text-sm font-medium text-brand-700">{plan.seats} seats</div>

              <ul className="mt-3 space-y-1.5 text-sm text-slate-600 flex-1">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500">✓</span>
                  <span>Up to {plan.limits.customFieldsPerModule} custom fields per module</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className={plan.limits.aiOnboarding ? "text-emerald-500" : "text-slate-300"}>
                    {plan.limits.aiOnboarding ? "✓" : "—"}
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

              <div className="mt-4">
                <UpgradeButton
                  plan={plan.id}
                  planName={plan.name}
                  isCurrent={isCurrent}
                  isDowngrade={isDowngrade}
                  razorpayConfigured={razorpayConfigured}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-xs text-slate-400">
        {razorpayConfigured
          ? "Upgrades create a Razorpay order; the plan activates once payment is verified via webhook."
          : "In manual mode, upgrades apply immediately. Connect Razorpay to collect payments online."}
      </p>
    </div>
  );
}
