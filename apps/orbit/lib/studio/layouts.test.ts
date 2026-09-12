import { describe, expect, it } from "vitest";
import { parseLayoutSpec, orderFields } from "@/lib/studio/layouts";

describe("parseLayoutSpec", () => {
  it("returns {fields: []} for null/undefined", () => {
    expect(parseLayoutSpec(null)).toEqual({ fields: [] });
    expect(parseLayoutSpec(undefined)).toEqual({ fields: [] });
  });

  it("returns {fields: []} for an empty string", () => {
    expect(parseLayoutSpec("")).toEqual({ fields: [] });
  });

  it("returns {fields: []} for corrupt JSON", () => {
    expect(parseLayoutSpec("{not valid json")).toEqual({ fields: [] });
  });

  it("returns {fields: []} when the shape has no fields array", () => {
    expect(parseLayoutSpec('{"a":1}')).toEqual({ fields: [] });
    expect(parseLayoutSpec('{"fields":"nope"}')).toEqual({ fields: [] });
  });

  it("parses a well-formed spec", () => {
    expect(parseLayoutSpec('{"fields":[{"code":"name"},{"code":"email","hidden":true}]}')).toEqual({
      fields: [{ code: "name" }, { code: "email", hidden: true }],
    });
  });

  it("drops entries with a missing or non-string code", () => {
    expect(parseLayoutSpec('{"fields":[{"code":"name"},{"nope":1},{"code":5}]}')).toEqual({
      fields: [{ code: "name" }],
    });
  });

  it("trims whitespace-only or blank codes", () => {
    expect(parseLayoutSpec('{"fields":[{"code":"  "},{"code":"name"}]}')).toEqual({
      fields: [{ code: "name" }],
    });
  });

  it("drops unknown extra keys but keeps code/hidden", () => {
    expect(parseLayoutSpec('{"fields":[{"code":"name","junk":"x","hidden":false}]}')).toEqual({
      fields: [{ code: "name" }],
    });
  });
});

describe("orderFields", () => {
  type F = { code: string; label: string };
  const available: F[] = [
    { code: "name", label: "Name" },
    { code: "email", label: "Email" },
    { code: "phone", label: "Phone" },
  ];

  it("returns available fields unchanged order when spec is empty", () => {
    expect(orderFields(available, { fields: [] })).toEqual(available);
  });

  it("reorders per spec order", () => {
    const result = orderFields(available, { fields: [{ code: "phone" }, { code: "name" }, { code: "email" }] });
    expect(result.map((f) => f.code)).toEqual(["phone", "name", "email"]);
  });

  it("removes hidden fields entirely", () => {
    const result = orderFields(available, { fields: [{ code: "name" }, { code: "email", hidden: true }, { code: "phone" }] });
    expect(result.map((f) => f.code)).toEqual(["name", "phone"]);
  });

  it("skips unknown codes in the spec without erroring", () => {
    const result = orderFields(available, { fields: [{ code: "ghost" }, { code: "name" }] });
    expect(result.map((f) => f.code)).toEqual(["name", "email", "phone"]);
  });

  it("appends available fields not mentioned in the spec, in their original order", () => {
    const result = orderFields(available, { fields: [{ code: "phone" }] });
    expect(result.map((f) => f.code)).toEqual(["phone", "name", "email"]);
  });

  it("never silently loses a field that appears in available but not in spec", () => {
    const result = orderFields(available, { fields: [{ code: "email" }] });
    expect(result.map((f) => f.code).sort()).toEqual(["email", "name", "phone"]);
  });

  it("only honors the first occurrence of a duplicated code in the spec", () => {
    const result = orderFields(available, { fields: [{ code: "name" }, { code: "name", hidden: true }] });
    expect(result.map((f) => f.code)).toEqual(["name", "email", "phone"]);
  });

  it("a code hidden then repeated visible later stays hidden (first entry wins)", () => {
    const result = orderFields(available, { fields: [{ code: "name", hidden: true }, { code: "name" }] });
    expect(result.map((f) => f.code)).toEqual(["email", "phone"]);
  });

  it("returns an empty array when every available field is hidden", () => {
    const result = orderFields(available, {
      fields: [{ code: "name", hidden: true }, { code: "email", hidden: true }, { code: "phone", hidden: true }],
    });
    expect(result).toEqual([]);
  });

  it("handles an empty available list", () => {
    expect(orderFields([], { fields: [{ code: "name" }] })).toEqual([]);
  });
});
