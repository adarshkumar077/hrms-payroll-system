import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../common/money';
import {
  computeAnnualTax,
  computeMonthlyTds,
  computeTaxableIncome,
  defaultStatutoryRules,
  financialYearOf,
  fyMonthIndex,
  monthsRemainingInFy,
  parseStatutoryRules,
  priorMonthsInEsiPeriod,
  priorMonthsInFy,
  projectAnnualIncome,
  StatutoryRulesError,
  summarizePriorPayroll,
} from './index';

// Golden values were computed independently with Python's decimal module (ROUND_HALF_UP),
// not with this code. Inputs to computeAnnualTax are TAXABLE income (after standard deduction).

const FY = '2026-27';
const rules = defaultStatutoryRules(FY);
const n = (d: M.Decimal) => d.toNumber();

function tax(regime: 'NEW' | 'OLD', taxable: number) {
  const t = computeAnnualTax(regime, taxable, rules);
  return {
    slab: n(t.slabTax),
    rebate: n(t.rebate),
    surcharge: n(t.surcharge),
    cess: n(t.cess),
    total: n(t.totalTax),
  };
}

test('defaults validate and are marked verifyWithCA for both seeded FYs', () => {
  for (const fy of ['2025-26', '2026-27']) {
    const r = parseStatutoryRules(JSON.parse(JSON.stringify(defaultStatutoryRules(fy))));
    assert.equal(r.financialYear, fy);
    assert.equal(r.verifyWithCA, true);
  }
});

test('rule validation rejects malformed tables', () => {
  const bad = JSON.parse(JSON.stringify(rules));
  bad.incomeTax.regimes.NEW.slabs = [{ upTo: 800000, rate: 5 }, { upTo: 400000, rate: 0 }, { upTo: null, rate: 30 }];
  assert.throws(() => parseStatutoryRules(bad), StatutoryRulesError);
  const bad2 = JSON.parse(JSON.stringify(rules));
  bad2.pf.employeePercent = 'twelve';
  assert.throws(() => parseStatutoryRules(bad2), StatutoryRulesError);
  assert.throws(() => parseStatutoryRules({ ...rules, financialYear: '2026' }), StatutoryRulesError);
});

test('new regime: ₹7L taxable → nil (87A rebate)', () => {
  assert.deepEqual(tax('NEW', 700000), { slab: 15000, rebate: 15000, surcharge: 0, cess: 0, total: 0 });
});

test('new regime: ₹12L taxable → nil (full ₹60,000 rebate)', () => {
  assert.deepEqual(tax('NEW', 1200000), { slab: 60000, rebate: 60000, surcharge: 0, cess: 0, total: 0 });
});

test('new regime: ₹12.1L taxable → marginal relief caps tax at income above ₹12L', () => {
  // slab 61,500; tax limited to 10,000; cess 400
  assert.deepEqual(tax('NEW', 1210000), { slab: 61500, rebate: 51500, surcharge: 0, cess: 400, total: 10400 });
});

test('new regime: ₹15L and ₹30L taxable', () => {
  assert.deepEqual(tax('NEW', 1500000), { slab: 105000, rebate: 0, surcharge: 0, cess: 4200, total: 109200 });
  assert.deepEqual(tax('NEW', 3000000), { slab: 480000, rebate: 0, surcharge: 0, cess: 19200, total: 499200 });
});

test('new regime: ₹60L taxable → 10% surcharge', () => {
  assert.deepEqual(tax('NEW', 6000000), { slab: 1380000, rebate: 0, surcharge: 138000, cess: 60720, total: 1578720 });
});

test('new regime: surcharge marginal relief just above ₹50L, 15% above ₹1Cr', () => {
  // 10% would be 108,300; relief limits tax+surcharge to 10,80,000 + 10,000
  assert.deepEqual(tax('NEW', 5010000), { slab: 1083000, rebate: 0, surcharge: 7000, cess: 43600, total: 1133600 });
  assert.deepEqual(tax('NEW', 12000000), { slab: 3180000, rebate: 0, surcharge: 477000, cess: 146280, total: 3803280 });
});

test('old regime: ₹5L taxable → nil (₹12,500 rebate)', () => {
  assert.deepEqual(tax('OLD', 500000), { slab: 12500, rebate: 12500, surcharge: 0, cess: 0, total: 0 });
});

test('old regime: ₹8L gross with ₹1.5L 80C → taxable ₹6L → ₹33,800', () => {
  const taxable = computeTaxableIncome({ regime: 'OLD', annualGross: 800000, rules, declaredDeductions: 150000 });
  assert.equal(n(taxable), 600000); // 8,00,000 − 50,000 standard − 1,50,000 80C
  assert.deepEqual(tax('OLD', n(taxable)), { slab: 32500, rebate: 0, surcharge: 0, cess: 1300, total: 33800 });
});

test('old regime: ₹15L taxable; 37% surcharge above ₹5Cr (old regime only)', () => {
  assert.deepEqual(tax('OLD', 1500000), { slab: 262500, rebate: 0, surcharge: 0, cess: 10500, total: 273000 });
  assert.deepEqual(tax('OLD', 5010000), { slab: 1315500, rebate: 0, surcharge: 7000, cess: 52900, total: 1375400 });
  assert.deepEqual(tax('OLD', 60000000), {
    slab: 17812500,
    rebate: 0,
    surcharge: 6590625,
    cess: 976125,
    total: 25379250,
  });
});

test('taxable income: new regime ignores declared deductions; never negative', () => {
  assert.equal(n(computeTaxableIncome({ regime: 'NEW', annualGross: 1275000, rules, declaredDeductions: 150000 })), 1200000);
  assert.equal(n(computeTaxableIncome({ regime: 'OLD', annualGross: 40000, rules })), 0);
  // old regime: PT u/s 16(iii) is deductible
  assert.equal(
    n(computeTaxableIncome({ regime: 'OLD', annualGross: 800000, rules, declaredDeductions: 150000, professionalTaxAnnual: 2500 })),
    597500,
  );
});

test('FY helpers', () => {
  assert.equal(financialYearOf(2026, 3), '2025-26');
  assert.equal(financialYearOf(2026, 4), '2026-27');
  assert.equal(financialYearOf(2099, 12), '2099-00');
  assert.equal(fyMonthIndex(4), 0);
  assert.equal(fyMonthIndex(3), 11);
  assert.equal(monthsRemainingInFy(4), 12);
  assert.equal(monthsRemainingInFy(10), 6);
  assert.equal(monthsRemainingInFy(3), 1);
  assert.deepEqual(priorMonthsInFy(2026, 4), []);
  assert.deepEqual(priorMonthsInFy(2027, 2).at(0), { year: 2026, month: 4 });
  assert.deepEqual(priorMonthsInFy(2027, 2).at(-1), { year: 2027, month: 1 });
  assert.equal(priorMonthsInFy(2027, 2).length, 10);
  assert.deepEqual(priorMonthsInEsiPeriod(2026, 4), []);
  assert.deepEqual(priorMonthsInEsiPeriod(2026, 6), [
    { year: 2026, month: 4 },
    { year: 2026, month: 5 },
  ]);
  assert.deepEqual(priorMonthsInEsiPeriod(2027, 1), [
    { year: 2026, month: 10 },
    { year: 2026, month: 11 },
    { year: 2026, month: 12 },
  ]);
});

test('projection: prior taxable + this month × months remaining', () => {
  const p = projectAnnualIncome({ monthlyTaxableGross: 150000, month: 10, priorTaxableGross: 750000 });
  assert.equal(p.monthsRemaining, 6);
  assert.equal(n(p.projectedAnnualGross), 1650000);
});

test('monthly TDS mid-year (October) with prior deductions, new regime', () => {
  // Apr–Sep paid 6 × 1,25,000 with ₹30,000 TDS; from October gross is 1,50,000.
  // Projected 16,50,000 → taxable 15,75,000 → tax 1,16,250 + cess 4,650 = 1,20,900.
  // (1,20,900 − 30,000) ÷ 6 = 15,150.
  const r = computeMonthlyTds({
    regime: 'NEW',
    rules,
    month: 10,
    monthlyTaxableGross: 150000,
    priorTaxableGross: 750000,
    priorTdsDeducted: 30000,
  });
  assert.equal(n(r.projectedAnnualGross), 1650000);
  assert.equal(n(r.annualTax.taxableIncome), 1575000);
  assert.equal(n(r.annualTax.totalTax), 120900);
  assert.equal(n(r.monthlyTds), 15150);
});

test('monthly TDS: old regime in January with 80C and PT', () => {
  // 9 × 80,000 paid, ₹40,000 TDS, ₹1,800 PT; Jan–Mar 80,000 with ₹200 PT.
  // Taxable 9,60,000 − 50,000 − 1,50,000 − 2,400 = 7,57,600 → 64,020 + cess 2,560.80 = 66,580.80
  // (66,580.80 − 40,000) ÷ 3 = 8,860.27 → ₹8,860
  const r = computeMonthlyTds({
    regime: 'OLD',
    rules,
    month: 1,
    monthlyTaxableGross: 80000,
    priorTaxableGross: 720000,
    priorTdsDeducted: 40000,
    declaredDeductions: 150000,
    monthlyProfessionalTax: 200,
    priorProfessionalTax: 1800,
  });
  assert.equal(n(r.annualTax.taxableIncome), 757600);
  assert.equal(n(r.annualTax.totalTax), 66580.8);
  assert.equal(n(r.monthlyTds), 8860);
});

test('monthly TDS never negative when already over-deducted', () => {
  const r = computeMonthlyTds({
    regime: 'NEW',
    rules,
    month: 12,
    monthlyTaxableGross: 50000,
    priorTaxableGross: 400000,
    priorTdsDeducted: 9000,
  });
  assert.equal(n(r.monthlyTds), 0);
});

test('monthly TDS steady state: ₹1L/month new regime is nil; ₹2L/month', () => {
  assert.equal(n(computeMonthlyTds({ regime: 'NEW', rules, month: 4, monthlyTaxableGross: 100000 }).monthlyTds), 0);
  // 24,00,000 − 75,000 = 23,25,000 → 2,81,250 + 11,250 = 2,92,500 ÷ 12 = 24,375
  assert.equal(n(computeMonthlyTds({ regime: 'NEW', rules, month: 4, monthlyTaxableGross: 200000 }).monthlyTds), 24375);
});

test('summarizePriorPayroll: statutory_json gross, legacy fallback, ESI period lock', () => {
  const s = summarizePriorPayroll(
    [
      {
        year: 2026,
        month: 4,
        earnings: [{ code: 'BASIC', amount: 20000 }],
        deductions: [{ code: 'TDS', amount: 100 }, { code: 'PT', amount: 200 }],
        grossEarnings: 20000,
        statutory: { monthlyGross: 20000, esi: { applicable: true } },
      },
      {
        year: 2026,
        month: 5,
        earnings: [{ code: 'BASIC', amount: 25000 }, { code: 'REIMB', amount: 1000 }],
        deductions: [{ code: 'TDS', amount: 150.5 }],
        grossEarnings: 26000,
        statutory: null, // pre-T9 line: 26,000 − 1,000 reimbursement
      },
    ],
    [
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
    ],
  );
  assert.equal(n(s.priorTaxableGross), 45000);
  assert.equal(n(s.priorTdsDeducted), 250.5);
  assert.equal(n(s.priorProfessionalTax), 200);
  assert.equal(s.esiPeriodEligible, true);
  assert.equal(summarizePriorPayroll([], []).esiPeriodEligible, null);
});
