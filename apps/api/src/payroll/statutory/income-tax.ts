import * as M from '../../common/money';
import { monthsRemainingInFy, roundBy } from './common';
import { RegimeRules, StatutoryRules, TaxRegimeCode, TaxSlab } from './types';

export type AnnualTaxBreakdown = {
  regime: TaxRegimeCode;
  taxableIncome: M.Decimal;
  /** Tax on slabs before rebate. */
  slabTax: M.Decimal;
  /** Section 87A rebate, including new-regime marginal relief. */
  rebate: M.Decimal;
  taxAfterRebate: M.Decimal;
  surchargeRate: number;
  /** Surcharge after marginal relief. */
  surcharge: M.Decimal;
  cess: M.Decimal;
  /** taxAfterRebate + surcharge + cess. */
  totalTax: M.Decimal;
};

/** Tax on the slabs (no rebate / surcharge / cess), unrounded. */
export function slabTax(income: M.MoneyInput, slabs: TaxSlab[]): M.Decimal {
  const inc = M.nonNegative(income);
  let tax = M.money(0);
  let lower = M.money(0);
  for (const slab of slabs) {
    if (inc.lessThanOrEqualTo(lower)) break;
    const upper = slab.upTo == null ? inc : M.min(inc, slab.upTo);
    tax = tax.plus(M.percentOf(upper.minus(lower), slab.rate));
    if (slab.upTo == null) break;
    lower = M.money(slab.upTo);
  }
  return tax;
}

/** Tax after the 87A rebate (with marginal relief where the regime allows it), unrounded. */
function taxAfterRebate(income: M.Decimal, r: RegimeRules): { slab: M.Decimal; rebate: M.Decimal } {
  const slab = slabTax(income, r.slabs);
  const { incomeLimit, maxRebate, marginalRelief } = r.rebate87A;
  let rebate = M.money(0);
  if (income.lessThanOrEqualTo(incomeLimit)) {
    rebate = M.min(slab, maxRebate);
  } else if (marginalRelief) {
    // Tax payable cannot exceed the income above the rebate limit.
    const excess = income.minus(incomeLimit);
    if (slab.greaterThan(excess)) rebate = slab.minus(excess);
  }
  return { slab, rebate };
}

function surchargeRateAt(income: M.Decimal, r: RegimeRules): { rate: number; threshold: number | null; rateBelow: number } {
  let rate = 0;
  let threshold: number | null = null;
  let rateBelow = 0;
  for (const s of r.surcharge) {
    if (income.greaterThan(s.above)) {
      rateBelow = rate;
      rate = s.rate;
      threshold = s.above;
    }
  }
  return { rate, threshold, rateBelow };
}

/**
 * Annual income tax for a taxable income (after standard deduction and any allowed deductions).
 * Order: slab tax → 87A rebate (+ marginal relief) → surcharge (+ marginal relief) → cess.
 * Each component is rounded HALF_UP to 2dp; totalTax is their exact sum.
 */
export function computeAnnualTax(
  regime: TaxRegimeCode,
  annualTaxableIncome: M.MoneyInput,
  rules: StatutoryRules,
): AnnualTaxBreakdown {
  const r = rules.incomeTax.regimes[regime];
  const income = M.nonNegative(annualTaxableIncome);
  const { slab, rebate } = taxAfterRebate(income, r);
  const afterRebate = M.nonNegative(slab.minus(rebate));

  const { rate, threshold, rateBelow } = surchargeRateAt(income, r);
  let surcharge = M.percentOf(afterRebate, rate);
  if (rate > 0 && threshold != null && rules.incomeTax.surchargeMarginalRelief) {
    // Tax + surcharge may not exceed (tax + surcharge at the threshold) + (income − threshold).
    const t = M.money(threshold);
    const atThreshold = taxAfterRebate(t, r);
    const taxAtT = M.nonNegative(atThreshold.slab.minus(atThreshold.rebate));
    const cap = taxAtT.plus(M.percentOf(taxAtT, rateBelow)).plus(income.minus(t));
    if (afterRebate.plus(surcharge).greaterThan(cap)) {
      surcharge = M.nonNegative(cap.minus(afterRebate));
    }
  }

  const slabR = M.round2(slab);
  const rebateR = M.round2(rebate);
  const afterRebateR = M.nonNegative(slabR.minus(rebateR));
  const surchargeR = M.round2(surcharge);
  const cess = M.round2(M.percentOf(afterRebateR.plus(surchargeR), rules.incomeTax.cessPercent));
  return {
    regime,
    taxableIncome: M.round2(income),
    slabTax: slabR,
    rebate: rebateR,
    taxAfterRebate: afterRebateR,
    surchargeRate: rate,
    surcharge: surchargeR,
    cess,
    totalTax: M.add(afterRebateR, surchargeR, cess),
  };
}

/**
 * Annual taxable income = gross − standard deduction − (old regime only) declared Chapter VI-A
 * deductions (80C etc., as one total) − professional tax u/s 16(iii). Never negative.
 */
export function computeTaxableIncome(input: {
  regime: TaxRegimeCode;
  annualGross: M.MoneyInput;
  rules: StatutoryRules;
  declaredDeductions?: M.MoneyInput;
  professionalTaxAnnual?: M.MoneyInput;
}): M.Decimal {
  const r = input.rules.incomeTax.regimes[input.regime];
  let taxable = M.sub(input.annualGross, r.standardDeduction);
  if (r.allowsChapterVIADeductions) {
    taxable = taxable.minus(M.nonNegative(input.declaredDeductions)).minus(M.nonNegative(input.professionalTaxAnnual));
  }
  return M.round2(M.nonNegative(taxable));
}

/**
 * Projected annual gross for the FY = taxable gross already paid this FY (approved payroll)
 * + this month's taxable gross × months remaining (this month included).
 */
export function projectAnnualIncome(input: {
  monthlyTaxableGross: M.MoneyInput;
  month: number;
  priorTaxableGross?: M.MoneyInput;
}): { projectedAnnualGross: M.Decimal; monthsRemaining: number } {
  const monthsRemaining = monthsRemainingInFy(input.month);
  const projectedAnnualGross = M.round2(
    M.add(input.priorTaxableGross, M.mul(M.nonNegative(input.monthlyTaxableGross), monthsRemaining)),
  );
  return { projectedAnnualGross, monthsRemaining };
}

export type MonthlyTdsResult = {
  monthlyTds: M.Decimal;
  projectedAnnualGross: M.Decimal;
  monthsRemaining: number;
  annualTax: AnnualTaxBreakdown;
  priorTdsDeducted: M.Decimal;
};

/**
 * Monthly TDS = (projected annual tax − TDS already deducted this FY) ÷ months remaining,
 * never negative, rounded per `incomeTax.monthlyTdsRounding` (default: nearest rupee).
 */
export function computeMonthlyTds(input: {
  regime: TaxRegimeCode;
  rules: StatutoryRules;
  month: number;
  monthlyTaxableGross: M.MoneyInput;
  priorTaxableGross?: M.MoneyInput;
  priorTdsDeducted?: M.MoneyInput;
  declaredDeductions?: M.MoneyInput;
  /** PT this month; projected as prior PT + this × months remaining. */
  monthlyProfessionalTax?: M.MoneyInput;
  priorProfessionalTax?: M.MoneyInput;
}): MonthlyTdsResult {
  const { projectedAnnualGross, monthsRemaining } = projectAnnualIncome({
    monthlyTaxableGross: input.monthlyTaxableGross,
    month: input.month,
    priorTaxableGross: input.priorTaxableGross,
  });
  const ptAnnual = M.add(input.priorProfessionalTax, M.mul(M.nonNegative(input.monthlyProfessionalTax), monthsRemaining));
  const taxable = computeTaxableIncome({
    regime: input.regime,
    annualGross: projectedAnnualGross,
    rules: input.rules,
    declaredDeductions: input.declaredDeductions,
    professionalTaxAnnual: ptAnnual,
  });
  const annualTax = computeAnnualTax(input.regime, taxable, input.rules);
  const prior = M.round2(M.nonNegative(input.priorTdsDeducted));
  const balance = M.nonNegative(annualTax.totalTax.minus(prior));
  const monthlyTds = roundBy(M.div(balance, monthsRemaining), input.rules.incomeTax.monthlyTdsRounding);
  return { monthlyTds, projectedAnnualGross, monthsRemaining, annualTax, priorTdsDeducted: prior };
}
