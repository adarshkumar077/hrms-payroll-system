import { describe, it, expect } from "vitest";
import {
  hashConnectorKey,
  secureCompare,
  decideConnectorAuth,
  mergeMeta,
  pushErrorRing,
} from "@/lib/connector";

describe("connector", () => {
  describe("hashConnectorKey", () => {
    it("returns a 64-char lowercase hex sha256 digest", () => {
      const h = hashConnectorKey("some-token");
      expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for the same input", () => {
      expect(hashConnectorKey("abc")).toBe(hashConnectorKey("abc"));
    });

    it("differs for different inputs", () => {
      expect(hashConnectorKey("abc")).not.toBe(hashConnectorKey("abd"));
    });
  });

  describe("secureCompare", () => {
    it("returns true for equal hex strings", () => {
      const h = hashConnectorKey("token-1");
      expect(secureCompare(h, h)).toBe(true);
    });

    it("returns false for different hex strings of equal length", () => {
      const a = hashConnectorKey("token-1");
      const b = hashConnectorKey("token-2");
      expect(secureCompare(a, b)).toBe(false);
    });

    it("returns false (not throws) for mismatched lengths", () => {
      expect(secureCompare("ab", "abcd")).toBe(false);
    });

    it("returns false for two empty strings", () => {
      expect(secureCompare("", "")).toBe(false);
    });
  });

  describe("decideConnectorAuth — decision table", () => {
    const tenantId = "tenant-1";
    const key = "correct-horse-battery-staple";
    const keyHash = hashConnectorKey(key);

    it("no ConnectorState anywhere → 503, regardless of key", () => {
      expect(decideConnectorAuth(key, false, null)).toEqual({ ok: false, status: 503 });
      expect(decideConnectorAuth(null, false, null)).toEqual({ ok: false, status: 503 });
    });

    it("state exists, missing header → 401", () => {
      expect(decideConnectorAuth(null, true, null)).toEqual({ ok: false, status: 401 });
      expect(decideConnectorAuth(undefined, true, { tenantId, keyHash })).toEqual({ ok: false, status: 401 });
    });

    it("state exists, no matching row found → 401", () => {
      expect(decideConnectorAuth(key, true, null)).toEqual({ ok: false, status: 401 });
    });

    it("state exists, wrong key (matched row's hash differs from presented) → 401", () => {
      const wrongHash = hashConnectorKey("a-different-key");
      expect(decideConnectorAuth(key, true, { tenantId, keyHash: wrongHash })).toEqual({ ok: false, status: 401 });
    });

    it("state exists, right key → ok with tenantId from the matched row", () => {
      expect(decideConnectorAuth(key, true, { tenantId, keyHash })).toEqual({ ok: true, tenantId });
    });

    it("tenantId always comes from the matched row, never the input", () => {
      const decision = decideConnectorAuth(key, true, { tenantId: "tenant-from-row", keyHash });
      expect(decision).toEqual({ ok: true, tenantId: "tenant-from-row" });
    });

    it("empty-string key is treated as missing → 401", () => {
      expect(decideConnectorAuth("", true, { tenantId, keyHash })).toEqual({ ok: false, status: 401 });
    });
  });

  describe("mergeMeta", () => {
    it("merges a patch into an empty meta blob", () => {
      const next = mergeMeta("{}", { companyName: "Acme" });
      expect(JSON.parse(next)).toEqual({ companyName: "Acme" });
    });

    it("merges into existing keys without dropping unrelated ones", () => {
      const next = mergeMeta(JSON.stringify({ foo: "bar" }), { companyName: "Acme" });
      expect(JSON.parse(next)).toEqual({ foo: "bar", companyName: "Acme" });
    });

    it("overwrites a key that already exists", () => {
      const next = mergeMeta(JSON.stringify({ companyName: "Old" }), { companyName: "New" });
      expect(JSON.parse(next)).toEqual({ companyName: "New" });
    });

    it("tolerates null/undefined/corrupt input as an empty object", () => {
      expect(JSON.parse(mergeMeta(null, { a: 1 }))).toEqual({ a: 1 });
      expect(JSON.parse(mergeMeta(undefined, { a: 1 }))).toEqual({ a: 1 });
      expect(JSON.parse(mergeMeta("not json", { a: 1 }))).toEqual({ a: 1 });
    });
  });

  describe("pushErrorRing", () => {
    it("appends an entry to an empty ring", () => {
      const next = pushErrorRing("{}", { invoiceId: "inv-1", error: "boom", at: "2026-01-01T00:00:00.000Z" });
      const meta = JSON.parse(next);
      expect(meta.lastErrors).toHaveLength(1);
      expect(meta.lastErrors[0]).toEqual({ invoiceId: "inv-1", error: "boom", at: "2026-01-01T00:00:00.000Z" });
    });

    it("preserves other meta keys while appending", () => {
      const next = pushErrorRing(JSON.stringify({ companyName: "Acme" }), {
        invoiceId: "inv-1",
        error: "boom",
        at: "t",
      });
      const meta = JSON.parse(next);
      expect(meta.companyName).toBe("Acme");
      expect(meta.lastErrors).toHaveLength(1);
    });

    it("caps the ring at 20 entries, dropping the oldest", () => {
      let metaJson = "{}";
      for (let i = 0; i < 25; i++) {
        metaJson = pushErrorRing(metaJson, { invoiceId: `inv-${i}`, error: "e", at: String(i) });
      }
      const meta = JSON.parse(metaJson);
      expect(meta.lastErrors).toHaveLength(20);
      expect(meta.lastErrors[0].invoiceId).toBe("inv-5"); // oldest 5 dropped
      expect(meta.lastErrors[19].invoiceId).toBe("inv-24");
    });

    it("respects a custom cap", () => {
      let metaJson = "{}";
      for (let i = 0; i < 5; i++) {
        metaJson = pushErrorRing(metaJson, { invoiceId: `inv-${i}`, error: "e", at: String(i) }, 3);
      }
      const meta = JSON.parse(metaJson);
      expect(meta.lastErrors).toHaveLength(3);
      expect(meta.lastErrors.map((e: any) => e.invoiceId)).toEqual(["inv-2", "inv-3", "inv-4"]);
    });

    it("tolerates corrupt/missing meta as an empty ring before appending", () => {
      const next = pushErrorRing("garbage", { invoiceId: "inv-1", error: "boom", at: "t" });
      expect(JSON.parse(next).lastErrors).toHaveLength(1);
    });
  });
});
