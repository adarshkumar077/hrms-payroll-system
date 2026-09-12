import { describe, expect, it } from "vitest";
import { applyMappings, DEFAULT_CONVERT_MAPS } from "@/lib/studio/convert";

describe("applyMappings (pure field-mapping applicator)", () => {
  it("copies source fields to target keys per the mapping", () => {
    const out = applyMappings(
      [
        { source: "company", target: "name" },
        { source: "phone", target: "phone" },
      ],
      { company: "Acme Pvt Ltd", phone: "9876543210" }
    );
    expect(out).toEqual({ name: "Acme Pvt Ltd", phone: "9876543210" });
  });

  it("skips empty, null, and undefined source values", () => {
    const out = applyMappings(
      [
        { source: "company", target: "name" },
        { source: "phone", target: "phone" },
        { source: "email", target: "email" },
      ],
      { company: "", phone: null, email: undefined }
    );
    expect(out).toEqual({});
  });

  it("skips keys entirely missing from the source record", () => {
    const out = applyMappings([{ source: "fax", target: "fax" }], { name: "Ada" });
    expect(out).toEqual({});
  });

  it("reads custom c_* codes from source.custom JSON instead of a top-level property", () => {
    const out = applyMappings(
      [{ source: "c_vehicle_number", target: "c_vehicle_number" }],
      { name: "Ada", custom: JSON.stringify({ c_vehicle_number: "MH12AB1234" }) }
    );
    expect(out).toEqual({ c_vehicle_number: "MH12AB1234" });
  });

  it("skips a c_* code that is absent from custom JSON, and tolerates malformed custom JSON", () => {
    const out1 = applyMappings([{ source: "c_missing", target: "c_missing" }], { custom: "{}" });
    expect(out1).toEqual({});

    const out2 = applyMappings([{ source: "c_missing", target: "c_missing" }], { custom: "not json" });
    expect(out2).toEqual({});
  });

  it("mixes top-level and custom fields in one mapping list", () => {
    const out = applyMappings(
      [
        { source: "name", target: "name" },
        { source: "c_priority", target: "c_priority" },
      ],
      { name: "Ada", custom: JSON.stringify({ c_priority: "High" }) }
    );
    expect(out).toEqual({ name: "Ada", c_priority: "High" });
  });
});

describe("DEFAULT_CONVERT_MAPS shape", () => {
  it("defines exactly the 3 lead→{account,contact,opportunity} targets, enabled by default", () => {
    expect(DEFAULT_CONVERT_MAPS).toHaveLength(3);
    for (const m of DEFAULT_CONVERT_MAPS) {
      expect(m.sourceModule).toBe("lead");
      expect(m.enabled).toBe(true);
      expect(m.required).toBe(false);
    }
    expect(DEFAULT_CONVERT_MAPS.map((m) => m.targetModule).sort()).toEqual(["account", "contact", "opportunity"]);
  });

  it("account map only references fields that exist on Lead/Account today", () => {
    const account = DEFAULT_CONVERT_MAPS.find((m) => m.targetModule === "account")!;
    expect(account.mappings).toEqual([
      { source: "company", target: "name" },
      { source: "phone", target: "phone" },
      { source: "email", target: "email" },
    ]);
  });

  it("contact map only references fields that exist on Lead/Contact today", () => {
    const contact = DEFAULT_CONVERT_MAPS.find((m) => m.targetModule === "contact")!;
    expect(contact.mappings).toEqual([
      { source: "name", target: "name" },
      { source: "email", target: "email" },
      { source: "phone", target: "phone" },
    ]);
  });

  it("opportunity map has no field mappings — name/amount/stage are computed at convert time", () => {
    const opportunity = DEFAULT_CONVERT_MAPS.find((m) => m.targetModule === "opportunity")!;
    expect(opportunity.mappings).toEqual([]);
  });
});
