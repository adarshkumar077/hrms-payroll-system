import { describe, it, expect } from "vitest";
import { endOfToday, isInMyDay, isOverdueActivity } from "./myDay";

describe("activities myDay", () => {
  const noon = new Date("2026-07-12T12:00:00.000");

  describe("endOfToday", () => {
    it("returns 23:59:59.999 on the same calendar day", () => {
      const end = endOfToday(noon);
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(6); // July (0-indexed)
      expect(end.getDate()).toBe(12);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
      expect(end.getMilliseconds()).toBe(999);
    });
  });

  describe("isInMyDay", () => {
    it("is false for a null/undefined due date", () => {
      expect(isInMyDay(null, noon)).toBe(false);
      expect(isInMyDay(undefined, noon)).toBe(false);
    });

    it("is true for a due date earlier today", () => {
      expect(isInMyDay(new Date("2026-07-12T08:00:00.000"), noon)).toBe(true);
    });

    it("is true for a due date later today (still within the day)", () => {
      expect(isInMyDay(new Date("2026-07-12T23:00:00.000"), noon)).toBe(true);
    });

    it("is true for a due date from a past day (overdue but still My Day)", () => {
      expect(isInMyDay(new Date("2026-07-01T09:00:00.000"), noon)).toBe(true);
    });

    it("is false for a due date tomorrow or later", () => {
      expect(isInMyDay(new Date("2026-07-13T00:00:00.000"), noon)).toBe(false);
    });

    it("is false for an unparseable date string", () => {
      expect(isInMyDay("not-a-date", noon)).toBe(false);
    });
  });

  describe("isOverdueActivity", () => {
    it("is false for a null due date", () => {
      expect(isOverdueActivity(null, noon)).toBe(false);
    });

    it("is true for a due date strictly before now", () => {
      expect(isOverdueActivity(new Date("2026-07-12T08:00:00.000"), noon)).toBe(true);
    });

    it("is false for a due date after now", () => {
      expect(isOverdueActivity(new Date("2026-07-12T18:00:00.000"), noon)).toBe(false);
    });

    it("is false for a due date exactly equal to now", () => {
      expect(isOverdueActivity(noon, noon)).toBe(false);
    });
  });
});
