import { db } from "./db";
import { notify } from "./notify";

// GAPS #14a: events don't auto-create notifications on their own — this rule
// map wires the notable ones up. Keys are EventLog `type`s; values describe
// the notification `emit()` should fire alongside the EventLog row. Add an
// entry here to make a new event type "notification-worthy" without hand-calling
// notify() at every call site.
const NOTIFY_RULES: Record<string, { title: string; link?: string }> = {
  "invoice.finalized": { title: "Invoice finalized", link: "/finance/invoices" },
  "payment.recorded": { title: "Payment recorded", link: "/finance/invoices" },
  "payroll.run.locked": { title: "Payroll run locked", link: "/payroll" },
  "lead.captured": { title: "New lead captured", link: "/leads" },
};

// The event bus. Every meaningful module write should emit() — the cockpit and
// automation engine read from EventLog. In prod this fronts NATS/Kafka; here it's the table.
export async function emit(params: {
  tenantId: string;
  type: string;
  entity: string;
  entityId: string;
  payload?: Record<string, unknown>;
  actorId?: string;
}) {
  const row = await db.eventLog.create({
    data: {
      tenantId: params.tenantId,
      type: params.type,
      entity: params.entity,
      entityId: params.entityId,
      payload: JSON.stringify(params.payload ?? {}),
      actorId: params.actorId,
    },
  });

  const rule = NOTIFY_RULES[params.type];
  if (rule) {
    // Best-effort: a notification failure should never break the caller's
    // write path or make emit() itself throw.
    try {
      await notify({ tenantId: params.tenantId, type: params.type, title: rule.title, link: rule.link });
    } catch (e) {
      console.warn(`[events] notify() failed for ${params.type} (non-fatal):`, (e as Error).message);
    }
  }

  return row;
}

export async function recentEvents(tenantId: string, limit = 15) {
  return db.eventLog.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
