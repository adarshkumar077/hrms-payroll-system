import { describe, it, expect } from "vitest";
import { formatElapsed } from "@/lib/tat";

// Anchor "from" — the exact clock value doesn't matter, only the delta to "to".
const BASE = new Date("2026-01-01T00:00:00.000Z");
function plusMs(ms: number): Date {
  return new Date(BASE.getTime() + ms);
}

describe("formatElapsed", () => {
  const cases: { name: string; to: Date; expected: string }[] = [
    { name: "same instant", to: plusMs(0), expected: "0 Minutes" },
    { name: "1 minute", to: plusMs(60_000), expected: "1 Minute" },
    { name: "45 minutes", to: plusMs(45 * 60_000), expected: "45 Minutes" },
    { name: "59 minutes (just under an hour)", to: plusMs(59 * 60_000), expected: "59 Minutes" },
    { name: "exactly 1 hour", to: plusMs(60 * 60_000), expected: "1 Hour" },
    { name: "1.5 hours (minutes dropped once >= 1 hour)", to: plusMs(90 * 60_000), expected: "1 Hour" },
    { name: "23 hours 59 minutes (just under a day)", to: plusMs(23 * 3_600_000 + 59 * 60_000), expected: "23 Hours" },
    { name: "exactly 1 day", to: plusMs(24 * 3_600_000), expected: "1 Day, 0 Hours" },
    { name: "1 day 2 hours", to: plusMs(26 * 3_600_000), expected: "1 Day, 2 Hours" },
    { name: "12 days 2 hours", to: plusMs((12 * 24 + 2) * 3_600_000), expected: "12 Days, 2 Hours" },
    { name: "negative span clamps to zero", to: plusMs(-5000), expected: "0 Minutes" },
  ];

  for (const c of cases) {
    it(`${c.name} → "${c.expected}"`, () => {
      expect(formatElapsed(BASE, c.to)).toBe(c.expected);
    });
  }
});
