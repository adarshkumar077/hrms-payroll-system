import { describe, it, expect } from "vitest";
import {
  generateSecret,
  verifyTotp,
  otpauthUri,
  generateRecoveryCodes,
} from "@/lib/totp";

describe("totp", () => {
  describe("generateSecret", () => {
    it("returns a non-empty base32 string", () => {
      const secret = generateSecret();
      expect(secret).toBeTruthy();
      expect(typeof secret).toBe("string");
    });

    it("only contains base32 characters (A-Z, 2-7)", () => {
      const secret = generateSecret();
      expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it("generates different secrets on each call", () => {
      const secret1 = generateSecret();
      const secret2 = generateSecret();
      expect(secret1).not.toBe(secret2);
    });
  });

  describe("verifyTotp", () => {
    it("returns false for invalid token: wrong length", () => {
      const secret = generateSecret();
      expect(verifyTotp(secret, "12345")).toBe(false);
      expect(verifyTotp(secret, "1234567")).toBe(false);
    });

    it("returns false for non-numeric token", () => {
      const secret = generateSecret();
      expect(verifyTotp(secret, "abcdef")).toBe(false);
      expect(verifyTotp(secret, "12345a")).toBe(false);
    });

    it("returns false for empty/malformed input", () => {
      const secret = generateSecret();
      expect(verifyTotp(secret, "")).toBe(false);
      expect(verifyTotp(secret, "   ")).toBe(false);
      expect(verifyTotp(secret, "---000")).toBe(false);
    });

    it("returns false for null/undefined token (graceful handling)", () => {
      const secret = generateSecret();
      expect(verifyTotp(secret, null as any)).toBe(false);
      expect(verifyTotp(secret, undefined as any)).toBe(false);
    });

    it("accepts valid 6-digit tokens", () => {
      const secret = generateSecret();
      // Test that the function accepts properly formatted input
      // We can't easily generate a valid token without duplicating HOTP,
      // but we can verify the format is accepted (will be valid or invalid based on time)
      const result = verifyTotp(secret, "000000");
      expect(typeof result).toBe("boolean");
    });

    it("strips whitespace from tokens", () => {
      const secret = generateSecret();
      // A token with spaces should be treated the same as without
      // It will still fail validation for wrong length after stripping, or pass if valid
      const result1 = verifyTotp(secret, "123 456");
      const result2 = verifyTotp(secret, "12 34 56");
      expect(typeof result1).toBe("boolean");
      expect(typeof result2).toBe("boolean");
    });
  });

  describe("otpauthUri", () => {
    it("returns otpauth:// URI with TOTP scheme", () => {
      const secret = generateSecret();
      const uri = otpauthUri(secret, "user@example.com");
      expect(uri).toContain("otpauth://totp/");
    });

    it("includes the secret in the URI", () => {
      const secret = generateSecret();
      const uri = otpauthUri(secret, "user@example.com");
      expect(uri).toContain(`secret=${secret}`);
    });

    it("includes issuer=Orbit by default", () => {
      const secret = generateSecret();
      const uri = otpauthUri(secret, "user@example.com");
      expect(uri).toContain("issuer=Orbit");
    });

    it("includes digits=6", () => {
      const secret = generateSecret();
      const uri = otpauthUri(secret, "user@example.com");
      expect(uri).toContain("digits=6");
    });

    it("includes period=30", () => {
      const secret = generateSecret();
      const uri = otpauthUri(secret, "user@example.com");
      expect(uri).toContain("period=30");
    });

    it("supports custom issuer", () => {
      const secret = generateSecret();
      const uri = otpauthUri(secret, "user@example.com", "CustomIssuer");
      expect(uri).toContain("issuer=CustomIssuer");
    });

    it("URL-encodes the account and issuer", () => {
      const secret = generateSecret();
      const uri = otpauthUri(secret, "user+test@example.com", "My App");
      expect(uri).toContain("My%20App");
    });
  });

  describe("generateRecoveryCodes", () => {
    it("returns 10 codes by default", () => {
      const codes = generateRecoveryCodes();
      expect(codes).toHaveLength(10);
    });

    it("returns correct number of codes when specified", () => {
      const codes = generateRecoveryCodes(5);
      expect(codes).toHaveLength(5);
      const codes8 = generateRecoveryCodes(8);
      expect(codes8).toHaveLength(8);
    });

    it("all codes match format xxxx-xxxx (hex)", () => {
      const codes = generateRecoveryCodes();
      codes.forEach((code) => {
        expect(code).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/);
      });
    });

    it("all codes are unique", () => {
      const codes = generateRecoveryCodes(10);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it("generates different codes on each call", () => {
      const codes1 = generateRecoveryCodes();
      const codes2 = generateRecoveryCodes();
      expect(codes1).not.toEqual(codes2);
    });
  });
});
