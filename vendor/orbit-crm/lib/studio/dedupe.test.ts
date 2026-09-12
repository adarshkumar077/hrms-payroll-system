import { describe, expect, it } from "vitest";
import { parseRuleFields, normalizeValue, allowedDedupeFields, DEDUPE_MODULES } from "@/lib/studio/dedupe";

describe("parseRuleFields (OR-of-AND field groups)", () => {
  it("parses single-field OR groups", () => {
    expect(parseRuleFields('[["email"],["phone"]]')).toEqual([["email"], ["phone"]]);
  });

  it("parses a multi-field AND group", () => {
    expect(parseRuleFields('[["email","phone"]]')).toEqual([["email", "phone"]]);
  });

  it("returns [] for corrupt JSON", () => {
    expect(parseRuleFields("{not valid json")).toEqual([]);
  });

  it("returns [] for JSON that isn't an array", () => {
    expect(parseRuleFields('{"a":1}')).toEqual([]);
  });

  it("returns [] when an inner group isn't itself an array", () => {
    expect(parseRuleFields('["email","phone"]')).toEqual([]);
  });

  it("returns [] for an empty string", () => {
    expect(parseRuleFields("")).toEqual([]);
  });

  it("returns [] for an empty array", () => {
    expect(parseRuleFields("[]")).toEqual([]);
  });

  it("drops empty-string fields but keeps a group that still has one left", () => {
    expect(parseRuleFields('[["email",""]]')).toEqual([["email"]]);
  });

  it("drops a group that becomes entirely empty, keeps the rest", () => {
    expect(parseRuleFields('[[""],["phone"]]')).toEqual([["phone"]]);
  });

  it("ignores non-string entries inside a group", () => {
    expect(parseRuleFields('[["email", 1, null]]')).toEqual([["email"]]);
  });
});

describe("normalizeValue", () => {
  it("phone: strips formatting and keeps the last 10 digits (India)", () => {
    expect(normalizeValue("phone", "+91 98200 12345")).toBe("9820012345");
    expect(normalizeValue("phone", "098200-12345")).toBe("9820012345");
    expect(normalizeValue("phone", "+91 98200 12345")).toBe(normalizeValue("phone", "098200-12345"));
  });

  it("phone: keeps all digits when fewer than 10", () => {
    expect(normalizeValue("phone", "12345")).toBe("12345");
  });

  it("phone: empty/null/undefined → null", () => {
    expect(normalizeValue("phone", "")).toBeNull();
    expect(normalizeValue("phone", "   ")).toBeNull();
    expect(normalizeValue("phone", null)).toBeNull();
    expect(normalizeValue("phone", undefined)).toBeNull();
  });

  it("email: lowercases and trims", () => {
    expect(normalizeValue("email", " Ramesh@Example.COM ")).toBe("ramesh@example.com");
  });

  it("email: empty → null", () => {
    expect(normalizeValue("email", "  ")).toBeNull();
  });

  it("other fields: lowercase + trim like email", () => {
    expect(normalizeValue("company", " Gupta Industries ")).toBe("gupta industries");
    expect(normalizeValue("name", "Priya Nair")).toBe("priya nair");
  });

  it("other fields: empty → null", () => {
    expect(normalizeValue("name", "")).toBeNull();
  });
});

describe("allowedDedupeFields (per-module match-field allow-list)", () => {
  it("leads allows name, company, email, phone", () => {
    expect(allowedDedupeFields("leads")).toEqual(["name", "company", "email", "phone"]);
  });

  it("contacts allows name, email, phone (no company column)", () => {
    expect(allowedDedupeFields("contacts")).toEqual(["name", "email", "phone"]);
  });

  it("returns undefined for a module with no v1 matching implementation", () => {
    expect(allowedDedupeFields("accounts")).toBeUndefined();
    expect(allowedDedupeFields("tickets")).toBeUndefined();
  });

  it("DEDUPE_MODULES lists exactly the modules with an allow-list", () => {
    expect(DEDUPE_MODULES).toEqual(["leads", "contacts"]);
    for (const m of DEDUPE_MODULES) {
      expect(allowedDedupeFields(m)).toBeDefined();
    }
  });
});
