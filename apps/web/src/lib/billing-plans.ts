/** Plan catalogue ported from Orbit CRM (vendor/orbit-crm/lib/billing.ts) — static registry for HRMS UI. */

export type PlanId = 'free' | 'growth' | 'scale';

export type Plan = {
  id: PlanId;
  name: string;
  seats: number;
  priceMonthly: number;
  blurb: string;
  features: string[];
  limits: { customFieldsPerModule: number; aiOnboarding: boolean };
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    seats: 5,
    priceMonthly: 0,
    blurb: 'For founders getting started.',
    features: ['Up to 5 users', 'CRM + HR + Payroll', 'Attendance', 'Reports'],
    limits: { customFieldsPerModule: 5, aiOnboarding: false },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    seats: 25,
    priceMonthly: 2499,
    blurb: 'For growing SMB teams.',
    features: ['Up to 25 users', 'Everything in Free', 'Priority support', 'Advanced CRM'],
    limits: { customFieldsPerModule: 25, aiOnboarding: true },
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    seats: 100,
    priceMonthly: 7999,
    blurb: 'For multi-branch operations.',
    features: ['Up to 100 users', 'Everything in Growth', 'Dedicated support', 'Higher limits'],
    limits: { customFieldsPerModule: 50, aiOnboarding: true },
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.growth, PLANS.scale];

export function planOf(plan: string | null | undefined): PlanId {
  return plan === 'growth' || plan === 'scale' ? plan : 'free';
}

export function formatInr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}
