"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { notify } from "@/lib/notify";
import { PLANS, getSubscription, planOf, type PlanId } from "@/lib/billing";
import { razorpayConfigured, createRazorpayOrder } from "@/lib/payments";
import { inr } from "@/lib/format";

export type UpgradeResult =
  | { ok: false }
  | { ok: true; mode: "manual"; plan: PlanId }
  | { ok: true; mode: "checkout"; plan: PlanId; orderId: string; amount: number; keyId?: string };

/**
 * Upgrade (or change) the tenant's plan.
 *   • Razorpay configured AND the target plan costs money → create an order
 *     and hand it back for checkout. This action does NOT flip the plan —
 *     only the verified webhook (app/api/webhooks/razorpay/route.ts) does,
 *     once it confirms a `payment.captured` event whose amount covers the
 *     plan price. Never apply the plan here just because an order exists.
 *   • Otherwise (Razorpay not configured, or the target plan is Free and so
 *     needs no payment) → apply the plan change immediately + notify, same
 *     as before.
 */
export async function upgradePlanAction(formData: FormData): Promise<UpgradeResult> {
  const s = await requireSession();

  const target = String(formData.get("plan") || "") as PlanId;
  if (!(target in PLANS)) return { ok: false };

  const sub = await getSubscription(s.tenantId);
  const current = planOf(sub.plan);
  if (current === target) return { ok: false };

  const plan = PLANS[target];

  if (razorpayConfigured && plan.priceMonthly > 0) {
    // Live mode: create an order for the customer to pay. Do NOT flip the plan
    // yet — that happens after the verified Razorpay webhook (see lib/payments).
    const order = await createRazorpayOrder(plan.priceMonthly, {
      receipt: `sub-${s.tenantId}-${target}`,
      notes: { kind: "plan", tenantId: s.tenantId, plan: target },
    });

    await emit({
      tenantId: s.tenantId,
      type: "subscription.order.created",
      entity: "Subscription",
      entityId: sub.id,
      actorId: s.userId,
      payload: { note: `Order for ${plan.name}`, plan: target, orderId: order.orderId, amount: plan.priceMonthly },
    });

    revalidatePath("/billing");
    return { ok: true, mode: "checkout", plan: target, orderId: order.orderId, amount: plan.priceMonthly, keyId: order.keyId };
  }

  // Manual mode: apply the plan change directly.
  await db.subscription.update({
    where: { tenantId: s.tenantId },
    data: { plan: target, seats: plan.seats, status: "active", provider: null },
  });
  // Keep the denormalized copy on Tenant in sync (schema carries plan/seats too).
  await db.tenant.update({ where: { id: s.tenantId }, data: { plan: target, seats: plan.seats } }).catch(() => {});

  await notify({
    tenantId: s.tenantId,
    title: "Plan updated",
    body: `Your workspace is now on the ${plan.name} plan (${plan.seats} seats${plan.priceMonthly > 0 ? `, ${inr(plan.priceMonthly)}/mo` : ""}).`,
    link: "/billing",
  });

  await emit({
    tenantId: s.tenantId,
    type: "subscription.updated",
    entity: "Subscription",
    entityId: sub.id,
    actorId: s.userId,
    payload: { note: `Switched to ${plan.name}`, from: current, to: target, seats: plan.seats },
  });

  revalidatePath("/billing");
  return { ok: true, mode: "manual", plan: target };
}
