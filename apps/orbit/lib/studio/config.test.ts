import { describe, expect, it } from "vitest";
import {
  options,
  optionValues,
  valuesByCategory,
  optionLabel,
  optionTone,
  optionMeta,
  defaultValue,
  moduleLabel,
  moduleEnabled,
  type StudioConfig,
  type StudioOption,
} from "@/lib/studio/config";
import { DEFAULT_PICKLISTS, DEFAULT_MODULES } from "@/lib/studio/defaults";

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
    DEFAULT_MODULES.map((m) => [
      m.module,
      { ...m, enabled: true, inNav: true, inGlobalSearch: true, navGroup: m.navGroup },
    ])
  );
  return { tenantId: "t1", modules, picklists };
}

describe("default config reproduces the legacy hardcoded behavior (zero-change guarantee)", () => {
  const c = fakeConfig();

  it("lead_status values match the old LEAD_STATUSES array exactly, in order", () => {
    expect(optionValues(c, "lead_status")).toEqual(["New", "Contacted", "Qualified", "Converted", "Dead"]);
  });

  it("opportunity_stage values match the old STAGES array exactly, in order", () => {
    expect(optionValues(c, "opportunity_stage")).toEqual([
      "Qualification",
      "Proposal",
      "Negotiation",
      "ClosedWon",
      "ClosedLost",
    ]);
  });

  it("ticket_status values match the old STATUSES array exactly, in order", () => {
    expect(optionValues(c, "ticket_status")).toEqual(["Open", "InProgress", "Resolved", "Closed"]);
  });

  it("stage probabilities match the old STAGE_PROB map", () => {
    expect(optionMeta(c, "opportunity_stage", "Qualification").probability).toBe(20);
    expect(optionMeta(c, "opportunity_stage", "Proposal").probability).toBe(50);
    expect(optionMeta(c, "opportunity_stage", "Negotiation").probability).toBe(75);
    expect(optionMeta(c, "opportunity_stage", "ClosedWon").probability).toBe(100);
    expect(optionMeta(c, "opportunity_stage", "ClosedLost").probability).toBe(0);
  });

  it("defaults match the old @default() column values", () => {
    expect(defaultValue(c, "lead_status")).toBe("New");
    expect(defaultValue(c, "opportunity_stage")).toBe("Qualification");
    expect(defaultValue(c, "ticket_status")).toBe("Open");
    expect(defaultValue(c, "ticket_priority")).toBe("Medium");
    expect(defaultValue(c, "lead_source")).toBe("Manual");
  });

  it("marketplace sources carry the marketplace category (AI scoring reads this)", () => {
    expect(valuesByCategory(c, "lead_source", "marketplace").sort()).toEqual([
      "IndiaMART",
      "JustDial",
      "TradeIndia",
    ]);
  });

  it("won/lost/open categories partition the pipeline (cockpit + copilot read these)", () => {
    expect(valuesByCategory(c, "opportunity_stage", "won")).toEqual(["ClosedWon"]);
    expect(valuesByCategory(c, "opportunity_stage", "lost")).toEqual(["ClosedLost"]);
    expect(valuesByCategory(c, "opportunity_stage", "open")).toEqual(["Qualification", "Proposal", "Negotiation"]);
    expect(valuesByCategory(c, "lead_status", "converted", "dead")).toEqual(["Converted", "Dead"]);
  });
});

describe("category logic survives tenant renames (the rename-safety guarantee)", () => {
  it("renaming ClosedWon does not change category-based queries", () => {
    const c = fakeConfig();
    const stages = c.picklists.get("opportunity_stage")!;
    const won = stages.find((o) => o.value === "ClosedWon")!;
    won.label = "Order Confirmed"; // tenant rename — value/category untouched
    expect(valuesByCategory(c, "opportunity_stage", "won")).toEqual(["ClosedWon"]);
    expect(optionLabel(c, "opportunity_stage", "ClosedWon")).toBe("Order Confirmed");
  });

  it("archived options stay out of pickers but keep matching historical rows", () => {
    const c = fakeConfig();
    const statuses = c.picklists.get("lead_status")!;
    statuses.find((o) => o.value === "Dead")!.archived = true;
    expect(optionValues(c, "lead_status")).not.toContain("Dead"); // picker
    expect(valuesByCategory(c, "lead_status", "dead")).toContain("Dead"); // queries
    expect(options(c, "lead_status").map((o) => o.value)).not.toContain("Dead");
  });
});

describe("module helpers", () => {
  const c = fakeConfig();
  it("labels resolve with fallback to the module key", () => {
    expect(moduleLabel(c, "leads", "plural")).toBe("Leads");
    expect(moduleLabel(c, "leads", "singular")).toBe("Lead");
    expect(moduleLabel(c, "unknown_module")).toBe("unknown_module");
  });
  it("unknown modules default to enabled", () => {
    expect(moduleEnabled(c, "unknown_module")).toBe(true);
    expect(moduleEnabled(c, "leads")).toBe(true);
  });
  it("tones resolve for badges", () => {
    expect(optionTone(c, "lead_status", "Converted")).toBe("emerald");
    expect(optionTone(c, "lead_status", "nope")).toBe(null);
  });
});
