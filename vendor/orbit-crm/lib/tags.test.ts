import { describe, it, expect } from "vitest";
import { nextTagColor, badgeToneForTagColor, normalizeTagName, TAG_COLOR_CYCLE } from "@/lib/tags";

describe("tags", () => {
  describe("nextTagColor", () => {
    it("returns the first color for a tenant's first tag", () => {
      expect(nextTagColor(0)).toBe(TAG_COLOR_CYCLE[0]);
    });

    it("cycles through every color in order", () => {
      for (let i = 0; i < TAG_COLOR_CYCLE.length; i++) {
        expect(nextTagColor(i)).toBe(TAG_COLOR_CYCLE[i]);
      }
    });

    it("wraps around after the cycle length", () => {
      expect(nextTagColor(TAG_COLOR_CYCLE.length)).toBe(TAG_COLOR_CYCLE[0]);
      expect(nextTagColor(TAG_COLOR_CYCLE.length + 2)).toBe(TAG_COLOR_CYCLE[2]);
    });

    it("only ever returns a valid Badge tone name", () => {
      for (let i = 0; i < 20; i++) {
        expect(TAG_COLOR_CYCLE).toContain(nextTagColor(i));
      }
    });

    it("is deterministic for a given count", () => {
      expect(nextTagColor(5)).toBe(nextTagColor(5));
    });
  });

  describe("badgeToneForTagColor", () => {
    it("aliases the schema default 'gray' to 'slate'", () => {
      expect(badgeToneForTagColor("gray")).toBe("slate");
    });

    it("passes through already-valid Badge tones unchanged", () => {
      expect(badgeToneForTagColor("blue")).toBe("blue");
      expect(badgeToneForTagColor("green")).toBe("green");
      expect(badgeToneForTagColor("brand")).toBe("brand");
    });
  });

  describe("normalizeTagName", () => {
    it("trims and lowercases", () => {
      expect(normalizeTagName("  VIP Customer  ")).toBe("vip customer");
    });

    it("truncates to 30 characters", () => {
      const long = "a".repeat(50);
      expect(normalizeTagName(long)).toHaveLength(30);
      expect(normalizeTagName(long)).toBe("a".repeat(30));
    });

    it("returns empty string for whitespace-only input", () => {
      expect(normalizeTagName("   ")).toBe("");
    });
  });
});
