import { describe, expect, it } from "vitest";
import { listPacks, planPack, type PackPlanSnapshot, type StudioPack } from "@/lib/studio/packs";
import { DEFAULT_PICKLISTS } from "@/lib/studio/defaults";

// ── Fixtures ─────────────────────────────────────────────────────────────

function emptySnapshot(): PackPlanSnapshot {
  return { modules: new Map(), picklists: new Map(), fields: new Set() };
}

function snapshotWith(overrides: Partial<PackPlanSnapshot>): PackPlanSnapshot {
  return { ...emptySnapshot(), ...overrides };
}

const KNOWN_CATEGORIES = new Set([
  "open",
  "won",
  "lost",
  "converted",
  "dead",
  "marketplace",
  "inbound",
  "manual",
  "low",
  "medium",
  "high",
  "critical",
  "closed",
]);

// ── planPack: modules ────────────────────────────────────────────────────

describe("planPack — modules", () => {
  it("classifies a known module as an update", () => {
    const pack: StudioPack = { key: "p", name: "P", industry: "x", description: "d", modules: [{ module: "tickets", labelSingular: "Job", labelPlural: "Jobs" }] };
    const snapshot = snapshotWith({ modules: new Map([["tickets", { labelSingular: "Ticket", labelPlural: "Tickets" }]]) });
    const diff = planPack(pack, snapshot);
    expect(diff.updates).toHaveLength(1);
    expect(diff.updates[0].kind).toBe("module");
    expect(diff.creates).toHaveLength(0);
    expect(diff.conflicts).toHaveLength(0);
  });

  it("classifies an unknown module as a conflict", () => {
    const pack: StudioPack = { key: "p", name: "P", industry: "x", description: "d", modules: [{ module: "warehouses", labelSingular: "Warehouse", labelPlural: "Warehouses" }] };
    const diff = planPack(pack, emptySnapshot());
    expect(diff.conflicts).toHaveLength(1);
    expect(diff.conflicts[0].kind).toBe("module");
    expect(diff.updates).toHaveLength(0);
  });
});

// ── planPack: picklists ──────────────────────────────────────────────────

describe("planPack — picklists", () => {
  it("a brand new picklist key creates the picklist itself plus every option", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      picklists: [{ key: "ticket_type", label: "Ticket Type", options: [{ value: "A" }, { value: "B" }] }],
    };
    const diff = planPack(pack, emptySnapshot());
    const picklistCreates = diff.creates.filter((c) => c.kind === "picklist");
    const optionCreates = diff.creates.filter((c) => c.kind === "option");
    expect(picklistCreates).toHaveLength(1);
    expect(optionCreates).toHaveLength(2);
    expect(diff.conflicts).toHaveLength(0);
  });

  it("an existing key with a brand new value creates just the option", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      picklists: [{ key: "lead_status", label: "Lead Status", options: [{ value: "Escalated" }] }],
    };
    const snapshot = snapshotWith({ picklists: new Map([["lead_status", { id: "pl1", options: new Map([["New", "New"]]) }]]) });
    const diff = planPack(pack, snapshot);
    expect(diff.creates).toEqual([{ kind: "option", summary: expect.stringContaining("Escalated") }]);
    expect(diff.conflicts).toHaveLength(0);
  });

  it("an existing value with the identical label is a silent no-op skip", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      picklists: [{ key: "lead_status", label: "Lead Status", options: [{ value: "New", label: "New" }] }],
    };
    const snapshot = snapshotWith({ picklists: new Map([["lead_status", { id: "pl1", options: new Map([["New", "New"]]) }]]) });
    const diff = planPack(pack, snapshot);
    expect(diff.creates).toHaveLength(0);
    expect(diff.updates).toHaveLength(0);
    expect(diff.conflicts).toHaveLength(0);
  });

  it("an existing value with a different label is a conflict (tenant's label wins)", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      picklists: [{ key: "lead_status", label: "Lead Status", options: [{ value: "New", label: "Brand New" }] }],
    };
    const snapshot = snapshotWith({ picklists: new Map([["lead_status", { id: "pl1", options: new Map([["New", "New"]]) }]]) });
    const diff = planPack(pack, snapshot);
    expect(diff.creates).toHaveLength(0);
    expect(diff.conflicts).toEqual([{ kind: "option", summary: expect.stringContaining("New") }]);
  });

  it("value with no explicit label defaults the comparison to the value itself", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      picklists: [{ key: "lead_status", label: "Lead Status", options: [{ value: "New" }] }],
    };
    // stored label also equals the value "New" — should be a no-op skip, not a conflict.
    const snapshot = snapshotWith({ picklists: new Map([["lead_status", { id: "pl1", options: new Map([["New", "New"]]) }]]) });
    const diff = planPack(pack, snapshot);
    expect(diff.creates).toHaveLength(0);
    expect(diff.conflicts).toHaveLength(0);
  });
});

// ── planPack: fields ─────────────────────────────────────────────────────

describe("planPack — fields", () => {
  it("a field with no existing (module,label) match and no picklistKey creates", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      fields: [{ module: "leads", label: "Machine Type", type: "text" }],
    };
    const diff = planPack(pack, emptySnapshot());
    expect(diff.creates).toEqual([{ kind: "field", summary: expect.stringContaining("Machine Type") }]);
  });

  it("an existing (module,label) match is a conflict, case-insensitively", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      fields: [{ module: "leads", label: "machine type", type: "text" }],
    };
    const snapshot = snapshotWith({ fields: new Set(["leads::machine type"]) });
    const diff = planPack(pack, snapshot);
    expect(diff.creates).toHaveLength(0);
    expect(diff.conflicts).toEqual([{ kind: "field", summary: expect.stringContaining("machine type") }]);
  });

  it("a picklistKey resolving to an existing tenant picklist creates fine", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      fields: [{ module: "leads", label: "Status", type: "picklist", picklistKey: "lead_status" }],
    };
    const snapshot = snapshotWith({ picklists: new Map([["lead_status", { id: "pl1", options: new Map() }]]) });
    const diff = planPack(pack, snapshot);
    expect(diff.creates).toEqual([{ kind: "field", summary: expect.stringContaining("Status") }]);
    expect(diff.conflicts).toHaveLength(0);
  });

  it("a picklistKey resolving to a picklist defined earlier in the SAME pack creates fine", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      picklists: [{ key: "budget_range", label: "Budget Range", options: [{ value: "<50L" }] }],
      fields: [{ module: "leads", label: "Budget Range", type: "picklist", picklistKey: "budget_range" }],
    };
    const diff = planPack(pack, emptySnapshot());
    const fieldItems = diff.creates.filter((c) => c.kind === "field");
    expect(fieldItems).toHaveLength(1);
    expect(diff.conflicts).toHaveLength(0);
  });

  it("a picklistKey that resolves nowhere is a conflict, not a create", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      fields: [{ module: "leads", label: "Status", type: "picklist", picklistKey: "nonexistent_key" }],
    };
    const diff = planPack(pack, emptySnapshot());
    expect(diff.creates).toHaveLength(0);
    expect(diff.conflicts).toEqual([{ kind: "field", summary: expect.stringContaining("nonexistent_key") }]);
  });

  it("field-exists conflict takes precedence over an unresolvable picklistKey", () => {
    const pack: StudioPack = {
      key: "p",
      name: "P",
      industry: "x",
      description: "d",
      fields: [{ module: "leads", label: "Status", type: "picklist", picklistKey: "nonexistent_key" }],
    };
    const snapshot = snapshotWith({ fields: new Set(["leads::status"]) });
    const diff = planPack(pack, snapshot);
    expect(diff.conflicts).toHaveLength(1);
    expect(diff.conflicts[0].summary).toContain("already exists");
  });
});

// ── planPack: a realistic mixed pack ────────────────────────────────────

describe("planPack — mixed pack against a partially-configured tenant", () => {
  it("classifies every kind correctly in one pass", () => {
    const pack: StudioPack = {
      key: "mix",
      name: "Mix",
      industry: "x",
      description: "d",
      modules: [
        { module: "tickets", labelSingular: "Job", labelPlural: "Jobs" }, // known -> update
        { module: "warehouses", labelSingular: "Warehouse" }, // unknown -> conflict
      ],
      picklists: [
        { key: "ticket_type", label: "Ticket Type", options: [{ value: "Installation" }] }, // new key -> create picklist + create option
        { key: "lead_status", label: "Lead Status", options: [{ value: "New" }, { value: "Escalated" }] }, // existing key -> New skips, Escalated creates
      ],
      fields: [
        { module: "leads", label: "Machine Type", type: "text" }, // create
        { module: "leads", label: "Existing Field", type: "text" }, // conflict
        { module: "tickets", label: "Serial", type: "picklist", picklistKey: "ticket_type" }, // resolves via same-pack picklist -> create
      ],
    };
    const snapshot = snapshotWith({
      modules: new Map([["tickets", { labelSingular: "Ticket", labelPlural: "Tickets" }]]),
      picklists: new Map([["lead_status", { id: "pl1", options: new Map([["New", "New"]]) }]]),
      fields: new Set(["leads::existing field"]),
    });

    const diff = planPack(pack, snapshot);

    expect(diff.updates.filter((u) => u.kind === "module")).toHaveLength(1);
    expect(diff.conflicts.filter((c) => c.kind === "module")).toHaveLength(1);
    expect(diff.creates.filter((c) => c.kind === "picklist")).toHaveLength(1);
    // options: Installation (new key) + Escalated (new value in existing key) = 2 creates; New = skip
    expect(diff.creates.filter((c) => c.kind === "option")).toHaveLength(2);
    expect(diff.creates.filter((c) => c.kind === "field")).toHaveLength(2); // Machine Type + Serial
    expect(diff.conflicts.filter((c) => c.kind === "field")).toHaveLength(1); // Existing Field
  });
});

// ── Pack JSON schema sanity (all 5 built-ins) ───────────────────────────

describe("listPacks — built-in pack schema sanity", () => {
  const packs = listPacks();

  it("loads exactly 5 packs with unique keys", () => {
    expect(packs).toHaveLength(5);
    const keys = packs.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every pack has the required top-level string fields", () => {
    for (const p of packs) {
      expect(typeof p.key).toBe("string");
      expect(p.key.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe("string");
      expect(typeof p.industry).toBe("string");
      expect(typeof p.description).toBe("string");
    }
  });

  it("picklist keys are unique within each pack", () => {
    for (const p of packs) {
      const keys = (p.picklists ?? []).map((pl) => pl.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("every fields[].picklistKey resolves to a picklist in the same pack or a default picklist key", () => {
    const defaultKeys = new Set(DEFAULT_PICKLISTS.map((d) => d.key));
    for (const p of packs) {
      const ownKeys = new Set((p.picklists ?? []).map((pl) => pl.key));
      for (const f of p.fields ?? []) {
        if (!f.picklistKey) continue;
        const resolves = ownKeys.has(f.picklistKey) || defaultKeys.has(f.picklistKey);
        expect(resolves, `${p.key}: field "${f.label}" picklistKey "${f.picklistKey}" must resolve`).toBe(true);
      }
    }
  });

  it("every picklist option category is either null/undefined or a known category", () => {
    for (const p of packs) {
      for (const pl of p.picklists ?? []) {
        for (const o of pl.options) {
          if (o.category === undefined || o.category === null) continue;
          expect(KNOWN_CATEGORIES.has(o.category), `${p.key}/${pl.key}: unknown category "${o.category}"`).toBe(true);
        }
      }
    }
  });

  it("every field type is one of the supported FieldDef types", () => {
    const KNOWN_TYPES = new Set([
      "text",
      "longtext",
      "number",
      "currency",
      "date",
      "datetime",
      "checkbox",
      "picklist",
      "multipicklist",
      "phone",
      "email",
      "url",
      "lookup",
    ]);
    for (const p of packs) {
      for (const f of p.fields ?? []) {
        expect(KNOWN_TYPES.has(f.type), `${p.key}: field "${f.label}" has unknown type "${f.type}"`).toBe(true);
      }
    }
  });

  it("each pack ships 3-6 fields and 1-3 picklists, per the spec", () => {
    for (const p of packs) {
      const fieldCount = (p.fields ?? []).length;
      const picklistCount = (p.picklists ?? []).length;
      expect(fieldCount, `${p.key} field count`).toBeGreaterThanOrEqual(3);
      expect(fieldCount, `${p.key} field count`).toBeLessThanOrEqual(6);
      expect(picklistCount, `${p.key} picklist count`).toBeGreaterThanOrEqual(1);
      expect(picklistCount, `${p.key} picklist count`).toBeLessThanOrEqual(3);
    }
  });

  it("field labels are unique within each pack's module (no duplicate (module,label) pairs)", () => {
    for (const p of packs) {
      const seen = new Set<string>();
      for (const f of p.fields ?? []) {
        const key = `${f.module}::${f.label.toLowerCase()}`;
        expect(seen.has(key), `${p.key}: duplicate field (${f.module}, ${f.label})`).toBe(false);
        seen.add(key);
      }
    }
  });
});
