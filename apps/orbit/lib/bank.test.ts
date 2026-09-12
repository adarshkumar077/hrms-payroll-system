import { describe, it, expect } from "vitest";
import { parseBankCsv } from "@/lib/bank";

describe("parseBankCsv", () => {
  describe("basic CSV parsing", () => {
    it("should parse a standard CSV with date, description, amount, direction columns", () => {
      const csv = `date,description,amount,direction
2025-01-15,Salary Deposit,5000,credit
2025-01-16,Office Supplies,-500,debit`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: new Date("2025-01-15"),
        description: "Salary Deposit",
        amount: 5000,
        direction: "credit",
      });
      expect(result[1]).toEqual({
        date: new Date("2025-01-16"),
        description: "Office Supplies",
        amount: 500,
        direction: "debit",
      });
    });

    it("should handle header aliases (narration, Txn Date, Amt, etc.)", () => {
      const csv = `Txn Date,narration,Amt
2025-02-01,Client Payment,10000
2025-02-02,Vendor Invoice,2500`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: new Date("2025-02-01"),
        description: "Client Payment",
        amount: 10000,
        direction: "credit",
      });
      expect(result[1]).toEqual({
        date: new Date("2025-02-02"),
        description: "Vendor Invoice",
        amount: 2500,
        direction: "credit",
      });
    });

    it("should handle column names with different cases and whitespace", () => {
      const csv = `DATE , Description , AMOUNT , Direction
2025-03-01,Transfer,1500,CREDIT
2025-03-02,Withdrawal,750,DEBIT`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(1500);
      expect(result[0].direction).toBe("credit");
      expect(result[1].amount).toBe(750);
      expect(result[1].direction).toBe("debit");
    });
  });

  describe("signed amounts (negative = debit, positive = credit)", () => {
    it("should interpret negative amount as debit and positive as credit when no direction column", () => {
      const csv = `date,description,amount
2025-01-01,Sale,5000
2025-01-02,Expense,-1200`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: new Date("2025-01-01"),
        description: "Sale",
        amount: 5000,
        direction: "credit",
      });
      expect(result[1]).toEqual({
        date: new Date("2025-01-02"),
        description: "Expense",
        amount: 1200,
        direction: "debit",
      });
    });

    it("should make amount positive even if input is negative", () => {
      const csv = `date,description,amount
2025-04-01,Test,-999.99`;

      const result = parseBankCsv(csv);

      expect(result[0].amount).toBe(999.99);
    });

    it("should handle signed amounts with currency formatting", () => {
      // Thousands-separated amounts must be quoted so the comma isn't a CSV delimiter.
      const csv = `date,description,amount
2025-05-01,Payment,"-$2,500.50"
2025-05-02,Income,"₹15,000"`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0].amount).toBe(2500.5);
      expect(result[0].direction).toBe("debit");
      expect(result[1].amount).toBe(15000);
      expect(result[1].direction).toBe("credit");
    });
  });

  describe("type/direction column parsing", () => {
    it("should parse type column with DR/CR values", () => {
      const csv = `date,description,amount,type
2025-06-01,Expense,3000,DR
2025-06-02,Income,5000,CR`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0].direction).toBe("debit");
      expect(result[1].direction).toBe("credit");
    });

    it("should handle direction column with debit/credit keywords", () => {
      const csv = `date,description,amount,direction
2025-07-01,Test1,1000,debit
2025-07-02,Test2,2000,credit`;

      const result = parseBankCsv(csv);

      expect(result[0].direction).toBe("debit");
      expect(result[1].direction).toBe("credit");
    });

    it("should handle withdraw keyword as debit", () => {
      const csv = `date,description,amount,dr/cr
2025-08-01,ATM,5000,withdraw`;

      const result = parseBankCsv(csv);

      expect(result[0].direction).toBe("debit");
    });

    it("should treat anything not matching debit patterns as credit", () => {
      const csv = `date,description,amount,type
2025-09-01,Test,1000,DEPOSIT
2025-09-02,Test2,2000,CREDIT`;

      const result = parseBankCsv(csv);

      expect(result[0].direction).toBe("credit");
      expect(result[1].direction).toBe("credit");
    });

    it("should prioritize direction column over signed amount", () => {
      const csv = `date,description,amount,direction
2025-10-01,Test,-5000,CR`;

      const result = parseBankCsv(csv);

      expect(result[0].direction).toBe("credit");
      expect(result[0].amount).toBe(5000);
    });
  });

  describe("skipping rows with zero/blank amounts", () => {
    it("should skip rows with zero amount", () => {
      const csv = `date,description,amount
2025-11-01,Valid,5000
2025-11-02,Zero,0
2025-11-03,Another,3000`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0].description).toBe("Valid");
      expect(result[1].description).toBe("Another");
    });

    it("should skip rows with blank amount", () => {
      const csv = `date,description,amount
2025-12-01,Valid,2000
2025-12-02,Blank,
2025-12-03,Another,1500`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0].description).toBe("Valid");
      expect(result[1].description).toBe("Another");
    });

    it("should skip rows where amount cannot be parsed to a number", () => {
      // "N/A" strips to empty → 0 → skipped. (The parser intentionally extracts digits from
      // currency-prefixed values like "Rs.5000", so it is lenient by design.)
      const csv = `date,description,amount
2026-01-01,Valid,5000
2026-01-02,Invalid,N/A
2026-01-03,Another,2000`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.description)).toEqual(["Valid", "Another"]);
    });
  });

  describe("date parsing", () => {
    it("should parse standard date formats", () => {
      const csv = `date,description,amount
2026-02-15,Test,1000`;

      const result = parseBankCsv(csv);

      expect(result[0].date).toEqual(new Date("2026-02-15"));
    });

    it("should default to current date if date column is missing or invalid", () => {
      const csv = `description,amount
Test,1000`;

      const result = parseBankCsv(csv);

      // Should use new Date() which will be today; just verify it's a valid Date
      expect(result[0].date).toBeInstanceOf(Date);
      expect(isNaN(result[0].date.getTime())).toBe(false);
    });

    it("should default to current date if date value is invalid", () => {
      const csv = `date,description,amount
invalid-date,Test,1000`;

      const result = parseBankCsv(csv);

      // Invalid date should fall back to new Date()
      expect(result[0].date).toBeInstanceOf(Date);
      expect(isNaN(result[0].date.getTime())).toBe(false);
    });

    it("should use Txn Date or Value Date aliases", () => {
      const csv = `Txn Date,description,amount
2026-03-20,Test,1000`;

      const result = parseBankCsv(csv);

      expect(result[0].date).toEqual(new Date("2026-03-20"));
    });
  });

  describe("description column", () => {
    it("should use description if present", () => {
      const csv = `date,description,amount
2026-04-01,Bank Transfer,5000`;

      const result = parseBankCsv(csv);

      expect(result[0].description).toBe("Bank Transfer");
    });

    it("should use narration as fallback", () => {
      const csv = `date,narration,amount
2026-04-01,Customer Payment,3000`;

      const result = parseBankCsv(csv);

      expect(result[0].description).toBe("Customer Payment");
    });

    it("should use particulars or details if description/narration missing", () => {
      const csv = `date,particulars,amount
2026-04-01,Office Rent,2000`;

      const result = parseBankCsv(csv);

      expect(result[0].description).toBe("Office Rent");
    });

    it("should default to empty string if no description column found", () => {
      const csv = `date,amount
2026-04-01,1500`;

      const result = parseBankCsv(csv);

      expect(result[0].description).toBe("");
    });
  });

  describe("complex real-world scenarios", () => {
    it("should handle a realistic bank statement CSV", () => {
      const csv = `Date,Description,Amount,Type
2026-05-01,Opening Balance,100000,CR
2026-05-02,Client Invoice #001,50000,CR
2026-05-03,Vendor Payment,12000,DR
2026-05-04,Office Supplies,3500,DR
2026-05-05,Loan Disbursement,25000,CR`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual({
        date: new Date("2026-05-01"),
        description: "Opening Balance",
        amount: 100000,
        direction: "credit",
      });
      expect(result[2].direction).toBe("debit");
    });

    it("should handle amounts with decimal places and currency symbols", () => {
      const csv = `date,narration,amount,direction
2026-06-01,Sale,"$5,234.99",credit
2026-06-02,Refund,-$99.99,`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(2);
      expect(result[0].amount).toBeCloseTo(5234.99, 2);
      expect(result[0].direction).toBe("credit");
      expect(result[1].amount).toBeCloseTo(99.99, 2);
      expect(result[1].direction).toBe("debit");
    });

    it("should handle empty CSV (header only)", () => {
      const csv = `date,description,amount,direction`;

      const result = parseBankCsv(csv);

      expect(result).toEqual([]);
    });

    it("should handle multiple rows with mixed column styles", () => {
      const csv = `Date,Narration,Amt,Direction
2026-07-01,Transaction 1,5000,CR
2026-07-02,Transaction 2,-2500,
2026-07-03,Transaction 3,0,
2026-07-04,Transaction 4,1800,DEBIT`;

      const result = parseBankCsv(csv);

      expect(result).toHaveLength(3);
      expect(result[0].description).toBe("Transaction 1");
      expect(result[1].description).toBe("Transaction 2");
      expect(result[2].description).toBe("Transaction 4");
    });
  });
});
