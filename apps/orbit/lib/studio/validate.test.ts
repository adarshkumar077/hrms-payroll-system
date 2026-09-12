import { describe, expect, it } from "vitest";
import {
  parseCustom,
  validateCustom,
  withinFieldCap,
  makeFieldCode,
  type FieldDefLite,
} from "@/lib/studio/validate";

function def(overrides: Partial<FieldDefLite> & { code: string; type: string }): FieldDefLite {
  return {
    label: overrides.label ?? overrides.code,
    system: false,
    required: false,
    archived: false,
    picklistId: null,
    lookupModule: null,
    ...overrides,
  };
}

describe("parseCustom", () => {
  it("returns {} for null/undefined/empty", () => {
    expect(parseCustom(null)).toEqual({});
    expect(parseCustom(undefined)).toEqual({});
    expect(parseCustom("")).toEqual({});
  });
  it("parses a valid JSON object string", () => {
    expect(parseCustom('{"c_foo":"bar"}')).toEqual({ c_foo: "bar" });
  });
  it("returns {} on corrupt JSON", () => {
    expect(parseCustom("{not json")).toEqual({});
  });
  it("returns {} when the JSON is an array or scalar, not an object", () => {
    expect(parseCustom("[1,2,3]")).toEqual({});
    expect(parseCustom("42")).toEqual({});
  });
});

describe("validateCustom — key handling", () => {
  it("drops unknown keys silently", () => {
    const { values, issues } = validateCustom({ c_ghost: "x" }, []);
    expect(values).toEqual({});
    expect(issues).toEqual([]);
  });

  it("ignores system-flagged defs entirely", () => {
    const defs = [def({ code: "c_name", type: "text", system: true })];
    const { values, issues } = validateCustom({ c_name: "hello" }, defs);
    expect(values).toEqual({});
    expect(issues).toEqual([]);
  });

  it("archived field: submitted value dropped, existing value preserved", () => {
    const defs = [def({ code: "c_old", type: "text", archived: true })];
    const { values, issues } = validateCustom(
      { c_old: "new value" },
      defs,
      { existingValues: { c_old: "kept" } }
    );
    expect(values).toEqual({ c_old: "kept" });
    expect(issues).toEqual([]);
  });

  it("archived field with no existing value contributes nothing", () => {
    const defs = [def({ code: "c_old", type: "text", archived: true })];
    const { values } = validateCustom({ c_old: "new" }, defs, {});
    expect(values).toEqual({});
  });

  it("required + missing → issue", () => {
    const defs = [def({ code: "c_req", type: "text", label: "Required Field", required: true })];
    const { values, issues } = validateCustom({}, defs);
    expect(values).toEqual({});
    expect(issues).toEqual([{ code: "c_req", message: "Required Field is required" }]);
  });

  it("required + empty string submitted → issue", () => {
    const defs = [def({ code: "c_req", type: "text", required: true })];
    const { issues } = validateCustom({ c_req: "" }, defs);
    expect(issues).toHaveLength(1);
  });

  it("required + omitted but existingValues has non-empty value → keeps existing (partial update)", () => {
    const defs = [def({ code: "c_req", type: "text", required: true })];
    const { values, issues } = validateCustom({}, defs, { existingValues: { c_req: "already set" } });
    expect(values).toEqual({ c_req: "already set" });
    expect(issues).toEqual([]);
  });

  it("required + explicitly cleared (empty string) even with existing value → issue, not silently kept", () => {
    const defs = [def({ code: "c_req", type: "text", required: true })];
    const { values, issues } = validateCustom({ c_req: "" }, defs, { existingValues: { c_req: "already set" } });
    expect(values).toEqual({});
    expect(issues).toHaveLength(1);
  });

  it("non-required + empty/missing → key omitted from result, no issue", () => {
    const defs = [def({ code: "c_opt", type: "text" })];
    expect(validateCustom({}, defs).values).toEqual({});
    expect(validateCustom({ c_opt: "" }, defs).values).toEqual({});
    expect(validateCustom({ c_opt: null }, defs).values).toEqual({});
    expect(validateCustom({ c_opt: undefined }, defs).values).toEqual({});
  });

  it("submitted value overrides existing when both present", () => {
    const defs = [def({ code: "c_x", type: "text" })];
    const { values } = validateCustom({ c_x: "new" }, defs, { existingValues: { c_x: "old" } });
    expect(values).toEqual({ c_x: "new" });
  });
});

describe("validateCustom — text/longtext", () => {
  it("trims and stores a valid text value", () => {
    const defs = [def({ code: "c_t", type: "text" })];
    expect(validateCustom({ c_t: "  hello  " }, defs).values).toEqual({ c_t: "hello" });
  });
  it("rejects text over 500 chars", () => {
    const defs = [def({ code: "c_t", type: "text", label: "Text" })];
    const { issues } = validateCustom({ c_t: "a".repeat(501) }, defs);
    expect(issues).toEqual([{ code: "c_t", message: "Text exceeds maximum length of 500 characters" }]);
  });
  it("accepts text at exactly 500 chars", () => {
    const defs = [def({ code: "c_t", type: "text" })];
    expect(validateCustom({ c_t: "a".repeat(500) }, defs).issues).toEqual([]);
  });
  it("rejects longtext over 5000 chars, accepts under", () => {
    const defs = [def({ code: "c_lt", type: "longtext" })];
    expect(validateCustom({ c_lt: "a".repeat(5001) }, defs).issues).toHaveLength(1);
    expect(validateCustom({ c_lt: "a".repeat(5000) }, defs).issues).toEqual([]);
  });
});

describe("validateCustom — number/currency", () => {
  it("coerces numeric strings", () => {
    const defs = [def({ code: "c_n", type: "number" })];
    expect(validateCustom({ c_n: "42" }, defs).values).toEqual({ c_n: 42 });
  });
  it("rejects NaN and Infinity", () => {
    const defs = [def({ code: "c_n", type: "number", label: "Num" })];
    expect(validateCustom({ c_n: "not a number" }, defs).issues).toEqual([
      { code: "c_n", message: "Num must be a valid number" },
    ]);
    expect(validateCustom({ c_n: Infinity }, defs).issues).toHaveLength(1);
  });
  it("currency rounds to 2 decimal places", () => {
    const defs = [def({ code: "c_c", type: "currency" })];
    expect(validateCustom({ c_c: 19.999 }, defs).values).toEqual({ c_c: 20 });
    expect(validateCustom({ c_c: "10.005" }, defs).values.c_c).toBeCloseTo(10.01, 2);
  });
});

describe("validateCustom — date/datetime", () => {
  it("stores date as YYYY-MM-DD", () => {
    const defs = [def({ code: "c_d", type: "date" })];
    expect(validateCustom({ c_d: "2026-07-11" }, defs).values).toEqual({ c_d: "2026-07-11" });
  });
  it("stores datetime as full ISO string", () => {
    const defs = [def({ code: "c_dt", type: "datetime" })];
    const { values } = validateCustom({ c_dt: "2026-07-11T10:00:00Z" }, defs);
    expect(values.c_dt).toBe(new Date("2026-07-11T10:00:00Z").toISOString());
  });
  it("rejects unparseable dates", () => {
    const defs = [def({ code: "c_d", type: "date", label: "Date" })];
    expect(validateCustom({ c_d: "not-a-date" }, defs).issues).toEqual([
      { code: "c_d", message: "Date is not a valid date" },
    ]);
  });
});

describe("validateCustom — checkbox", () => {
  const defs = [def({ code: "c_ok", type: "checkbox" })];
  it.each([
    [true, true],
    [false, false],
    ["on", true],
    ["true", true],
    ["false", false],
  ])("coerces %p → %p", (input, expected) => {
    expect(validateCustom({ c_ok: input }, defs).values).toEqual({ c_ok: expected });
  });
  it('empty string coerces to false and is stored (not omitted)', () => {
    expect(validateCustom({ c_ok: "" }, defs).values).toEqual({ c_ok: false });
  });
  it("omitted entirely and no existing value → key absent from result", () => {
    expect(validateCustom({}, defs).values).toEqual({});
  });
  it("never raises a required issue even when required:true and false", () => {
    const reqDefs = [def({ code: "c_ok", type: "checkbox", required: true })];
    const { values, issues } = validateCustom({ c_ok: false }, reqDefs);
    expect(values).toEqual({ c_ok: false });
    expect(issues).toEqual([]);
  });
  it("falls back to existing value when omitted from submission", () => {
    const { values } = validateCustom({}, defs, { existingValues: { c_ok: true } });
    expect(values).toEqual({ c_ok: true });
  });
});

describe("validateCustom — picklist", () => {
  const defs = [def({ code: "c_pl", type: "picklist", picklistId: "lead_source", label: "Source" })];
  it("accepts a value present in allowed options", () => {
    const { values, issues } = validateCustom(
      { c_pl: "referral" },
      defs,
      { picklistValues: { lead_source: ["referral", "web"] } }
    );
    expect(values).toEqual({ c_pl: "referral" });
    expect(issues).toEqual([]);
  });
  it("rejects a value not in allowed options", () => {
    const { issues } = validateCustom(
      { c_pl: "bogus" },
      defs,
      { picklistValues: { lead_source: ["referral", "web"] } }
    );
    expect(issues).toEqual([{ code: "c_pl", message: "Source value is not a valid option" }]);
  });
  it("skips membership check when no picklistValues supplied for that id", () => {
    const { values, issues } = validateCustom({ c_pl: "anything" }, defs, {});
    expect(values).toEqual({ c_pl: "anything" });
    expect(issues).toEqual([]);
  });
});

describe("validateCustom — multipicklist", () => {
  const defs = [def({ code: "c_mp", type: "multipicklist", picklistId: "tags", label: "Tags" })];
  it("accepts an array of valid values", () => {
    const { values } = validateCustom(
      { c_mp: ["vip", "priority"] },
      defs,
      { picklistValues: { tags: ["vip", "priority", "other"] } }
    );
    expect(values).toEqual({ c_mp: ["vip", "priority"] });
  });
  it("wraps a single string into an array", () => {
    const { values } = validateCustom(
      { c_mp: "vip" },
      defs,
      { picklistValues: { tags: ["vip"] } }
    );
    expect(values).toEqual({ c_mp: ["vip"] });
  });
  it("rejects when any member is not an allowed option", () => {
    const { issues } = validateCustom(
      { c_mp: ["vip", "bogus"] },
      defs,
      { picklistValues: { tags: ["vip"] } }
    );
    expect(issues).toEqual([{ code: "c_mp", message: "Tags has invalid option(s): bogus" }]);
  });
  it("empty array on non-required field → omitted", () => {
    const { values, issues } = validateCustom({ c_mp: [] }, defs, {});
    expect(values).toEqual({});
    expect(issues).toEqual([]);
  });
});

describe("validateCustom — phone", () => {
  const defs = [def({ code: "c_ph", type: "phone", label: "Phone" })];
  it("strips spaces and dashes from a valid number", () => {
    expect(validateCustom({ c_ph: "+91 98765-43210" }, defs).values).toEqual({ c_ph: "+919876543210" });
  });
  it("rejects too-short / non-numeric input", () => {
    expect(validateCustom({ c_ph: "123" }, defs).issues).toEqual([
      { code: "c_ph", message: "Phone is not a valid phone number" },
    ]);
    expect(validateCustom({ c_ph: "call-me-maybe" }, defs).issues).toHaveLength(1);
  });
});

describe("validateCustom — email", () => {
  const defs = [def({ code: "c_em", type: "email", label: "Email" })];
  it("accepts a plausible email", () => {
    expect(validateCustom({ c_em: "a@b.com" }, defs).values).toEqual({ c_em: "a@b.com" });
  });
  it("rejects a string with no @ or no dot", () => {
    expect(validateCustom({ c_em: "not-an-email" }, defs).issues).toEqual([
      { code: "c_em", message: "Email is not a valid email address" },
    ]);
    expect(validateCustom({ c_em: "a@b" }, defs).issues).toHaveLength(1);
  });
});

describe("validateCustom — url", () => {
  const defs = [def({ code: "c_url", type: "url", label: "Website" })];
  it("accepts a fully-qualified URL", () => {
    expect(validateCustom({ c_url: "https://example.com" }, defs).values).toEqual({
      c_url: "https://example.com",
    });
  });
  it("auto-prefixes https:// when scheme is missing", () => {
    expect(validateCustom({ c_url: "example.com" }, defs).values).toEqual({
      c_url: "https://example.com",
    });
  });
  it("rejects unparseable input", () => {
    expect(validateCustom({ c_url: "http://" }, defs).issues).toEqual([
      { code: "c_url", message: "Website is not a valid URL" },
    ]);
  });
});

describe("validateCustom — lookup", () => {
  const defs = [def({ code: "c_lk", type: "lookup", lookupModule: "contacts", label: "Contact" })];
  it("accepts a non-empty string id (existence is caller's job)", () => {
    expect(validateCustom({ c_lk: "contact_123" }, defs).values).toEqual({ c_lk: "contact_123" });
  });
  it("empty string on non-required lookup → omitted, no issue", () => {
    const { values, issues } = validateCustom({ c_lk: "" }, defs);
    expect(values).toEqual({});
    expect(issues).toEqual([]);
  });
});

describe("withinFieldCap", () => {
  it("true when below the default cap of 50", () => {
    expect(withinFieldCap(49)).toBe(true);
  });
  it("false when at or above the default cap", () => {
    expect(withinFieldCap(50)).toBe(false);
    expect(withinFieldCap(51)).toBe(false);
  });
  it("respects a custom cap", () => {
    expect(withinFieldCap(4, 5)).toBe(true);
    expect(withinFieldCap(5, 5)).toBe(false);
  });
});

describe("makeFieldCode", () => {
  it("lowercases and snake_cases a normal label", () => {
    expect(makeFieldCode("Vehicle Number", new Set())).toBe("c_vehicle_number");
  });
  it("strips trailing punctuation", () => {
    expect(makeFieldCode("Vehicle Number!", new Set())).toBe("c_vehicle_number");
  });
  it("collapses runs of non [a-z0-9] into a single underscore", () => {
    expect(makeFieldCode("GST/PAN  No.", new Set())).toBe("c_gst_pan_no");
  });
  it("falls back to c_field for a blank/whitespace-only label", () => {
    expect(makeFieldCode("  ", new Set())).toBe("c_field");
  });
  it("falls back to c_field for a non-Latin-script label", () => {
    expect(makeFieldCode("वाहन क्रमांक", new Set())).toBe("c_field");
  });
  it("strips accents to plain Latin letters", () => {
    expect(makeFieldCode("Café Name", new Set())).toBe("c_cafe_name");
  });
  it("suffixes on collision: c_foo, c_foo_2, c_foo_3", () => {
    const taken = new Set<string>();
    const first = makeFieldCode("Foo", taken);
    taken.add(first);
    const second = makeFieldCode("Foo", taken);
    taken.add(second);
    const third = makeFieldCode("Foo", taken);
    expect([first, second, third]).toEqual(["c_foo", "c_foo_2", "c_foo_3"]);
  });
  it("two independent blank labels collide into c_field, c_field_2", () => {
    const taken = new Set<string>();
    const a = makeFieldCode("!!!", taken);
    taken.add(a);
    const b = makeFieldCode("???", taken);
    expect(a).toBe("c_field");
    expect(b).toBe("c_field_2");
  });
});
