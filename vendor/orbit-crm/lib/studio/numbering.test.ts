import { describe, expect, it } from "vitest";
import { formatNumber, fyLabel, maxNumericTail, DEFAULT_FORMATS } from "@/lib/studio/numbering";

describe("fyLabel (Indian fiscal year, Apr–Mar)", () => {
  it("Apr onwards belongs to the starting year", () => {
    expect(fyLabel(new Date("2026-04-01"))).toBe("2026-27");
    expect(fyLabel(new Date("2026-12-31"))).toBe("2026-27");
  });
  it("Jan–Mar belongs to the previous starting year", () => {
    expect(fyLabel(new Date("2026-03-31"))).toBe("2025-26");
    expect(fyLabel(new Date("2027-01-15"))).toBe("2026-27");
  });
  it("pads the second year to two digits across a century-ish boundary", () => {
    expect(fyLabel(new Date("2099-06-01"))).toBe("2099-00");
  });
});

describe("formatNumber", () => {
  const d = new Date("2026-07-11");
  it("renders {YYYY} and plain {seq}", () => {
    expect(formatNumber("INV-{YYYY}-{seq}", 613, d)).toBe("INV-2026-613");
  });
  it("renders {FY} and zero-padded {seq:N}", () => {
    expect(formatNumber("QTN-{FY}-{seq:4}", 7, d)).toBe("QTN-2026-27-0007");
  });
  it("does not pad when seq exceeds the pad width", () => {
    expect(formatNumber("T-{seq:3}", 12345, d)).toBe("T-12345");
  });
  it("handles repeated tokens", () => {
    expect(formatNumber("{YYYY}/{YYYY}-{seq}", 1, d)).toBe("2026/2026-1");
  });
  it("all default formats render without leftover tokens", () => {
    for (const f of Object.values(DEFAULT_FORMATS)) {
      const out = formatNumber(f, 42, d);
      expect(out).not.toMatch(/\{|\}/);
    }
  });
});

describe("maxNumericTail (legacy sequence seeding)", () => {
  it("finds the highest trailing number", () => {
    expect(maxNumericTail(["INV-2026-601", "INV-2026-612", "INV-2026-607"])).toBe(612);
  });
  it("ignores non-trailing digits and null/empty", () => {
    expect(maxNumericTail(["RCPT-2026-1004", null, undefined, "no-digits", ""])).toBe(1004);
  });
  it("returns 0 when nothing matches — allocator then starts at 1", () => {
    expect(maxNumericTail([])).toBe(0);
    expect(maxNumericTail(["abc", "x-y"])).toBe(0);
  });
  it("seeding above the legacy max prevents re-issuing INV-2026-6xx", () => {
    const legacy = ["INV-2026-600", "INV-2026-601", "INV-2026-612"];
    const seed = maxNumericTail(legacy) + 1;
    expect(seed).toBe(613);
    expect(formatNumber("INV-{YYYY}-{seq}", seed, new Date("2026-07-11"))).toBe("INV-2026-613");
  });
});
