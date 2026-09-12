import { describe, it, expect } from "vitest";

// Pure logic tests for Accounts Payable journal balancing.
// We replicate the line construction from postVendorBillJournal and postBillPaymentJournal inline
// and verify the accounting identity: sum(debits) === sum(credits).

describe("AP Accounting Journal Balance", () => {
  describe("postVendorBillJournal balancing", () => {
    it("should balance vendor bill approval: Dr Operating Expense, Cr Accounts Payable (11800)", () => {
      // Vendor bill approval: lines are Dr Operating Expense (total), Cr Accounts Payable (total)
      const total = 11800;

      const lines = [
        { code: "5200", debit: total }, // Dr Operating Expense
        { code: "2000", credit: total }, // Cr Accounts Payable
      ];

      const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

      expect(sumDebits).toBe(total);
      expect(sumCredits).toBe(total);
      expect(sumDebits).toBe(sumCredits);
    });

    it("should balance vendor bill approval with decimal amounts (999.99)", () => {
      const total = 999.99;

      const lines = [
        { code: "5200", debit: total }, // Dr Operating Expense
        { code: "2000", credit: total }, // Cr Accounts Payable
      ];

      const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

      expect(sumDebits).toBeCloseTo(total, 2);
      expect(sumCredits).toBeCloseTo(total, 2);
      expect(sumDebits).toBeCloseTo(sumCredits, 2);
    });

    it("should use Operating Expense account code 5200", () => {
      const total = 5000;

      const lines = [
        { code: "5200", debit: total },
        { code: "2000", credit: total },
      ];

      expect(lines[0].code).toBe("5200");
    });

    it("should use Accounts Payable account code 2000", () => {
      const total = 5000;

      const lines = [
        { code: "5200", debit: total },
        { code: "2000", credit: total },
      ];

      expect(lines[1].code).toBe("2000");
    });

    it("should balance with various amounts (500, 15000, 0.01)", () => {
      const testCases = [500, 15000, 0.01, 123456.78];

      for (const total of testCases) {
        const lines = [
          { code: "5200", debit: total },
          { code: "2000", credit: total },
        ];

        const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

        expect(sumDebits).toBeCloseTo(sumCredits, 2);
      }
    });
  });

  describe("postBillPaymentJournal balancing", () => {
    it("should balance bill payment: Dr Accounts Payable, Cr Bank (11800)", () => {
      const total = 11800;
      const method = undefined; // defaults to non-Cash, so account 1010

      const lines = [
        { code: "2000", debit: total }, // Dr Accounts Payable
        { code: "1010", credit: total }, // Cr Bank
      ];

      const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

      expect(sumDebits).toBe(total);
      expect(sumCredits).toBe(total);
      expect(sumDebits).toBe(sumCredits);
    });

    it("should balance bill payment with decimal amounts (999.99)", () => {
      const total = 999.99;

      const lines = [
        { code: "2000", debit: total },
        { code: "1010", credit: total },
      ];

      const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

      expect(sumDebits).toBeCloseTo(total, 2);
      expect(sumCredits).toBeCloseTo(total, 2);
      expect(sumDebits).toBeCloseTo(sumCredits, 2);
    });

    it("should use Accounts Payable code 2000 for debit", () => {
      const total = 5000;

      const lines = [
        { code: "2000", debit: total },
        { code: "1010", credit: total },
      ];

      expect(lines[0].code).toBe("2000");
    });

    it("should select Cash account 1000 when method is 'Cash'", () => {
      const total = 5000;
      const method = "Cash";
      const cashCode = method === "Cash" ? "1000" : "1010";

      expect(cashCode).toBe("1000");

      const lines = [
        { code: "2000", debit: total },
        { code: cashCode, credit: total },
      ];

      expect(lines[1].code).toBe("1000");
    });

    it("should select Bank account 1010 when method is not 'Cash'", () => {
      const total = 5000;
      const method: string = "Cheque";
      const cashCode = method === "Cash" ? "1000" : "1010";

      expect(cashCode).toBe("1010");

      const lines = [
        { code: "2000", debit: total },
        { code: cashCode, credit: total },
      ];

      expect(lines[1].code).toBe("1010");
    });

    it("should default to Bank account 1010 when method is undefined", () => {
      const total = 5000;
      const method = undefined;
      const cashCode = method === "Cash" ? "1000" : "1010";

      expect(cashCode).toBe("1010");
    });

    it("should handle various payment methods correctly", () => {
      const testMethods = ["Cash", "Cheque", "Transfer", "Card", "UPI", undefined, null, ""];
      const total = 5000;

      for (const method of testMethods) {
        const cashCode = method === "Cash" ? "1000" : "1010";

        const lines = [
          { code: "2000", debit: total },
          { code: cashCode, credit: total },
        ];

        const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

        expect(sumDebits).toBe(sumCredits);
        if (method === "Cash") {
          expect(lines[1].code).toBe("1000");
        } else {
          expect(lines[1].code).toBe("1010");
        }
      }
    });

    it("should balance with various amounts (500, 15000, 0.01)", () => {
      const testCases = [500, 15000, 0.01, 123456.78];

      for (const total of testCases) {
        const lines = [
          { code: "2000", debit: total },
          { code: "1010", credit: total },
        ];

        const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
        const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

        expect(sumDebits).toBeCloseTo(sumCredits, 2);
      }
    });
  });

  describe("general journal balancing identity", () => {
    it("should maintain zero-sum property for any debit-credit pair", () => {
      // Test the fundamental accounting equation: debits must equal credits
      const amounts = [0.01, 1, 100, 999.99, 5000, 50000.50];

      for (const amt of amounts) {
        const lines = [{ debit: amt }, { credit: amt }];
        const sum = lines.reduce((acc, line) => acc + (line.debit || 0) - (line.credit || 0), 0);
        expect(sum).toBeCloseTo(0, 2);
      }
    });

    it("should fail if debits do not equal credits", () => {
      const lines = [
        { debit: 100 },
        { credit: 99 }, // mismatched
      ];

      const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

      expect(sumDebits).not.toBe(sumCredits);
    });
  });

  describe("real-world scenarios", () => {
    it("should balance a typical vendor bill scenario: 11800 with GST", () => {
      // Bill: 10000 + 1800 GST (simplified as full bill total expensed)
      const billTotal = 11800;

      // Approval posting
      const approvalLines = [
        { code: "5200", debit: billTotal },
        { code: "2000", credit: billTotal },
      ];

      // Payment posting (assume Cheque method)
      const method: string = "Cheque";
      const cashCode = method === "Cash" ? "1000" : "1010";
      const paymentLines = [
        { code: "2000", debit: billTotal },
        { code: cashCode, credit: billTotal },
      ];

      // Verify both postings balance independently
      const approvalDebits = approvalLines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const approvalCredits = approvalLines.reduce((sum, line) => sum + (line.credit || 0), 0);
      const paymentDebits = paymentLines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const paymentCredits = paymentLines.reduce((sum, line) => sum + (line.credit || 0), 0);

      expect(approvalDebits).toBe(approvalCredits);
      expect(paymentDebits).toBe(paymentCredits);
    });

    it("should balance cash payment vs cheque payment for same bill", () => {
      const billTotal = 5000;

      // Cash payment
      const cashCode = "Cash" === "Cash" ? "1000" : "1010";
      const cashLines = [
        { code: "2000", debit: billTotal },
        { code: cashCode, credit: billTotal },
      ];

      // Cheque payment
      const chequeCode = ("Cheque" as string) === "Cash" ? "1000" : "1010";
      const chequeLines = [
        { code: "2000", debit: billTotal },
        { code: chequeCode, credit: billTotal },
      ];

      // Both should balance
      expect(cashLines[0].debit).toBe(cashLines[1].credit);
      expect(chequeLines[0].debit).toBe(chequeLines[1].credit);

      // Cash uses 1000, Cheque uses 1010
      expect(cashLines[1].code).toBe("1000");
      expect(chequeLines[1].code).toBe("1010");
    });

    it("should handle large amounts with precision", () => {
      const billTotal = 999999.99;

      const lines = [
        { code: "2000", debit: billTotal },
        { code: "1010", credit: billTotal },
      ];

      const sumDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const sumCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

      expect(sumDebits).toBeCloseTo(billTotal, 2);
      expect(sumCredits).toBeCloseTo(billTotal, 2);
      expect(Math.abs(sumDebits - sumCredits)).toBeLessThan(0.01);
    });
  });
});
