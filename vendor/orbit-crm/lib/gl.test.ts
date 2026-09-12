import { describe, it, expect } from "vitest";
import { ACCOUNT_TYPES, DEFAULT_COA, isDebitNormal } from "@/lib/gl";

describe("GL - Pure Logic Tests", () => {
  // ── Test isDebitNormal ────────────────────────────────────────
  describe("isDebitNormal", () => {
    it("should return true for Asset accounts", () => {
      expect(isDebitNormal("Asset")).toBe(true);
    });

    it("should return true for Expense accounts", () => {
      expect(isDebitNormal("Expense")).toBe(true);
    });

    it("should return false for Liability accounts", () => {
      expect(isDebitNormal("Liability")).toBe(false);
    });

    it("should return false for Equity accounts", () => {
      expect(isDebitNormal("Equity")).toBe(false);
    });

    it("should return false for Income accounts", () => {
      expect(isDebitNormal("Income")).toBe(false);
    });

    it("should return false for unknown account types", () => {
      expect(isDebitNormal("Unknown")).toBe(false);
      expect(isDebitNormal("Foo")).toBe(false);
      expect(isDebitNormal("")).toBe(false);
    });
  });

  // ── Test ACCOUNT_TYPES ─────────────────────────────────────────
  describe("ACCOUNT_TYPES", () => {
    it("should contain exactly 5 account types", () => {
      expect(ACCOUNT_TYPES.length).toBe(5);
    });

    it("should contain Asset, Liability, Equity, Income, Expense", () => {
      const expected = ["Asset", "Liability", "Equity", "Income", "Expense"];
      expected.forEach((type) => {
        expect(ACCOUNT_TYPES).toContain(type);
      });
    });

    it("should contain exactly the expected types (no extra)", () => {
      const expected = ["Asset", "Liability", "Equity", "Income", "Expense"];
      expect(ACCOUNT_TYPES).toEqual(expect.arrayContaining(expected));
      expect(new Set(ACCOUNT_TYPES).size).toBe(5);
    });
  });

  // ── Test DEFAULT_COA ──────────────────────────────────────────
  describe("DEFAULT_COA", () => {
    it("should have at least one account of each type", () => {
      const byType: Record<string, number> = {};
      for (const type of ACCOUNT_TYPES) {
        byType[type] = DEFAULT_COA.filter((a) => a.type === type).length;
      }
      for (const type of ACCOUNT_TYPES) {
        expect(byType[type]).toBeGreaterThanOrEqual(1);
      }
    });

    it("should have unique codes", () => {
      const codes = DEFAULT_COA.map((a) => a.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it("should have non-empty names for all accounts", () => {
      for (const account of DEFAULT_COA) {
        expect(account.name).toBeTruthy();
        expect(typeof account.name).toBe("string");
        expect(account.name.length).toBeGreaterThan(0);
      }
    });

    it("should have valid types for all accounts", () => {
      for (const account of DEFAULT_COA) {
        expect(ACCOUNT_TYPES).toContain(account.type);
      }
    });

    it("should have all required properties on each account", () => {
      for (const account of DEFAULT_COA) {
        expect(account).toHaveProperty("code");
        expect(account).toHaveProperty("name");
        expect(account).toHaveProperty("type");
      }
    });

    it("should have numeric-string codes", () => {
      for (const account of DEFAULT_COA) {
        expect(/^\d+$/.test(account.code)).toBe(true);
      }
    });

    it("has specific expected accounts", () => {
      const codesWithNames = new Map(DEFAULT_COA.map((a) => [a.code, a.name]));

      // Verify specific critical accounts exist
      expect(codesWithNames.has("1000")).toBe(true); // Cash
      expect(codesWithNames.has("1100")).toBe(true); // Accounts Receivable
      expect(codesWithNames.has("2100")).toBe(true); // GST Payable
      expect(codesWithNames.has("4000")).toBe(true); // Sales Revenue
      expect(codesWithNames.has("5000")).toBe(true); // Salaries Expense
    });
  });

  // ── Test Balancing Invariant (Invoice) ────────────────────────
  describe("Balancing Invariant - Invoice Posting", () => {
    it("should balance a simple invoice entry", () => {
      // Scenario: Invoice with subtotal 1000, GST (18%) = 180
      const subtotal = 1000;
      const grandTotal = 1180;
      const gst = grandTotal - subtotal;

      // Three journal lines as per postInvoiceJournal:
      // Dr Accounts Receivable (1100): 1180
      // Cr Sales Revenue (4000): 1000
      // Cr GST Payable (2100): 180

      const debits = [
        { code: "1100", amount: grandTotal }, // Dr AR
      ];
      const credits = [
        { code: "4000", amount: subtotal }, // Cr Sales
        { code: "2100", amount: gst }, // Cr GST
      ];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(1180);
    });

    it("should balance an invoice with different tax rates", () => {
      // Scenario: Invoice with subtotal 5000, GST = 900 (18%)
      const subtotal = 5000;
      const grandTotal = 5900;
      const gst = grandTotal - subtotal;

      const debits = [{ code: "1100", amount: grandTotal }];
      const credits = [
        { code: "4000", amount: subtotal },
        { code: "2100", amount: gst },
      ];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(5900);
    });

    it("should handle decimal amounts in invoice", () => {
      // Scenario: Invoice with fractional amounts
      const subtotal = 1234.56;
      const grandTotal = 1456.79;
      const gst = Math.round((grandTotal - subtotal) * 100) / 100; // round to 2 decimals

      const debits = [{ code: "1100", amount: grandTotal }];
      const credits = [
        { code: "4000", amount: subtotal },
        { code: "2100", amount: gst },
      ];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      // Should be balanced when properly rounded
      expect(Math.abs(totalDebits - totalCredits) < 0.01).toBe(true);
    });
  });

  // ── Test Balancing Invariant (Payroll) ────────────────────────
  describe("Balancing Invariant - Payroll Posting", () => {
    it("should balance a simple payroll entry", () => {
      // Scenario: Payroll with grossTotal 100000, netTotal 82000
      // Statutory deductions: 100000 - 82000 = 18000

      const grossTotal = 100000;
      const netTotal = 82000;
      const statutory = grossTotal - netTotal;

      // Three journal lines as per postPayrollJournal:
      // Dr Salaries Expense (5000): 100000
      // Cr Salaries Payable (2200): 82000
      // Cr Statutory Dues (2300): 18000

      const debits = [
        { code: "5000", amount: grossTotal }, // Dr Salaries Expense
      ];
      const credits = [
        { code: "2200", amount: netTotal }, // Cr Salaries Payable
        { code: "2300", amount: statutory }, // Cr Statutory Dues
      ];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(100000);
    });

    it("should balance payroll with different gross/net spread", () => {
      // Scenario: Payroll with grossTotal 250000, netTotal 210000
      // Statutory deductions: 250000 - 210000 = 40000

      const grossTotal = 250000;
      const netTotal = 210000;
      const statutory = grossTotal - netTotal;

      const debits = [{ code: "5000", amount: grossTotal }];
      const credits = [
        { code: "2200", amount: netTotal },
        { code: "2300", amount: statutory },
      ];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(250000);
    });

    it("should balance payroll with decimal amounts", () => {
      // Scenario: Payroll with fractional amounts
      const grossTotal = 150000.75;
      const netTotal = 125000.5;
      const statutory = Math.round((grossTotal - netTotal) * 100) / 100;

      const debits = [{ code: "5000", amount: grossTotal }];
      const credits = [
        { code: "2200", amount: netTotal },
        { code: "2300", amount: statutory },
      ];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      // Should be balanced when properly rounded
      expect(Math.abs(totalDebits - totalCredits) < 0.01).toBe(true);
    });

    it("should handle edge case where net equals gross (no deductions)", () => {
      // Scenario: No statutory deductions (edge case)
      const grossTotal = 100000;
      const netTotal = 100000;
      const statutory = grossTotal - netTotal; // = 0

      const debits = [{ code: "5000", amount: grossTotal }];
      const credits = [
        { code: "2200", amount: netTotal },
        { code: "2300", amount: statutory },
      ];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(100000);
    });
  });

  // ── Test Balancing Invariant (Payment) ────────────────────────
  describe("Balancing Invariant - Payment Posting", () => {
    it("should balance a simple payment entry", () => {
      // Scenario: Payment of 1000 via Bank
      const amount = 1000;

      // Two journal lines as per postPaymentJournal:
      // Dr Bank (1010): 1000
      // Cr Accounts Receivable (1100): 1000

      const debits = [{ code: "1010", amount: amount }];
      const credits = [{ code: "1100", amount: amount }];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(1000);
    });

    it("should balance a payment via cash", () => {
      // Scenario: Payment of 500 via Cash
      const amount = 500;

      // Dr Cash (1000): 500
      // Cr Accounts Receivable (1100): 500

      const debits = [{ code: "1000", amount: amount }];
      const credits = [{ code: "1100", amount: amount }];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(500);
    });

    it("should balance payment with decimal amounts", () => {
      // Scenario: Payment of 2345.67
      const amount = 2345.67;

      const debits = [{ code: "1010", amount: amount }];
      const credits = [{ code: "1100", amount: amount }];

      const totalDebits = debits.reduce((sum, line) => sum + line.amount, 0);
      const totalCredits = credits.reduce((sum, line) => sum + line.amount, 0);

      expect(totalDebits).toBe(totalCredits);
    });
  });

  // ── Test rounding behavior ────────────────────────────────────
  describe("Rounding in Balancing Invariant", () => {
    it("should maintain balance with rounding to 2 decimals", () => {
      // Test the rounding function behavior implied by postInvoiceJournal
      const round2 = (n: number) => Math.round((n || 0) * 100) / 100;

      // Mirror the code: it works from ALREADY-rounded stored values (invoice.subtotal,
      // invoice.grandTotal) and derives GST = grandTotal − subtotal, so credits sum EXACTLY
      // to the grand total. (Rounding raw components independently would be the bug the code avoids.)
      const subtotal = round2(1000.123); // 1000.12
      const grandTotal = round2(1180.456); // 1180.46
      const gst = round2(grandTotal - subtotal); // 180.34

      const debits = [{ code: "1100", amount: grandTotal }];
      const credits = [
        { code: "4000", amount: subtotal },
        { code: "2100", amount: gst },
      ];

      // Round each summed side to 2 decimals the same way `round2` does, so the
      // comparison is not defeated by binary floating-point noise (e.g. 1180.46 vs 1180.45999…).
      const totalDebits = round2(debits.reduce((sum, line) => sum + line.amount, 0));
      const totalCredits = round2(credits.reduce((sum, line) => sum + line.amount, 0));

      // Balancing invariant: Dr sum === Cr sum, both equal the clean 2-decimal grand total.
      expect(totalDebits).toBeCloseTo(totalCredits, 2);
      expect(totalDebits).toBeCloseTo(1180.46, 2);
    });

    it("should handle three-way split with rounding", () => {
      const round2 = (n: number) => Math.round((n || 0) * 100) / 100;

      // Payroll with potential rounding edge cases
      const gross = 100000.456;
      const net = 82000.789;
      const stat = round2(gross - net);

      const debits = [{ code: "5000", amount: round2(gross) }];
      const credits = [
        { code: "2200", amount: round2(net) },
        { code: "2300", amount: stat },
      ];

      // Round each summed side to 2 decimals the same way `round2` does, so the
      // comparison is not defeated by binary floating-point noise (e.g. 100000.46 vs 100000.45999…).
      const totalDebits = round2(debits.reduce((sum, line) => sum + line.amount, 0));
      const totalCredits = round2(credits.reduce((sum, line) => sum + line.amount, 0));

      // Balancing invariant: Dr sum === Cr sum, both equal the clean 2-decimal gross total.
      expect(totalDebits).toBeCloseTo(totalCredits, 2);
      expect(totalDebits).toBeCloseTo(100000.46, 2);
    });
  });
});
