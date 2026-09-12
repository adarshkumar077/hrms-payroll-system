import { db } from "./db";
import { notify } from "./notify";
import { emit } from "./events";
import {
  type StudioConfig,
  valuesByCategory,
  isValidOption,
  optionMeta,
  defaultValue,
} from "./studio/config";

/**
 * Orbit Wave C — Contract automation v1 (C5).
 *
 * Single shared implementation behind the two callers that actually run this
 * sweep: lib/jobs.ts's dormant `contract.renewal` Job handler (kept alive for
 * anyone who does start scheduling Job rows) and the live cron entrypoint,
 * app/api/cron/route.ts, which invokes the sweep functions below directly on
 * every hit — see that file's header comment for why (GAPS: scheduleJob() is
 * never called anywhere in the app, so Job rows never actually get created).
 *
 * Split into:
 *  - PURE date/decision functions (contractFlipPlan, visitSchedule,
 *    nextDueVisit, ticketSlaHours, computeSlaDueAt) — no I/O, table-tested in
 *    contracts-automation.test.ts.
 *  - Impure sweep orchestrators (sweepContractStatusFlips, sweepRenewalTickets,
 *    sweepPmsVisitTickets) — DB reads/writes + notify()/emit(), built on top
 *    of the pure functions above. Callers pass an already-loaded StudioConfig
 *    (getStudioConfig is per-tenant and both call sites need it for multiple
 *    sweeps, so it's loaded once and threaded through rather than re-fetched).
 */

// ── Pure: contract status flip ──────────────────────────────────────────────

export type ContractFlipTarget = "none" | "ExpiringSoon" | "Expired";

export type ContractForFlip = {
  status: string;
  endDate: Date | string;
  renewalNoticeDays: number;
};

/**
 * Decide whether a contract needs its status flipped, given "now". Pure and
 * idempotent-safe: callers only need to check `!== "none"` and apply it.
 *
 * Rules (C2's exact semantics, carried over unchanged):
 *  - Only contracts currently in a "active"-category status (via
 *    valuesByCategory) are eligible at all — Active AND ExpiringSoon both
 *    carry category "active" in lib/studio/defaults.ts, so this covers both.
 *  - "ExpiringSoon" and "Expired" are looked up by VALUE, the one sanctioned
 *    literal exception (category alone can't tell Active from ExpiringSoon).
 *    If a tenant renamed/archived either option, isValidOption() is false and
 *    matching contracts are left untouched — documented fallback, not
 *    silently coerced to some other value.
 *  - Past end-date wins over "within notice window" (a contract that's both
 *    past its end date AND inside its notice window flips straight to
 *    Expired, never parks at ExpiringSoon).
 *  - Equality guard (`status !== target`) is the whole idempotency mechanism:
 *    once flipped, the contract's status no longer matches the trigger
 *    condition's implicit "not already there" requirement, so re-running the
 *    sweep is a no-op for it. No separate "already notified" flag needed.
 */
export function contractFlipPlan(contract: ContractForFlip, config: StudioConfig, now: Date): ContractFlipTarget {
  const activeValues = valuesByCategory(config, "contract_status", "active");
  if (activeValues.length === 0 || !activeValues.includes(contract.status)) return "none";

  const endMs = new Date(contract.endDate).getTime();
  const pastEnd = endMs < now.getTime();
  const withinNotice = endMs - contract.renewalNoticeDays * 86400000 <= now.getTime();

  const expiredIsValid = isValidOption(config, "contract_status", "Expired");
  const expiringSoonIsValid = isValidOption(config, "contract_status", "ExpiringSoon");

  if (pastEnd && expiredIsValid && contract.status !== "Expired") return "Expired";
  if (!pastEnd && withinNotice && expiringSoonIsValid && contract.status !== "ExpiringSoon") return "ExpiringSoon";
  return "none";
}

// ── Pure: PMS visit schedule ────────────────────────────────────────────────

/**
 * Evenly-spaced preventive-maintenance visit dates across a contract period.
 *
 * Convention: the period [startDate, endDate] is split into `visitQuota`
 * equal intervals; visit *k* (1-indexed) lands at `startDate + k * interval`.
 * The FIRST visit is therefore never at startDate itself — it's one interval
 * in — and the LAST visit lands exactly on endDate (k === visitQuota). E.g.
 * quota 4 on a 1-year contract → interval ≈ 3 months → visits at
 * start+3mo, start+6mo, start+9mo, start+12mo(=end).
 *
 * quota <= 0, or a non-positive period (endDate <= startDate), returns [].
 */
export function visitSchedule(startDate: Date | string, endDate: Date | string, visitQuota: number): Date[] {
  if (!Number.isFinite(visitQuota) || visitQuota <= 0) return [];
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (!(end > start)) return [];

  const interval = (end - start) / visitQuota;
  const dates: Date[] = [];
  for (let k = 1; k <= visitQuota; k++) {
    dates.push(new Date(start + interval * k));
  }
  return dates;
}

/**
 * The earliest schedule entry that is already due (<= now), or null if none
 * are due yet (now is before every visit) or the schedule is empty.
 *
 * This is a existence/anchor check ("is anything due for this contract at
 * all"), not a "which visit hasn't been ticketed yet" lookup — it has no
 * knowledge of tickets already created. The PMS-visit sweep
 * (sweepPmsVisitTickets below) uses it as the gate, then walks the schedule
 * itself to find the earliest due index that doesn't have a ticket yet, so a
 * contract's visits get ticketed one-by-one as the contract progresses
 * rather than getting stuck re-checking visit #1 forever.
 */
export function nextDueVisit(schedule: Date[], now: Date): Date | null {
  const nowMs = now.getTime();
  let best: Date | null = null;
  for (const d of schedule) {
    const t = d.getTime();
    if (t <= nowMs && (best === null || t < best.getTime())) best = d;
  }
  return best;
}

// ── Pure: per-priority SLA hours ────────────────────────────────────────────

/**
 * Legacy fallback SLA hours by ticket_priority VALUE. There was no
 * pre-existing priority→hours mapping anywhere in the app before C5 — the
 * only SLA input was CreateTicketForm's manual "hours from now" dropdown
 * (4/8/24/48/none), unrelated to priority. These numbers reuse that exact
 * dropdown scale, assigned in the conventional severity order (Urgent
 * fastest, Low slowest), and are mirrored verbatim into each ticket_priority
 * option's `meta.slaHours` in lib/studio/defaults.ts — so for the default
 * config, optionMeta() and this fallback always agree by construction. This
 * map only matters as a safety net for a priority value with no meta at all
 * (e.g. a hand-edited PicklistOption row).
 */
export const LEGACY_TICKET_SLA_HOURS: Record<string, number> = {
  Urgent: 4,
  High: 8,
  Medium: 24,
  Low: 48,
};

/** Configured SLA hours for a ticket_priority value — Studio meta first, legacy map as fallback. */
export function ticketSlaHours(config: StudioConfig, priority: string): number | null {
  const meta = optionMeta(config, "ticket_priority", priority);
  const metaHours = Number((meta as { slaHours?: unknown })?.slaHours);
  if (Number.isFinite(metaHours) && metaHours > 0) return metaHours;

  const legacy = LEGACY_TICKET_SLA_HOURS[priority];
  return typeof legacy === "number" ? legacy : null;
}

/** slaDueAt for a newly-created ticket of this priority, or null if no SLA hours are configured. */
export function computeSlaDueAt(config: StudioConfig, priority: string, now: Date): Date | null {
  const hours = ticketSlaHours(config, priority);
  return hours ? new Date(now.getTime() + hours * 60 * 60 * 1000) : null;
}

// ── Impure: sweep orchestrators ─────────────────────────────────────────────

type ContractRow = {
  id: string;
  number: string;
  name: string;
  status: string;
  endDate: Date;
  renewalNoticeDays: number;
};

/**
 * Flip contracts between Active → ExpiringSoon → Expired (contractFlipPlan
 * decides), notifying + emitting exactly once per state change. Shared by
 * lib/jobs.ts's `contract.renewal` handler and the cron sweep — identical
 * behavior, single implementation.
 */
export async function sweepContractStatusFlips(
  tenantId: string,
  config: StudioConfig,
  now: Date
): Promise<{ expiring: number; expired: number }> {
  const activeValues = valuesByCategory(config, "contract_status", "active");
  let expiring = 0;
  let expired = 0;
  if (activeValues.length === 0) return { expiring, expired };

  const contracts: ContractRow[] = await db.contract.findMany({
    where: { tenantId, status: { in: activeValues } },
    select: { id: true, number: true, name: true, status: true, endDate: true, renewalNoticeDays: true },
  });

  for (const c of contracts) {
    const target = contractFlipPlan(c, config, now);
    if (target === "none") continue;

    await db.contract.update({ where: { id: c.id }, data: { status: target } });

    if (target === "Expired") {
      await notify({ tenantId, type: "alert", title: `Contract ${c.number} expired`, body: c.name, link: `/contracts/${c.id}` });
      await emit({
        tenantId,
        type: "contract.expired",
        entity: "Contract",
        entityId: c.id,
        payload: { note: `${c.number} — ${c.name} expired`, from: c.status, to: "Expired" },
      });
      expired++;
    } else {
      await notify({ tenantId, type: "reminder", title: `Contract ${c.number} renewal due soon`, body: c.name, link: `/contracts/${c.id}` });
      await emit({
        tenantId,
        type: "contract.expiring",
        entity: "Contract",
        entityId: c.id,
        payload: { note: `${c.number} — ${c.name} enters its renewal window`, from: c.status, to: "ExpiringSoon" },
      });
      expiring++;
    }
  }

  return { expiring, expired };
}

const RENEWAL_SUBJECT_PREFIX = "Contract renewal:";

/**
 * Create a renewal ticket for every "active"-category contract that has
 * entered its renewal notice window. Idempotency: skip if ANY ticket already
 * exists with this contractId and a subject starting "Contract renewal:" —
 * regardless of that ticket's status. One renewal ticket per contract, ever
 * (a closed/resolved renewal ticket does not get a successor; that's a
 * conscious v1 simplification — reopening or re-flagging a stale renewal
 * ticket is a human/Studio decision, not something the sweep re-triggers).
 */
export async function sweepRenewalTickets(tenantId: string, config: StudioConfig, now: Date): Promise<number> {
  const activeValues = valuesByCategory(config, "contract_status", "active");
  if (activeValues.length === 0) return 0;

  const typeKey = defaultValue(config, "ticket_type");
  const priority = defaultValue(config, "ticket_priority");
  const status = defaultValue(config, "ticket_status");
  if (!typeKey || !priority || !status) return 0; // no usable default config — skip gracefully

  const contracts: (ContractRow & { accountId: string | null })[] = await db.contract.findMany({
    where: { tenantId, status: { in: activeValues } },
    select: { id: true, number: true, name: true, status: true, endDate: true, renewalNoticeDays: true, accountId: true },
  });

  let created = 0;
  for (const c of contracts) {
    const endMs = new Date(c.endDate).getTime();
    const withinNotice = endMs - c.renewalNoticeDays * 86400000 <= now.getTime();
    if (!withinNotice) continue;

    const subject = `${RENEWAL_SUBJECT_PREFIX} ${c.number} — ${c.name}`;
    const existing = await db.ticket.findFirst({
      where: { tenantId, contractId: c.id, subject: { startsWith: RENEWAL_SUBJECT_PREFIX } },
      select: { id: true },
    });
    if (existing) continue;

    const ticket = await db.ticket.create({
      data: {
        tenantId,
        subject,
        priority,
        status,
        typeKey,
        contractId: c.id,
        accountId: c.accountId,
        slaDueAt: computeSlaDueAt(config, priority, now),
        charges: 0,
      },
    });

    await emit({
      tenantId,
      type: "contract.renewal_ticket",
      entity: "Ticket",
      entityId: ticket.id,
      payload: { note: `Renewal ticket opened for ${c.number} — ${c.name}`, contractId: c.id },
    });
    created++;
  }

  return created;
}

/**
 * Create PMS (preventive-maintenance) visit tickets from each contract's
 * visitSchedule(). Gate: nextDueVisit(schedule, now) must find something due
 * at all; then the earliest due index without an existing ticket gets one
 * created (at most one new ticket per contract per sweep run — subsequent
 * due visits are picked up on later sweeps). typeKey is "AMCVisit" if that's
 * still a valid ticket_type option for the tenant, else the tenant's default
 * ticket_type — same one-sanctioned-literal convention as contractFlipPlan's
 * "ExpiringSoon"/"Expired" lookups.
 */
export async function sweepPmsVisitTickets(tenantId: string, config: StudioConfig, now: Date): Promise<number> {
  const activeValues = valuesByCategory(config, "contract_status", "active");
  if (activeValues.length === 0) return 0;

  const priority = defaultValue(config, "ticket_priority");
  const status = defaultValue(config, "ticket_status");
  if (!priority || !status) return 0;

  const typeKey = isValidOption(config, "ticket_type", "AMCVisit") ? "AMCVisit" : defaultValue(config, "ticket_type");
  if (!typeKey) return 0;

  const contracts: (ContractRow & { startDate: Date; visitQuota: number; accountId: string | null })[] =
    await db.contract.findMany({
      where: { tenantId, status: { in: activeValues }, visitQuota: { gt: 0 } },
      select: {
        id: true,
        number: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        renewalNoticeDays: true,
        visitQuota: true,
        accountId: true,
      },
    });

  let created = 0;
  for (const c of contracts) {
    const schedule = visitSchedule(c.startDate, c.endDate, c.visitQuota);
    if (!nextDueVisit(schedule, now)) continue; // nothing due yet for this contract

    for (let i = 0; i < schedule.length; i++) {
      if (schedule[i].getTime() > now.getTime()) break; // not due yet, and nothing after it is either

      const k = i + 1;
      const marker = `PMS visit ${k}/${c.visitQuota}`;
      const existing = await db.ticket.findFirst({
        where: { tenantId, contractId: c.id, subject: { startsWith: marker } },
        select: { id: true },
      });
      if (existing) continue; // this visit is already ticketed — check the next due one

      const subject = `${marker}: ${c.name}`;
      const ticket = await db.ticket.create({
        data: {
          tenantId,
          subject,
          priority,
          status,
          typeKey,
          contractId: c.id,
          accountId: c.accountId,
          slaDueAt: computeSlaDueAt(config, priority, now),
          charges: 0,
        },
      });

      await emit({
        tenantId,
        type: "contract.pms_ticket",
        entity: "Ticket",
        entityId: ticket.id,
        payload: { note: `PMS visit ${k}/${c.visitQuota} ticket opened for ${c.number} — ${c.name}`, contractId: c.id, visitIndex: k },
      });
      created++;
      break; // one new ticket per contract per sweep
    }
  }

  return created;
}
