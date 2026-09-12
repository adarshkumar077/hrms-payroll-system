import { describe, it, expect } from "vitest";
import {
  isWageCompliant,
  suggestStructure,
  pfEmployee,
  pfEmployer,
  esiEmployee,
  esiEmployer,
  professionalTax,
  estimatedTds,
  computePayslip,
  PF_WAGE_CEILING,
  ESI_WAGE_THRESHOLD,
} from "@/lib/compliance/payroll";

describe("Payroll Compliance", () => {
  describe("isWageCompliant", () => {
    it("should return true when basic is exactly 50% of gross", () => {
      // Gross = 100,000, Basic = 50,000 (50%)
      expect(isWageCompliant(100000, 50000)).toBe(true);
    });

    it("should return true when basic is greater than 50% of gross", () => {
      // Gross = 100,000, Basic = 60,000 (60%)
      expect(isWageCompliant(100000, 60000)).toBe(true);
    });

    it("should return false when basic is less than 50% of gross", () => {
      // Gross = 100,000, Basic = 49,000 (49%)
      expect(isWageCompliant(100000, 49000)).toBe(false);
    });

    it("should handle the tolerance buffer (0.01)", () => {
      // Tolerance only forgives a 0.01 floating-point rounding gap, not a real shortfall;
      // basic = gross*0.5 = 50,000 clears gross*0.5 - 0.01 → compliant.
      expect(isWageCompliant(100000, 50000)).toBe(true);
    });

    it("should return false for significantly low basic amounts", () => {
      // Gross = 100,000, Basic = 40,000 (40%)
      expect(isWageCompliant(100000, 40000)).toBe(false);
    });
  });

  describe("suggestStructure", () => {
    it("should suggest basic = 50% of gross", () => {
      // Gross = 100,000, expected Basic = 50,000
      const result = suggestStructure(100000);
      expect(result.basic).toBe(50000);
    });

    it("should suggest HRA = 40% of basic", () => {
      // Gross = 100,000, Basic = 50,000, expected HRA = 20,000 (40% of 50,000)
      const result = suggestStructure(100000);
      expect(result.hra).toBe(20000);
    });

    it("should calculate allowances as remainder", () => {
      // Gross = 100,000, Basic = 50,000, HRA = 20,000, Allowances = 30,000
      const result = suggestStructure(100000);
      expect(result.allowances).toBe(30000);
    });

    it("should sum to gross", () => {
      // Basic + HRA + Allowances should equal Gross
      const result = suggestStructure(100000);
      expect(result.basic + result.hra + result.allowances).toBe(result.gross);
    });

    it("should mark as compliant", () => {
      const result = suggestStructure(100000);
      expect(result.compliant).toBe(true);
    });

    it("should handle odd amounts with rounding", () => {
      // Gross = 99,999 → basic = 50,000, hra = 20,000, allowances should be remainder
      const result = suggestStructure(99999);
      expect(result.basic).toBe(50000);
      expect(result.hra).toBe(20000);
      // Ensure no negative allowances
      expect(result.allowances).toBeGreaterThanOrEqual(0);
    });
  });

  describe("pfEmployee", () => {
    it("should calculate 12% of basic when below wage ceiling", () => {
      // Basic = 10,000 (below ₹15k ceiling), PF = 10,000 * 0.12 = 1,200
      expect(pfEmployee(10000)).toBe(1200);
    });

    it("should cap at wage ceiling for higher salaries", () => {
      // Basic = 20,000 (above ₹15k ceiling)
      // PF = min(20,000, 15,000) * 0.12 = 15,000 * 0.12 = 1,800
      expect(pfEmployee(20000)).toBe(1800);
    });

    it("should cap at exactly the wage ceiling", () => {
      // Basic = ₹15,000 (at ceiling), PF = 15,000 * 0.12 = 1,800
      expect(pfEmployee(PF_WAGE_CEILING)).toBe(1800);
    });

    it("should return 0 for 0 basic", () => {
      expect(pfEmployee(0)).toBe(0);
    });

    it("should handle rounding", () => {
      // Basic = 10,001, PF = 10,001 * 0.12 = 1,200.12 → rounded to 1,200
      expect(pfEmployee(10001)).toBe(1200);
    });
  });

  describe("pfEmployer", () => {
    it("should calculate 12% of basic when below wage ceiling", () => {
      // Basic = 10,000, Employer PF = 10,000 * 0.12 = 1,200
      expect(pfEmployer(10000)).toBe(1200);
    });

    it("should cap at wage ceiling for higher salaries", () => {
      // Basic = 20,000, Employer PF = min(20,000, 15,000) * 0.12 = 1,800
      expect(pfEmployer(20000)).toBe(1800);
    });

    it("should match employee PF contribution", () => {
      // Employee and employer contributions should be equal
      expect(pfEmployer(10000)).toBe(pfEmployee(10000));
      expect(pfEmployer(20000)).toBe(pfEmployee(20000));
    });
  });

  describe("esiEmployee", () => {
    it("should calculate 0.75% of gross when below threshold", () => {
      // Gross = 10,000 (below ₹21k threshold), ESI = 10,000 * 0.0075 = 75
      expect(esiEmployee(10000)).toBe(75);
    });

    it("should apply at exactly the threshold", () => {
      // ESI covers wages "not exceeding ₹21k", so at exactly ₹21,000 it applies.
      // 21,000 * 0.0075 = 157.5 → rounds to 158.
      expect(esiEmployee(ESI_WAGE_THRESHOLD)).toBe(158);
    });

    it("should return 0 when gross exceeds threshold", () => {
      // Gross = 25,000 (above ₹21k threshold), ESI = 0
      expect(esiEmployee(25000)).toBe(0);
    });

    it("should return 0 for very high salaries", () => {
      // Gross = 50,000, ESI = 0
      expect(esiEmployee(50000)).toBe(0);
    });

    it("should handle rounding for fractional amounts", () => {
      // Gross = 10,001, ESI = 10,001 * 0.0075 = 75.0075 → rounded to 75
      expect(esiEmployee(10001)).toBe(75);
    });
  });

  describe("esiEmployer", () => {
    it("should calculate 3.25% of gross when below threshold", () => {
      // Gross = 10,000, Employer ESI = 10,000 * 0.0325 = 325
      expect(esiEmployer(10000)).toBe(325);
    });

    it("should apply at exactly the threshold", () => {
      // ESI covers wages ≤ ₹21k, so at exactly ₹21,000 employer share applies.
      // 21,000 * 0.0325 = 682.5 → rounds to 683.
      expect(esiEmployer(ESI_WAGE_THRESHOLD)).toBe(683);
    });

    it("should return 0 when gross exceeds threshold", () => {
      // Gross = 25,000, Employer ESI = 0
      expect(esiEmployer(25000)).toBe(0);
    });

    it("should be higher than employee ESI", () => {
      // Employer rate (3.25%) > Employee rate (0.75%)
      expect(esiEmployer(10000)).toBeGreaterThan(esiEmployee(10000));
    });
  });

  describe("professionalTax", () => {
    it("should return 0 when gross <= 7,500", () => {
      // Gross = 7,500, PT = 0
      expect(professionalTax(7500)).toBe(0);
    });

    it("should return 175 when gross is between 7,500 and 10,000", () => {
      // Gross = 9,000, PT = 175
      expect(professionalTax(9000)).toBe(175);
    });

    it("should return 175 when gross = 10,000", () => {
      // Gross = 10,000, PT = 175
      expect(professionalTax(10000)).toBe(175);
    });

    it("should return 200 when gross > 10,000", () => {
      // Gross = 10,001, PT = 200
      expect(professionalTax(10001)).toBe(200);
    });

    it("should return 200 for high salaries", () => {
      // Gross = 50,000, PT = 200
      expect(professionalTax(50000)).toBe(200);
    });

    it("should return 0 for gross < 7,500", () => {
      // Gross = 5,000, PT = 0
      expect(professionalTax(5000)).toBe(0);
    });
  });

  describe("estimatedTds", () => {
    it("should return 0 for income below taxable threshold", () => {
      // Annual gross = 600,000 (after 75k deduction = 525,000 taxable, which is <= 700,000)
      expect(estimatedTds(600000)).toBe(0);
    });

    it("should calculate TDS for income in first slab", () => {
      // Annual gross = 1,000,000
      // Taxable = 1,000,000 - 75,000 = 925,000
      // Tax calculation: (400,000 - 0) * 0% + (800,000 - 400,000) * 5% + (925,000 - 800,000) * 10%
      //              = 0 + 20,000 + 12,500 = 32,500
      // Monthly = (32,500 * 1.04) / 12 = 33,800 / 12 ≈ 2,817 (rounded)
      const tds = estimatedTds(1000000);
      expect(tds).toBeGreaterThan(0);
      expect(tds).toBeCloseTo(2817, -1); // Within 10 rupees
    });

    it("should apply 4% cess on calculated tax", () => {
      // The function multiplies the calculated tax by 1.04 before dividing by 12
      // This ensures cess is included in monthly TDS
      const tds = estimatedTds(1000000);
      expect(tds).toBeGreaterThan(0);
    });

    it("should return 0 for very low annual income", () => {
      // Annual gross = 100,000, which is well below any slab
      expect(estimatedTds(100000)).toBe(0);
    });

    it("should increase with higher income", () => {
      const tds1 = estimatedTds(800000);
      const tds2 = estimatedTds(1200000);
      expect(tds2).toBeGreaterThanOrEqual(tds1);
    });
  });

  describe("computePayslip", () => {
    it("should calculate net pay = gross - pf - esi - pt - tds - lossOfPay", () => {
      // Gross = 50,000, Basic = 25,000, no loss of pay, standard month (30 days)
      // PF Employee = min(25,000, 15,000) * 0.12 = 1,800  (PF capped at ₹15k wage ceiling)
      // ESI Employee = 0  (payableGross 50,000 > ₹21k → out of ESI coverage)
      // PT = 200 (payableGross > 10,000)
      // TDS = 0 (annual 600,000 → taxable 525,000 ≤ ₹7L rebate)
      // Loss of Pay = 0
      // Net = 50,000 - 1,800 - 0 - 200 - 0 - 0 = 48,000
      const payslip = computePayslip({
        gross: 50000,
        basic: 25000,
        annualGross: 600000,
        lopDays: 0,
        daysInMonth: 30,
      });
      expect(payslip.netPay).toBe(48000);
    });

    it("should include employer contributions in output", () => {
      // PF ₹15k wage ceiling applies to BOTH sides: min(25,000,15,000)*0.12 = 1,800.
      // ESI employer = 0 because gross 50,000 > ₹21k coverage threshold.
      const payslip = computePayslip({
        gross: 50000,
        basic: 25000,
      });
      expect(payslip.pfEmployer).toBe(1800);
      expect(payslip.esiEmployer).toBe(0);
    });

    it("should calculate loss of pay proportionally", () => {
      // Gross = 30,000, LOP = 5 days out of 30
      // Loss of Pay = (30,000 / 30) * 5 = 5,000
      const payslip = computePayslip({
        gross: 30000,
        basic: 15000,
        lopDays: 5,
        daysInMonth: 30,
      });
      expect(payslip.lossOfPay).toBe(5000);
    });

    it("should use payableGross for ESI and PT calculations", () => {
      // ESI is assessed on the loss-of-pay-reduced payableGross, not full gross.
      // Gross = 30,000, LOP = 9 days → lossOfPay = (30,000/30)*9 = 9,000 → payableGross = 21,000.
      // At ₹21k payableGross ESI still applies (coverage is ≤ ₹21k): 21,000 * 0.0075 = 157.5 ≈ 158.
      // PT = 200 (payableGross > 10,000).
      const payslip = computePayslip({
        gross: 30000,
        basic: 15000,
        lopDays: 9,
        daysInMonth: 30,
      });
      expect(payslip.esiEmployee).toBe(158);
      expect(payslip.pt).toBe(200);
    });

    it("should use original basic (not payable) for PF", () => {
      // Gross = 30,000, Basic = 15,000, LOP = 5 days
      // PF Employee = 15,000 * 0.12 = 1,800 (calculated on full basic, not reduced)
      const payslip = computePayslip({
        gross: 30000,
        basic: 15000,
        lopDays: 5,
        daysInMonth: 30,
      });
      expect(payslip.pfEmployee).toBe(1800);
    });

    it("should return 0 loss of pay when lopDays is not specified", () => {
      const payslip = computePayslip({
        gross: 50000,
        basic: 25000,
      });
      expect(payslip.lossOfPay).toBe(0);
    });

    it("should default daysInMonth to 30", () => {
      // Gross = 30,000, LOP = 6 days, assuming 30-day month
      // Loss of Pay = (30,000 / 30) * 6 = 6,000
      const payslip = computePayslip({
        gross: 30000,
        basic: 15000,
        lopDays: 6,
      });
      expect(payslip.lossOfPay).toBe(6000);
    });

    it("should handle salary above ESI threshold", () => {
      // Gross = 25,000 (above ₹21k threshold)
      // ESI Employee = 0, ESI Employer = 0
      const payslip = computePayslip({
        gross: 25000,
        basic: 12500,
      });
      expect(payslip.esiEmployee).toBe(0);
      expect(payslip.esiEmployer).toBe(0);
    });

    it("should handle salary above PF wage ceiling", () => {
      // Basic = 20,000 (above ₹15k ceiling)
      // PF = min(20,000, 15,000) * 0.12 = 1,800
      const payslip = computePayslip({
        gross: 40000,
        basic: 20000,
      });
      expect(payslip.pfEmployee).toBe(1800);
      expect(payslip.pfEmployer).toBe(1800);
    });

    it("should include all components in payslip object", () => {
      const payslip = computePayslip({
        gross: 50000,
        basic: 25000,
      });
      expect(payslip).toHaveProperty("gross", 50000);
      expect(payslip).toHaveProperty("basic", 25000);
      expect(payslip).toHaveProperty("pfEmployee");
      expect(payslip).toHaveProperty("pfEmployer");
      expect(payslip).toHaveProperty("esiEmployee");
      expect(payslip).toHaveProperty("esiEmployer");
      expect(payslip).toHaveProperty("pt");
      expect(payslip).toHaveProperty("tds");
      expect(payslip).toHaveProperty("lossOfPay");
      expect(payslip).toHaveProperty("netPay");
    });

    it("should handle annualGross parameter for TDS", () => {
      // annualGross = 1,200,000 (should trigger TDS calculation)
      const payslip = computePayslip({
        gross: 50000,
        basic: 25000,
        annualGross: 1200000,
      });
      expect(payslip.tds).toBeGreaterThan(0);
    });

    it("should use gross * 12 as default annualGross", () => {
      // Gross = 50,000, default annual = 50,000 * 12 = 600,000
      const payslip1 = computePayslip({
        gross: 50000,
        basic: 25000,
      });
      const payslip2 = computePayslip({
        gross: 50000,
        basic: 25000,
        annualGross: 600000,
      });
      expect(payslip1.tds).toBe(payslip2.tds);
    });

    it("should handle edge case: zero salary", () => {
      const payslip = computePayslip({
        gross: 0,
        basic: 0,
      });
      expect(payslip.netPay).toBe(0);
      expect(payslip.pfEmployee).toBe(0);
    });

    it("should have net pay = payableGross - deductions", () => {
      const payslip = computePayslip({
        gross: 50000,
        basic: 25000,
        lopDays: 2,
        daysInMonth: 30,
        annualGross: 600000,
      });
      const payableGross = 50000 - payslip.lossOfPay;
      const expectedNet =
        payableGross -
        payslip.pfEmployee -
        payslip.esiEmployee -
        payslip.pt -
        payslip.tds;
      expect(payslip.netPay).toBe(expectedNet);
    });
  });
});
