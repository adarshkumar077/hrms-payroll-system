import { describe, expect, it } from "vitest";
import {
  contractFlipPlan,
  visitSchedule,
  nextDueVisit,
  ticketSlaHours,
  computeSlaDueAt,
  LEGACY_TICKET_SLA_HOURS,
  type ContractForFlip,
} from "@/lib/contracts-automation";
import { DEFAULT_PICKLISTS, DEFAULT_MODULES } from "@/lib/studio/defaults";
import type { StudioConfig, StudioOption } from "@/lib/studio/config";

// Same fake-config builder shape as lib/studio/config.test.ts, so these tests
// exercise the real default config (contract_status, ticket_priority, ...).
function fakeConfig(): StudioConfig {
  const picklists = new Map<string, StudioOption[]>();
  for (const pl of DEFAULT_PICKLISTS) {
    picklists.set(
      pl.key,
      pl.options.map((o, i) => ({
        value: o.value,
        label: o.label ?? o.value,
        tone: o.tone ?? null,
        category: o.category ?? null,
        meta: (o.meta as Record<string, unknown>) ?? {},
        sortOrder: i,
        isDefault: !!o.isDefault,
        archived: false,
      }))
    );
  }
  const modules = new Map(
    DEFAULT_MODULES.map((m) => [m.module, { ...m, enabled: true, inNav: true, inGlobalSearch: true, navGroup: m.navGroup }])
  );
  return { tenantId: "t1", modules, picklists };
}

/** Archive an option in a cloned config (mutates a copy, not the shared fixture). */
function withArchived(config: StudioConfig, key: string, value: string): StudioConfig {
  const picklists = new Map(config.picklists);
  picklists.set(
    key,
    (picklists.get(key) ?? []).map((o) => (o.value === value ? { ...o, archived: true } : o))
  );
  return { ...config, picklists };
}

const DAY = 86400000;
const NOW = new Date("2026-07-12T00:00:00.000Z");

describe("contractFlipPlan", () => {
  const config = fakeConfig();

  function contract(overrides: Partial<ContractForFlip>): ContractForFlip {
    return { status: "Active", endDate: new Date(NOW.getTime() + 90 * DAY), renewalNoticeDays: 30, ...overrides };
  }

  it("stays 'none' when well outside the renewal window", () => {
    expect(contractFlipPlan(contract({}), config, NOW)).toBe("none");
  });

  it("flips Active → ExpiringSoon once inside the notice window", () => {
    const c = contract({ endDate: new Date(NOW.getTime() + 10 * DAY), renewalNoticeDays: 30 });
    expect(contractFlipPlan(c, config, NOW)).toBe("ExpiringSoon");
  });

  it("flips Active → Expired once past the end date", () => {
    const c = contract({ endDate: new Date(NOW.getTime() - 1 * DAY) });
    expect(contractFlipPlan(c, config, NOW)).toBe("Expired");
  });

  it("past-end wins over the notice window (never parks at ExpiringSoon)", () => {
    const c = contract({ endDate: new Date(NOW.getTime() - 1 * DAY), renewalNoticeDays: 365 });
    expect(contractFlipPlan(c, config, NOW)).toBe("Expired");
  });

  it("idempotency guard: already ExpiringSoon stays 'none' (equality guard)", () => {
    const c = contract({ status: "ExpiringSoon", endDate: new Date(NOW.getTime() + 10 * DAY), renewalNoticeDays: 30 });
    expect(contractFlipPlan(c, config, NOW)).toBe("none");
  });

  it("idempotency guard: already Expired stays 'none'", () => {
    const c = contract({ status: "Expired", endDate: new Date(NOW.getTime() - 1 * DAY) });
    expect(contractFlipPlan(c, config, NOW)).toBe("none");
  });

  it("non-'active'-category status (e.g. Cancelled) is left alone even if past end date", () => {
    const c = contract({ status: "Cancelled", endDate: new Date(NOW.getTime() - 100 * DAY) });
    expect(contractFlipPlan(c, config, NOW)).toBe("none");
  });

  it("ExpiringSoon (still category 'active') past its end date still flips to Expired", () => {
    const c = contract({ status: "ExpiringSoon", endDate: new Date(NOW.getTime() - 1 * DAY) });
    expect(contractFlipPlan(c, config, NOW)).toBe("Expired");
  });

  it("archived 'Expired' option: isValidOption is false, so a past-end contract is left untouched", () => {
    const archivedConfig = withArchived(config, "contract_status", "Expired");
    const c = contract({ endDate: new Date(NOW.getTime() - 1 * DAY) });
    expect(contractFlipPlan(c, archivedConfig, NOW)).toBe("none");
  });

  it("archived 'ExpiringSoon' option: a contract entering its notice window is left untouched", () => {
    const archivedConfig = withArchived(config, "contract_status", "ExpiringSoon");
    const c = contract({ endDate: new Date(NOW.getTime() + 10 * DAY), renewalNoticeDays: 30 });
    expect(contractFlipPlan(c, archivedConfig, NOW)).toBe("none");
  });

  it("exactly at the notice-window boundary (<=) flips to ExpiringSoon", () => {
    const c = contract({ endDate: new Date(NOW.getTime() + 30 * DAY), renewalNoticeDays: 30 });
    expect(contractFlipPlan(c, config, NOW)).toBe("ExpiringSoon");
  });
});

describe("visitSchedule", () => {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const oneYearEnd = new Date("2027-01-01T00:00:00.000Z");

  it("quota 0 → empty schedule", () => {
    expect(visitSchedule(start, oneYearEnd, 0)).toEqual([]);
  });

  it("negative quota → empty schedule", () => {
    expect(visitSchedule(start, oneYearEnd, -2)).toEqual([]);
  });

  it("quota 1 → a single visit, landing on endDate", () => {
    const schedule = visitSchedule(start, oneYearEnd, 1);
    expect(schedule).toHaveLength(1);
    expect(schedule[0].getTime()).toBe(oneYearEnd.getTime());
  });

  it("quota 4 on a 1-year contract → 4 evenly-spaced visits, last one on endDate", () => {
    const schedule = visitSchedule(start, oneYearEnd, 4);
    expect(schedule).toHaveLength(4);
    const spanMs = oneYearEnd.getTime() - start.getTime();
    const interval = spanMs / 4;
    for (let i = 0; i < 4; i++) {
      expect(schedule[i].getTime()).toBe(start.getTime() + interval * (i + 1));
    }
    expect(schedule[3].getTime()).toBe(oneYearEnd.getTime());
  });

  it("first visit is NOT at startDate itself (it's startDate + 1 interval)", () => {
    const schedule = visitSchedule(start, oneYearEnd, 4);
    expect(schedule[0].getTime()).toBeGreaterThan(start.getTime());
  });

  it("endDate <= startDate (degenerate period) → empty schedule", () => {
    expect(visitSchedule(oneYearEnd, start, 4)).toEqual([]);
    expect(visitSchedule(start, start, 4)).toEqual([]);
  });

  it("leap-year span (2028, 366 days) still splits evenly across the quota", () => {
    const leapStart = new Date("2028-01-01T00:00:00.000Z");
    const leapEnd = new Date("2029-01-01T00:00:00.000Z"); // spans Feb 29, 2028
    const schedule = visitSchedule(leapStart, leapEnd, 3);
    expect(schedule).toHaveLength(3);
    const spanMs = leapEnd.getTime() - leapStart.getTime();
    expect(schedule[1].getTime() - schedule[0].getTime()).toBe(spanMs / 3);
    expect(schedule[2].getTime()).toBe(leapEnd.getTime());
  });

  it("string dates are accepted the same as Date objects", () => {
    const schedule = visitSchedule(start.toISOString(), oneYearEnd.toISOString(), 2);
    expect(schedule).toHaveLength(2);
    expect(schedule[1].getTime()).toBe(oneYearEnd.getTime());
  });
});

describe("nextDueVisit", () => {
  const schedule = visitSchedule(new Date("2026-01-01T00:00:00.000Z"), new Date("2027-01-01T00:00:00.000Z"), 4);
  // schedule ≈ [Apr 2, Jul 2/3, Oct 2/3, Jan 1 2027] (interval = 365.25/4 days)

  it("now before every visit → null", () => {
    expect(nextDueVisit(schedule, new Date("2026-01-01T00:00:00.000Z"))).toBeNull();
  });

  it("now after every visit → the earliest (first, minimum-dated) entry", () => {
    const due = nextDueVisit(schedule, new Date("2028-01-01T00:00:00.000Z"));
    expect(due?.getTime()).toBe(schedule[0].getTime());
  });

  it("now between visit 1 and visit 2 → visit 1 is due", () => {
    const between = new Date(schedule[0].getTime() + DAY);
    const due = nextDueVisit(schedule, between);
    expect(due?.getTime()).toBe(schedule[0].getTime());
  });

  it("now exactly on a scheduled date → that entry counts as due (<=)", () => {
    const due = nextDueVisit(schedule, schedule[0]);
    expect(due?.getTime()).toBe(schedule[0].getTime());
  });

  it("empty schedule → null regardless of now", () => {
    expect(nextDueVisit([], new Date())).toBeNull();
  });
});

describe("ticketSlaHours / computeSlaDueAt", () => {
  const config = fakeConfig();

  it("default config's meta.slaHours mirrors LEGACY_TICKET_SLA_HOURS exactly (zero-change guarantee)", () => {
    for (const priority of Object.keys(LEGACY_TICKET_SLA_HOURS)) {
      expect(ticketSlaHours(config, priority)).toBe(LEGACY_TICKET_SLA_HOURS[priority]);
    }
  });

  it("Urgent is faster than Low (severity ordering sanity check)", () => {
    expect(ticketSlaHours(config, "Urgent")!).toBeLessThan(ticketSlaHours(config, "Low")!);
  });

  it("unknown priority with no meta and no legacy entry → null", () => {
    expect(ticketSlaHours(config, "SomeCustomPriority")).toBeNull();
  });

  it("meta.slaHours overrides the legacy fallback when a tenant edits it", () => {
    const picklists = new Map(config.picklists);
    picklists.set(
      "ticket_priority",
      (picklists.get("ticket_priority") ?? []).map((o) => (o.value === "Medium" ? { ...o, meta: { slaHours: 12 } } : o))
    );
    const edited: StudioConfig = { ...config, picklists };
    expect(ticketSlaHours(edited, "Medium")).toBe(12);
  });

  it("computeSlaDueAt adds the configured hours to 'now'", () => {
    const due = computeSlaDueAt(config, "High", NOW);
    expect(due?.getTime()).toBe(NOW.getTime() + LEGACY_TICKET_SLA_HOURS.High * 3600000);
  });

  it("computeSlaDueAt returns null when no SLA hours are configured at all", () => {
    expect(computeSlaDueAt(config, "SomeCustomPriority", NOW)).toBeNull();
  });
});
