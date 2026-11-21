import * as M from '../../common/money';
import { roundBy } from './common';
import { PtSlab, StatutoryRules } from './types';

// ---------------------------------------------------------------------------
// Provident Fund (EPF & MP Act)
// ---------------------------------------------------------------------------

export type PfResult = {
  /** Basic + DA earned this month. */
  actualWage: M.Decimal;
  /** Wage the contribution is computed on (capped at the ceiling unless the company opts out). */
  pfWage: M.Decimal;
  employee: M.Decimal;
  /** Employer total = EPS + EPF. */
  employerTotal: M.Decimal;
  /** Pension: epsPercent of min(pfWage, epsWageCeiling). */
  employerEps: M.Decimal;
  /** Employer EPF = employer total − EPS (3.67% + any excess over the ceiling). */
  employerEpf: M.Decimal;
};

export function computePf(input: {
  /** Basic + DA for the month (after LOP). */
  basicPlusDa: M.MoneyInput;
  rules: StatutoryRules;
  /** Override the company option (rules.pf.restrictToWageCeiling). */
  restrictToWageCeiling?: boolean;
}): PfResult {
  const pf = input.rules.pf;
  const actualWage = M.round2(M.nonNegative(input.basicPlusDa));
  const restrict = input.restrictToWageCeiling ?? pf.restrictToWageCeiling;
  const pfWage = restrict ? M.min(actualWage, pf.wageCeiling) : actualWage;
  const employee = roundBy(M.percentOf(pfWage, pf.employeePercent), pf.rounding);
  const employerTotal = roundBy(M.percentOf(pfWage, pf.employerPercent), pf.rounding);
  const epsWage = M.min(pfWage, pf.epsWageCeiling);
  const employerEps = M.min(roundBy(M.percentOf(epsWage, pf.epsPercent), pf.rounding), employerTotal);
  const employerEpf = M.nonNegative(employerTotal.minus(employerEps));
  return { actualWage, pfWage, employee, employerTotal, employerEps, employerEpf };
}

// ---------------------------------------------------------------------------
// ESI (ESI Act)
// ---------------------------------------------------------------------------

export type EsiResult = {
  applicable: boolean;
  /** Why it was (not) applied: threshold test, or carried over from the contribution period. */
  basis: 'THRESHOLD' | 'CONTRIBUTION_PERIOD' | 'NO_WAGES';
  gross: M.Decimal;
  employee: M.Decimal;
  employer: M.Decimal;
};

/**
 * ESI applies when monthly gross ≤ threshold. With contribution periods (Apr–Sep, Oct–Mar), an
 * employee covered at the start of the period stays covered for the whole period even if pay
 * rises: pass `periodEligible` = the decision taken in the period's first payroll month.
 */
export function computeEsi(input: {
  monthlyGross: M.MoneyInput;
  rules: StatutoryRules;
  periodEligible?: boolean | null;
}): EsiResult {
  const esi = input.rules.esi;
  const gross = M.round2(M.nonNegative(input.monthlyGross));
  const zero = M.money(0);
  if (gross.isZero()) return { applicable: false, basis: 'NO_WAGES', gross, employee: zero, employer: zero };
  let applicable: boolean;
  let basis: EsiResult['basis'] = 'THRESHOLD';
  if (esi.contributionPeriods && input.periodEligible != null) {
    applicable = input.periodEligible;
    basis = 'CONTRIBUTION_PERIOD';
  } else {
    applicable = gross.lessThanOrEqualTo(esi.grossThreshold);
  }
  if (!applicable) return { applicable, basis, gross, employee: zero, employer: zero };
  return {
    applicable,
    basis,
    gross,
    employee: roundBy(M.percentOf(gross, esi.employeePercent), esi.rounding),
    employer: roundBy(M.percentOf(gross, esi.employerPercent), esi.rounding),
  };
}

// ---------------------------------------------------------------------------
// Professional tax (state-wise)
// ---------------------------------------------------------------------------

function pickSlab(slabs: PtSlab[], income: M.Decimal): PtSlab | null {
  for (const s of slabs) {
    if (s.upTo == null || income.lessThanOrEqualTo(s.upTo)) return s;
  }
  return null;
}

export type PtResult = {
  stateCode: string;
  known: boolean;
  amount: M.Decimal;
};

/**
 * Monthly professional tax from the state's slab table.
 * HALF_YEARLY states (Tamil Nadu) use the monthly equivalent: monthly gross × 6 is matched to the
 * half-yearly slab and the half-yearly amount ÷ 6 is deducted (2dp).
 */
export function computePt(input: {
  monthlyGross: M.MoneyInput;
  stateCode?: string | null;
  month: number;
  rules: StatutoryRules;
  gender?: string | null;
}): PtResult {
  const code = (input.stateCode || 'NONE').toUpperCase();
  const state = input.rules.professionalTax[code];
  const zero = M.money(0);
  if (!state) return { stateCode: code, known: false, amount: zero };
  const gross = M.round2(M.nonNegative(input.monthlyGross));
  const female = (input.gender ?? '').trim().toUpperCase().startsWith('F');
  const slabs = female && state.femaleSlabs?.length ? state.femaleSlabs : state.slabs;
  if (!slabs.length || gross.isZero()) return { stateCode: code, known: true, amount: zero };
  if (state.periodicity === 'HALF_YEARLY') {
    const slab = pickSlab(slabs, gross.times(6));
    return { stateCode: code, known: true, amount: M.round2(M.div(slab?.amount ?? 0, 6)) };
  }
  const slab = pickSlab(slabs, gross);
  if (!slab) return { stateCode: code, known: true, amount: zero };
  const override = slab.monthOverrides?.[String(input.month)];
  return { stateCode: code, known: true, amount: M.round2(override ?? slab.amount) };
}
