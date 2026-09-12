import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/jobs";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { db } from "@/lib/db";
import { notify } from "@/lib/notify";
import { emit } from "@/lib/events";
import { getStudioConfig, valuesByCategory } from "@/lib/studio/config";
import { sweepContractStatusFlips, sweepRenewalTickets, sweepPmsVisitTickets } from "@/lib/contracts-automation";

// Secure cron entrypoint. A real deploy calls this on a schedule with the CRON_SECRET.
// If CRON_SECRET is unset (dev), it runs open.
//
// C5: this is the ONE path that actually executes contract automation + SLA
// escalation in this app — lib/jobs.ts's Job-row handlers (runDueJobs, called
// below) are dormant scaffolding because nothing ever calls scheduleJob() to
// create the rows they'd act on. So every cron hit also runs the contract/SLA
// sweep DIRECTLY, per tenant, independent of the Job table.
export async function POST(req: Request) {
  const { ok, retryAfter } = rateLimit(`cron:${clientKey(req)}`, 10, 60_000); // 10/min per IP
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobs = await runDueJobs();
  const contracts = await runContractAndSlaSweep();

  return NextResponse.json({ ...jobs, contracts });
}

type TenantSweepResult =
  | {
      tenantId: string;
      ok: true;
      expiring: number;
      expired: number;
      renewalTickets: number;
      pmsTickets: number;
      slaBreaches: number;
    }
  | { tenantId: string; ok: false; error: string };

/**
 * Contract status flips + renewal/PMS visit ticket creation + ticket SLA
 * breach escalation, for every tenant. Each tenant is wrapped in its own
 * try/catch (matching runDueJobs()'s per-job isolation above) so one bad
 * tenant's data can't take the rest of the sweep down.
 */
async function runContractAndSlaSweep(): Promise<TenantSweepResult[]> {
  const now = new Date();
  const tenants = await db.tenant.findMany({ select: { id: true } });
  const results: TenantSweepResult[] = [];

  for (const { id: tenantId } of tenants) {
    try {
      const config = await getStudioConfig(tenantId);

      const flips = await sweepContractStatusFlips(tenantId, config, now);
      const renewalTickets = await sweepRenewalTickets(tenantId, config, now);
      const pmsTickets = await sweepPmsVisitTickets(tenantId, config, now);
      const slaBreaches = await sweepTicketSlaEscalation(tenantId, config, now);

      results.push({
        tenantId,
        ok: true,
        expiring: flips.expiring,
        expired: flips.expired,
        renewalTickets,
        pmsTickets,
        slaBreaches,
      });
    } catch (e) {
      results.push({ tenantId, ok: false, error: (e as Error).message });
    }
  }

  return results;
}

/**
 * Notify + emit "ticket.sla_breached" once per ticket whose slaDueAt has
 * passed while it's still in an OPEN-category status (ticket_status
 * categories, not the "Open"/"InProgress" literals — a tenant that renamed
 * or added open-ish statuses is still covered). Idempotency: a single query
 * fetches which of this batch's tickets already have a "ticket.sla_breached"
 * EventLog row, then only the rest get notified/emitted — one query per
 * tenant batch, not one per ticket.
 */
async function sweepTicketSlaEscalation(
  tenantId: string,
  config: Awaited<ReturnType<typeof getStudioConfig>>,
  now: Date
): Promise<number> {
  const openValues = valuesByCategory(config, "ticket_status", "open");
  if (openValues.length === 0) return 0;

  const breached = await db.ticket.findMany({
    where: { tenantId, status: { in: openValues }, slaDueAt: { lt: now } },
    select: { id: true, subject: true, ownerId: true },
  });
  if (breached.length === 0) return 0;

  const alreadyLogged = await db.eventLog.findMany({
    where: { tenantId, type: "ticket.sla_breached", entityId: { in: breached.map((t) => t.id) } },
    select: { entityId: true },
  });
  const loggedIds = new Set(alreadyLogged.map((e) => e.entityId));

  let breaches = 0;
  for (const t of breached) {
    if (loggedIds.has(t.id)) continue;

    await notify({
      tenantId,
      userId: t.ownerId ?? null, // null = tenant-wide, when the ticket has no owner
      type: "alert",
      title: `SLA breached: ${t.subject}`,
      link: `/tickets/${t.id}`,
    });
    await emit({
      tenantId,
      type: "ticket.sla_breached",
      entity: "Ticket",
      entityId: t.id,
      payload: { note: `${t.subject} breached its SLA` },
    });
    breaches++;
  }

  return breaches;
}

export async function GET(req: Request) {
  return POST(req);
}
