import { db } from "./db";
import { notify } from "./notify";
import { getStudioConfig } from "./studio/config";
import { sweepContractStatusFlips } from "./contracts-automation";

// Minimal background-job runner. Jobs are rows in the `Job` table with a `runAt`.
// A real deploy points a cron at POST /api/cron (secured by CRON_SECRET) to call runDueJobs().
// Handlers are pure and idempotent-ish; add new ones to HANDLERS.

type Handler = (job: { id: string; tenantId: string | null; payload: any }) => Promise<string>;

const HANDLERS: Record<string, Handler> = {
  // Reminds the tenant a payroll run is due.
  "payroll.reminder": async (job) => {
    if (!job.tenantId) return "no tenant";
    await notify({ tenantId: job.tenantId, type: "reminder", title: "Payroll due", body: "Run and lock this month's payroll before the 7th (TDS) / 15th (PF/ESI).", link: "/payroll" });
    return "reminded";
  },
  // Flags tickets breaching SLA.
  "sla.ageing": async (job) => {
    if (!job.tenantId) return "no tenant";
    const breached = await db.ticket.count({ where: { tenantId: job.tenantId, status: { in: ["Open", "InProgress"] }, slaDueAt: { lt: new Date() } } });
    if (breached > 0) await notify({ tenantId: job.tenantId, type: "alert", title: `${breached} ticket(s) breaching SLA`, link: "/tickets" });
    return `breached=${breached}`;
  },
  // Compliance calendar heads-up.
  "compliance.reminder": async (job) => {
    if (!job.tenantId) return "no tenant";
    await notify({ tenantId: job.tenantId, type: "reminder", title: "GST filing due", body: "GSTR-1 by the 11th. Draft auto-prepared from finalized invoices.", link: "/finance/invoices" });
    return "reminded";
  },
  // Wave C: AMC/service contract renewal notices. Unlike the three handlers
  // above (which require a pre-scheduled per-tenant Job row — see
  // scheduleJob(), never actually called anywhere in this app today, so
  // those three are dormant scaffolding), this one sweeps every tenant
  // itself when run unscoped (job.tenantId === null), so it's useful the
  // moment something schedules a single global "contract.renewal" Job. If a
  // Job IS scoped to one tenant, only that tenant is processed — same
  // job.tenantId convention as the others.
  //
  // C5: the actual decision + DB/notify/emit logic now lives in
  // lib/contracts-automation.ts's sweepContractStatusFlips(), shared with the
  // live cron entrypoint (app/api/cron/route.ts) which — since scheduleJob()
  // is never called — is the path that actually runs in this app today. This
  // handler is kept behaviorally identical for anyone who does start
  // scheduling "contract.renewal" Job rows.
  "contract.renewal": async (job) => {
    const tenantIds = job.tenantId ? [job.tenantId] : (await db.tenant.findMany({ select: { id: true } })).map((t) => t.id);
    const now = new Date();
    let expiring = 0;
    let expired = 0;

    for (const tenantId of tenantIds) {
      const config = await getStudioConfig(tenantId);
      const result = await sweepContractStatusFlips(tenantId, config, now);
      expiring += result.expiring;
      expired += result.expired;
    }

    return `expiring=${expiring} expired=${expired}`;
  },
};

export async function scheduleJob(type: string, runAt: Date, tenantId?: string, payload: any = {}) {
  return db.job.create({ data: { type, runAt, tenantId: tenantId ?? null, payload: JSON.stringify(payload) } });
}

export async function runDueJobs(): Promise<{ ran: number; results: any[] }> {
  const due = await db.job.findMany({ where: { status: "pending", runAt: { lte: new Date() } }, take: 50 });
  const results: any[] = [];
  for (const job of due) {
    // GAPS #8: claim the job atomically before running it. If two `/api/cron`
    // hits race on the same job, only the one whose updateMany actually
    // flips pending → running (count === 1) proceeds; the loser skips it.
    const claimed = await db.job.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "running" } });
    if (claimed.count !== 1) {
      results.push({ id: job.id, type: job.type, result: "skipped (already claimed)" });
      continue;
    }

    const handler = HANDLERS[job.type] as Handler | undefined;
    try {
      const result = handler ? await handler({ id: job.id, tenantId: job.tenantId, payload: JSON.parse(job.payload || "{}") }) : "no handler";
      await db.job.update({ where: { id: job.id }, data: { status: handler ? "done" : "failed", result } });
      results.push({ id: job.id, type: job.type, result });
    } catch (e) {
      await db.job.update({ where: { id: job.id }, data: { status: "failed", result: (e as Error).message } });
      results.push({ id: job.id, type: job.type, error: (e as Error).message });
    }
  }
  return { ran: due.length, results };
}

export const JOB_TYPES = Object.keys(HANDLERS);
