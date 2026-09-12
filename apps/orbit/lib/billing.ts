// ─────────────────────────────────────────────────────────────
// Billing — plan registry, subscription lifecycle, and seat metering.
//
// Plans are a static registry (no DB table). A tenant's live plan lives on the
// Subscription row (one per tenant). Seat usage is derived from active users.
// ─────────────────────────────────────────────────────────────

import { db } from "@/lib/db";

export type PlanId = "free" | "growth" | "scale";

export type PlanLimits = {
  /** Max non-system (custom) fields allowed per module on this plan. */
  customFieldsPerModule: number;
  /** Whether the AI onboarding interview (Studio) is available on this plan. */
  aiOnboarding: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  seats: number;
  /** Monthly price in ₹ (whole rupees). 0 = free. */
  priceMonthly: number;
  blurb: string;
  features: string[];
  limits: PlanLimits;
};

/**
 * The plan catalogue. Seats: free 5, growth 25, scale 100. Prices in INR/month.
 * Ordered cheapest → priciest so the UI can render them in sequence.
 */
export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    seats: 5,
    priceMonthly: 0,
    blurb: "For founders getting started.",
    features: ["Up to 5 users", "CRM + Finance + HR", "GST invoicing", "AI copilot (fair use)"],
    limits: { customFieldsPerModule: 5, aiOnboarding: false },
  },
  growth: {
    id: "growth",
    name: "Growth",
    seats: 25,
    priceMonthly: 2499,
    blurb: "For growing SMB teams.",
    features: ["Up to 25 users", "Everything in Free", "Payroll + Inventory", "Priority AI", "e-Invoicing (IRP)"],
    limits: { customFieldsPerModule: 25, aiOnboarding: true },
  },
  scale: {
    id: "scale",
    name: "Scale",
    seats: 100,
    priceMonthly: 7999,
    blurb: "For multi-branch operations.",
    features: ["Up to 100 users", "Everything in Growth", "Advanced automations", "Dedicated support", "Higher AI limits"],
    limits: { customFieldsPerModule: 50, aiOnboarding: true },
  },
};

/** Plans as an ordered list (for rendering the pricing table). */
export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.growth, PLANS.scale];

/** Coerce an arbitrary stored plan string to a known PlanId (defaults to free). */
export function planOf(plan: string | null | undefined): PlanId {
  return plan === "growth" || plan === "scale" ? plan : "free";
}

/**
 * Read the tenant's Subscription, creating a `free` one on first access.
 * (Subscription.tenantId is @unique, so this is idempotent per tenant.)
 */
export async function getSubscription(tenantId: string) {
  const existing = await db.subscription.findUnique({ where: { tenantId } });
  if (existing) return existing;
  // Race-safe-ish: create, but fall back to a re-read if a parallel request won.
  try {
    return await db.subscription.create({
      data: { tenantId, plan: "free", seats: PLANS.free.seats, status: "active" },
    });
  } catch {
    const again = await db.subscription.findUnique({ where: { tenantId } });
    if (again) return again;
    throw new Error("Failed to create subscription");
  }
}

export type SeatUsage = {
  plan: PlanId;
  planName: string;
  used: number; // active users
  seats: number; // seats allowed by the plan
  remaining: number;
  overCapacity: boolean;
};

/** Active user count vs. the seats granted by the tenant's current plan. */
export async function seatUsage(tenantId: string): Promise<SeatUsage> {
  const [sub, used] = await Promise.all([
    getSubscription(tenantId),
    db.user.count({ where: { tenantId, active: true } }),
  ]);
  const plan = planOf(sub.plan);
  const seats = PLANS[plan].seats;
  return {
    plan,
    planName: PLANS[plan].name,
    used,
    seats,
    remaining: Math.max(0, seats - used),
    overCapacity: used > seats,
  };
}

/** Whether the tenant can add one more active user without exceeding plan seats. */
export async function canAddSeat(tenantId: string): Promise<boolean> {
  const u = await seatUsage(tenantId);
  return u.used < u.seats;
}

/** The tenant's current plan limits (custom-field caps, AI onboarding gate, …). Defaults to free if no subscription exists yet. */
export async function planLimits(tenantId: string): Promise<PlanLimits> {
  const sub = await getSubscription(tenantId);
  const plan = planOf(sub.plan);
  return PLANS[plan].limits;
}
