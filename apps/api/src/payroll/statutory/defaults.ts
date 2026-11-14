import { PtStateRules, StatutoryRules } from './types';

/**
 * Default statutory rule tables, seeded per company into `statutory_rule_sets`
 * (prisma/seed.ts and prisma/sync-settings.ts) and used as the fallback when a company
 * has no row for a financial year.
 *
 * EVERY VALUE HERE IS `verifyWithCA: true`. They reflect the author's best understanding of
 * the Finance Act 2025 (FY 2025-26) and are carried forward unchanged to FY 2026-27.
 * See docs/PAYROLL-RULES.md before go-live.
 */

export const PT_STATE_CODES = ['NONE', 'MH', 'KA', 'WB', 'TN', 'TS', 'AP', 'GJ'] as const;
export type PtStateCode = (typeof PT_STATE_CODES)[number];

function professionalTaxDefaults(): Record<PtStateCode, PtStateRules> {
  return {
    NONE: {
      name: 'Not applicable / no PT',
      periodicity: 'MONTHLY',
      slabs: [],
    },
    MH: {
      name: 'Maharashtra',
      periodicity: 'MONTHLY',
      slabs: [
        { upTo: 7500, amount: 0 },
        { upTo: 10000, amount: 175 },
        { upTo: null, amount: 200, monthOverrides: { '2': 300 } },
      ],
      femaleSlabs: [
        { upTo: 25000, amount: 0 },
        { upTo: null, amount: 200, monthOverrides: { '2': 300 } },
      ],
      notes: 'Annual cap ₹2,500: ₹200 × 11 + ₹300 in February. Women earning ≤ ₹25,000 exempt.',
    },
    KA: {
      name: 'Karnataka',
      periodicity: 'MONTHLY',
      slabs: [
        { upTo: 24999, amount: 0 },
        { upTo: null, amount: 200, monthOverrides: { '2': 300 } },
      ],
      notes: 'Gross ≥ ₹25,000: ₹200/month; ₹300 in February (2025 amendment, annual ₹2,500).',
    },
    WB: {
      name: 'West Bengal',
      periodicity: 'MONTHLY',
      slabs: [
        { upTo: 10000, amount: 0 },
        { upTo: 15000, amount: 110 },
        { upTo: 25000, amount: 130 },
        { upTo: 40000, amount: 150 },
        { upTo: null, amount: 200 },
      ],
    },
    TN: {
      name: 'Tamil Nadu',
      periodicity: 'HALF_YEARLY',
      slabs: [
        { upTo: 21000, amount: 0 },
        { upTo: 30000, amount: 180 },
        { upTo: 45000, amount: 425 },
        { upTo: 60000, amount: 930 },
        { upTo: 75000, amount: 1025 },
        { upTo: null, amount: 1250 },
      ],
      notes:
        'Statute levies PT on half-yearly income (Apr–Sep, Oct–Mar). Engine deducts the monthly ' +
        'equivalent: monthly gross × 6 is matched to the slab and the half-yearly amount ÷ 6 is deducted. ' +
        'Rates vary by local body (Chennai shown).',
    },
    TS: {
      name: 'Telangana',
      periodicity: 'MONTHLY',
      slabs: [
        { upTo: 15000, amount: 0 },
        { upTo: 20000, amount: 150 },
        { upTo: null, amount: 200 },
      ],
    },
    AP: {
      name: 'Andhra Pradesh',
      periodicity: 'MONTHLY',
      slabs: [
        { upTo: 15000, amount: 0 },
        { upTo: 20000, amount: 150 },
        { upTo: null, amount: 200 },
      ],
    },
    GJ: {
      name: 'Gujarat',
      periodicity: 'MONTHLY',
      slabs: [
        { upTo: 11999, amount: 0 },
        { upTo: null, amount: 200 },
      ],
    },
  };
}

function rulesFor(financialYear: string): StatutoryRules {
  return {
    financialYear,
    verifyWithCA: true,
    incomeTax: {
      regimes: {
        NEW: {
          slabs: [
            { upTo: 400000, rate: 0 },
            { upTo: 800000, rate: 5 },
            { upTo: 1200000, rate: 10 },
            { upTo: 1600000, rate: 15 },
            { upTo: 2000000, rate: 20 },
            { upTo: 2400000, rate: 25 },
            { upTo: null, rate: 30 },
          ],
          standardDeduction: 75000,
          rebate87A: { incomeLimit: 1200000, maxRebate: 60000, marginalRelief: true },
          // New regime surcharge is capped at 25%.
          surcharge: [
            { above: 5000000, rate: 10 },
            { above: 10000000, rate: 15 },
            { above: 20000000, rate: 25 },
          ],
          allowsChapterVIADeductions: false,
        },
        OLD: {
          slabs: [
            { upTo: 250000, rate: 0 },
            { upTo: 500000, rate: 5 },
            { upTo: 1000000, rate: 20 },
            { upTo: null, rate: 30 },
          ],
          standardDeduction: 50000,
          rebate87A: { incomeLimit: 500000, maxRebate: 12500, marginalRelief: false },
          surcharge: [
            { above: 5000000, rate: 10 },
            { above: 10000000, rate: 15 },
            { above: 20000000, rate: 25 },
            { above: 50000000, rate: 37 },
          ],
          allowsChapterVIADeductions: true,
        },
      },
      cessPercent: 4,
      surchargeMarginalRelief: true,
      monthlyTdsRounding: 'RUPEE',
    },
    pf: {
      wageCeiling: 15000,
      restrictToWageCeiling: true,
      employeePercent: 12,
      employerPercent: 12,
      epsPercent: 8.33,
      epsWageCeiling: 15000,
      rounding: 'RUPEE',
    },
    esi: {
      grossThreshold: 21000,
      employeePercent: 0.75,
      employerPercent: 3.25,
      contributionPeriods: true,
      rounding: 'CEIL_RUPEE',
    },
    professionalTax: professionalTaxDefaults(),
    notes: [
      'Default values — VERIFY WITH CA BEFORE GO-LIVE.',
      'Old regime slabs are for individuals below 60; senior-citizen slabs are not modelled.',
    ],
  };
}

export const DEFAULT_FINANCIAL_YEARS = ['2025-26', '2026-27'] as const;

/** Default rule set for a financial year. Unknown years fall back to the latest default (relabelled). */
export function defaultStatutoryRules(financialYear: string): StatutoryRules {
  return rulesFor(financialYear);
}

export function allDefaultStatutoryRules(): StatutoryRules[] {
  return DEFAULT_FINANCIAL_YEARS.map((fy) => rulesFor(fy));
}
