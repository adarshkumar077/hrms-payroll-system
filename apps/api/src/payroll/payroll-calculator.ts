import * as M from '../common/money';
import {
  computeEsi,
  computeMonthlyTds,
  computePf,
  computePt,
  defaultStatutoryRules,
  financialYearOf,
  StatutoryRules,
  TaxRegimeCode,
} from './statutory';

/**
 * percent   = % of monthly gross (legacy manual override)
 * fixed     = fixed monthly amount (manual override)
 * statutory = computed by the statutory engine (src/payroll/statutory) from the rule tables
 */
export type DeductionMode = 'percent' | 'fixed' | 'statutory';

export type ToggleDeduction = {
  enabled: boolean;
  mode?: DeductionMode;
  value?: number;
  amount?: number;
};

export type EsdDeductionType = 'monthly' | 'one_time' | 'custom';

/** Employee Security Deposit — employee-wise, never auto-applied when disabled. */
export type EsdDeduction = {
  enabled: boolean;
  /** Amount deducted this payroll period (monthly installment or custom amount). */
  amount: number;
  /** monthly = every month; one_time = once until total met; custom = amount each month until total. */
  type?: EsdDeductionType;
  /** Target total security deposit (for one_time / custom). */
  totalAmount?: number;
  /** Cumulative amount already deducted (preserved across months). */
  deductedToDate?: number;
};

export type CustomDeduction = {
  name: string;
  amount: number;
  description?: string;
};

export type CustomAllowance = {
  name: string;
  amount: number;
};

export type EmployeePayrollConfigJson = {
  allowances: {
    basic: number;
    hra: number;
    medical: number;
    travel: number;
    internet: number;
    overtime: number;
    bonus: number;
    incentive: number;
    special: number;
    custom: CustomAllowance[];
  };
  deductions: {
    pf: ToggleDeduction;
    /** Income-tax TDS. statutory = slab engine; fixed = manual monthly amount. */
    tds: ToggleDeduction;
    /** Employee State Insurance (employee share). */
    esi: ToggleDeduction;
    esd: EsdDeduction;
    professionalTax: { enabled: boolean; amount: number; mode?: 'statutory' | 'fixed' };
    custom: CustomDeduction[];
  };
};

/** Statutory inputs for one employee and one payroll month. */
export type StatutoryContext = {
  rules: StatutoryRules;
  year: number;
  month: number;
  taxRegime?: TaxRegimeCode;
  /** Old regime: declared annual 80C/80D/… total. */
  declaredDeductions?: M.MoneyInput;
  ptState?: string | null;
  gender?: string | null;
  /** Taxable / ESI / PT gross for the month. Default: gross + allowances. */
  monthlyGross?: M.MoneyInput;
  /** Basic + DA for PF. Default: allowances.basic, else gross. */
  pfWage?: M.MoneyInput;
  /** Approved payroll earlier in this FY. */
  priorTaxableGross?: M.MoneyInput;
  priorTdsDeducted?: M.MoneyInput;
  priorProfessionalTax?: M.MoneyInput;
  /** ESI decision fixed at the start of the contribution period (null = decide on this month's gross). */
  esiPeriodEligible?: boolean | null;
};

export type StatutoryMode = 'statutory' | 'fixed' | 'percent' | 'off';

/** JSON-friendly statutory breakdown (stored on payroll_lines.statutory_json). */
export type StatutoryDetail = {
  financialYear: string;
  verifyWithCA: boolean;
  taxRegime: TaxRegimeCode;
  monthlyGross: number;
  modes: { pf: StatutoryMode; esi: StatutoryMode; tds: StatutoryMode; pt: StatutoryMode };
  pf: { actualWage: number; pfWage: number; employee: number; employerEps: number; employerEpf: number } | null;
  esi: { applicable: boolean; basis: string; employee: number; employer: number } | null;
  pt: { state: string; amount: number; knownState: boolean } | null;
  tds: {
    projectedAnnualGross: number;
    taxableIncome: number;
    annualTax: number;
    slabTax: number;
    rebate: number;
    surcharge: number;
    cess: number;
    priorTdsDeducted: number;
    monthsRemaining: number;
    monthlyTds: number;
  } | null;
};

export type PayrollPreview = {
  grossSalary: number;
  totalAllowances: number;
  pf: number;
  tds: number;
  /** ESI employee share. */
  esi: number;
  esd: number;
  professionalTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  esdRemainingBalance: number;
  esdDeductedToDate: number;
  /** Employer contributions (cost to company, not deducted from the employee). */
  employerPfEps: number;
  employerPfEpf: number;
  employerEsi: number;
  statutory: StatutoryDetail;
};

const ESD_DEFAULT_AMOUNT = 500;
/**
 * @deprecated The flat 1% TDS was replaced by the slab engine (T9). Kept only so legacy
 * `{ mode: 'percent', value: 1 }` TDS JSON can be recognised; it now migrates to `statutory`.
 */
export const TDS_PERCENT = 1;

/**
 * Exact decimal HALF_UP rounding to 2dp, returned as a JS number.
 * All money arithmetic in this file goes through Prisma.Decimal (see common/money.ts);
 * numbers only appear at the input/output boundary (config JSON and API shapes).
 */
function roundMoney(value: M.MoneyInput) {
  return M.toNumber(value);
}

/** Actual calendar days in month (1–12). Handles leap years. */
export function calendarDaysInMonth(year: number, month: number) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function defaultPayrollConfigJson(): EmployeePayrollConfigJson {
  return {
    allowances: {
      basic: 0,
      hra: 0,
      medical: 0,
      travel: 0,
      internet: 0,
      overtime: 0,
      bonus: 0,
      incentive: 0,
      special: 0,
      custom: [],
    },
    deductions: {
      pf: { enabled: false, mode: 'statutory', value: 0 },
      // TDS on by default, computed from the income-tax slabs.
      tds: { enabled: true, mode: 'statutory' },
      esi: { enabled: false, mode: 'statutory' },
      esd: {
        enabled: false,
        amount: ESD_DEFAULT_AMOUNT,
        type: 'monthly',
        totalAmount: ESD_DEFAULT_AMOUNT,
        deductedToDate: 0,
      },
      // PT on by default; 0 until the employee's PT state is set.
      professionalTax: { enabled: true, mode: 'statutory', amount: 0 },
      custom: [],
    },
  };
}

function normalizeEsd(raw?: Partial<EsdDeduction> | null): EsdDeduction {
  const base = defaultPayrollConfigJson().deductions.esd;
  if (!raw || typeof raw !== 'object') return { ...base };
  const type = (raw.type as EsdDeductionType) || 'monthly';
  const amount = Number(raw.amount ?? base.amount) || 0;
  return {
    enabled: !!raw.enabled,
    amount,
    type: type === 'one_time' || type === 'custom' ? type : 'monthly',
    totalAmount: Number(raw.totalAmount ?? amount) || 0,
    deductedToDate: Math.max(0, Number(raw.deductedToDate ?? 0) || 0),
  };
}

/** Merge partial/legacy DB JSON into a complete payroll config. */
export function normalizePayrollConfig(
  raw?: Partial<EmployeePayrollConfigJson> | null,
): EmployeePayrollConfigJson {
  const base = defaultPayrollConfigJson();
  if (!raw || typeof raw !== 'object') return base;
  const a = (raw.allowances ?? {}) as Partial<EmployeePayrollConfigJson['allowances']>;
  const d = (raw.deductions ?? {}) as Partial<EmployeePayrollConfigJson['deductions']>;
  return {
    allowances: {
      ...base.allowances,
      ...a,
      custom: Array.isArray(a.custom) ? a.custom : [],
    },
    deductions: {
      pf: normalizePf(d.pf),
      tds: normalizeTds(d.tds),
      esi: { ...base.deductions.esi, ...(d.esi ?? {}) },
      esd: normalizeEsd(d.esd as Partial<EsdDeduction>),
      professionalTax: normalizePt(d.professionalTax),
      custom: Array.isArray(d.custom) ? d.custom : [],
    },
  };
}

/** Legacy PF JSON keeps its mode (fixed / percent = manual override); a missing mode = statutory. */
function normalizePf(raw?: Partial<ToggleDeduction> | null): ToggleDeduction {
  const base = defaultPayrollConfigJson().deductions.pf;
  if (!raw || typeof raw !== 'object') return { ...base };
  return { ...base, ...raw, enabled: !!raw.enabled, mode: raw.mode ?? 'statutory' };
}

/**
 * Legacy TDS JSON was forced to `{ enabled: true, mode: 'percent', value: 1 }` (flat 1%).
 * That was never a per-employee choice, so it migrates to the slab engine. `fixed` is kept
 * as a manual override.
 */
function normalizeTds(raw?: Partial<ToggleDeduction> | null): ToggleDeduction {
  if (!raw || typeof raw !== 'object') return { enabled: true, mode: 'statutory' };
  if (raw.mode === 'fixed') {
    return { enabled: raw.enabled !== false, mode: 'fixed', value: raw.value ?? raw.amount ?? 0 };
  }
  return { enabled: raw.enabled !== false, mode: 'statutory' };
}

/** Legacy PT JSON had no mode: a positive amount stays a fixed override, otherwise statutory. */
function normalizePt(
  raw?: Partial<EmployeePayrollConfigJson['deductions']['professionalTax']> | null,
): EmployeePayrollConfigJson['deductions']['professionalTax'] {
  const base = defaultPayrollConfigJson().deductions.professionalTax;
  if (!raw || typeof raw !== 'object') return { ...base };
  const amount = Number(raw.amount ?? 0) || 0;
  const mode =
    raw.mode === 'fixed' || raw.mode === 'statutory' ? raw.mode : amount > 0 ? 'fixed' : 'statutory';
  return { enabled: raw.enabled ?? base.enabled, amount, mode };
}

/**
 * Per-day salary = Monthly Gross ÷ actual calendar days of the selected month.
 * Do not use a fixed 30-day divisor. Optional override only when explicitly provided
 * and positive (legacy); callers for attendance/payroll should omit override.
 * The result is the 2dp display rate; for LOP / proration use calcProratedAmount so the
 * rate is not rounded before it is multiplied by a day count.
 */
export function calcDailySalary(grossMonthly: M.MoneyInput, calendarDays = 30, override?: M.MoneyInput) {
  if (override != null && M.money(override).greaterThan(0)) return roundMoney(override);
  if (calendarDays <= 0) return 0;
  return roundMoney(M.div(grossMonthly, calendarDays));
}

/**
 * gross × days ÷ calendarDays, computed in full precision and rounded HALF_UP to 2dp once.
 * Used for LOP deductions and pro-rated pay.
 */
export function calcProratedAmount(grossMonthly: M.MoneyInput, days: number, calendarDays: number) {
  if (calendarDays <= 0) return 0;
  return roundMoney(M.div(M.mul(grossMonthly, days), calendarDays));
}

function calcToggleDeduction(base: M.MoneyInput, item?: ToggleDeduction | null) {
  if (!item?.enabled) return 0;
  if (item.mode === 'percent') return roundMoney(M.percentOf(base, item.value ?? 0));
  return roundMoney(item.value ?? item.amount ?? 0);
}

/** Default statutory context: built-in rules for the current FY, new regime, no PT state, steady state. */
export function defaultStatutoryContext(now = new Date()): StatutoryContext {
  const fy = financialYearOf(now.getFullYear(), now.getMonth() + 1);
  // Steady-state estimate: treat the month as April (12 months to go, nothing paid yet),
  // so monthly TDS = annual tax ÷ 12.
  return { rules: defaultStatutoryRules(fy), year: Number(fy.slice(0, 4)), month: 4, taxRegime: 'NEW' };
}

/**
 * Estimated monthly TDS for a monthly taxable gross (gross × 12 annualised, monthly = annual tax ÷ 12,
 * nearest rupee). Default rules: new regime. Replaces the old flat 1% TDS.
 */
export function calcEstimatedMonthlyTds(
  monthlyGross: M.MoneyInput,
  ctx: StatutoryContext = defaultStatutoryContext(),
) {
  return roundMoney(
    computeMonthlyTds({
      regime: ctx.taxRegime ?? 'NEW',
      rules: ctx.rules,
      month: ctx.month,
      monthlyTaxableGross: M.nonNegative(monthlyGross),
      declaredDeductions: ctx.declaredDeductions,
    }).monthlyTds,
  );
}

/** @deprecated Old name of calcEstimatedMonthlyTds (was a flat 1%; now the slab engine). */
export function calcMandatoryTds(applicableMonthlySalary: M.MoneyInput) {
  return calcEstimatedMonthlyTds(applicableMonthlySalary);
}

/**
 * Compute this month's ESD deduction without mutating stored deductedToDate.
 * one_time: full amount once until deductedToDate covers total.
 * custom: installment `amount` each month until total reached.
 * monthly: fixed `amount` every month (remaining tracked if totalAmount set).
 */
export function calcEsdForMonth(esdInput?: Partial<EsdDeduction> | null): {
  amount: number;
  remainingBalance: number;
  deductedToDate: number;
  type: EsdDeductionType;
} {
  const esd = normalizeEsd(esdInput);
  const deducted = M.nonNegative(esd.deductedToDate ?? 0);
  const total = M.nonNegative(esd.totalAmount ?? esd.amount ?? 0);
  const esdAmount = M.money(esd.amount);
  const type = esd.type ?? 'monthly';

  if (!esd.enabled) {
    return {
      amount: 0,
      remainingBalance: roundMoney(M.nonNegative(total.minus(deducted))),
      deductedToDate: roundMoney(deducted),
      type,
    };
  }

  if (type === 'one_time') {
    const target = total.greaterThan(0) ? total : esdAmount;
    if (deducted.greaterThanOrEqualTo(target) && target.greaterThan(0)) {
      return { amount: 0, remainingBalance: 0, deductedToDate: roundMoney(deducted), type };
    }
    const amount = M.round2(target.greaterThan(0) ? target : esdAmount);
    return {
      amount: roundMoney(amount),
      remainingBalance: 0,
      deductedToDate: roundMoney(deducted.plus(amount)),
      type,
    };
  }

  if (type === 'custom') {
    const rem = total.greaterThan(0) ? M.nonNegative(total.minus(deducted)) : esdAmount;
    const amount = M.round2(M.min(esdAmount, rem.greaterThan(0) ? rem : esdAmount));
    const nextDeducted = deducted.plus(amount);
    return {
      amount: roundMoney(amount),
      remainingBalance: total.greaterThan(0) ? roundMoney(M.nonNegative(total.minus(nextDeducted))) : 0,
      deductedToDate: roundMoney(nextDeducted),
      type,
    };
  }

  // monthly
  const amount = M.round2(esdAmount);
  const nextDeducted = deducted.plus(amount);
  return {
    amount: roundMoney(amount),
    remainingBalance: total.greaterThan(0) ? roundMoney(M.nonNegative(total.minus(nextDeducted))) : 0,
    deductedToDate: roundMoney(nextDeducted),
    type: 'monthly',
  };
}

function modeOf(item: { enabled: boolean; mode?: DeductionMode } | undefined): StatutoryMode {
  if (!item?.enabled) return 'off';
  return item.mode ?? 'statutory';
}

/**
 * Payroll preview / statutory calculation for one employee-month.
 *
 * PF, ESI, TDS and PT each follow the employee's toggle: off → 0; fixed / percent → the manual
 * override; statutory → the rule-table engine (src/payroll/statutory). Without a `statutory`
 * context the built-in defaults are used (new regime, no PT state, steady-state TDS).
 */
export function calcPayrollPreview(input: {
  grossMonthly: M.MoneyInput;
  config: EmployeePayrollConfigJson;
  statutory?: StatutoryContext;
}): PayrollPreview {
  const config = normalizePayrollConfig(input.config);
  const ctx = input.statutory ?? defaultStatutoryContext();
  const rules = ctx.rules;
  const regime: TaxRegimeCode = ctx.taxRegime ?? 'NEW';
  const a = config.allowances;
  const d = config.deductions;
  // Each line item is rounded to 2dp first; totals are exact sums of the rounded lines.
  const r2 = M.round2;
  const totalAllowances = M.add(
    r2(a.basic),
    r2(a.hra),
    r2(a.medical),
    r2(a.travel),
    r2(a.internet),
    r2(a.overtime),
    r2(a.bonus),
    r2(a.incentive),
    r2(a.special),
    M.sumBy(a.custom ?? [], (c) => r2(c.amount)),
  );

  const gross = r2(input.grossMonthly);
  const grossWithAllowances = gross.plus(totalAllowances);
  const statGross = r2(M.nonNegative(ctx.monthlyGross ?? grossWithAllowances));
  const pfWageInput = ctx.pfWage ?? (M.money(a.basic).greaterThan(0) ? a.basic : gross);
  const zero = M.money(0);

  const modes = {
    pf: modeOf(d.pf),
    esi: modeOf(d.esi),
    tds: modeOf(d.tds),
    pt: modeOf(d.professionalTax),
  };

  // PF (employee share deducted; employer EPS/EPF reported separately)
  let pf = zero;
  let employerPfEps = zero;
  let employerPfEpf = zero;
  let pfDetail: StatutoryDetail['pf'] = null;
  if (modes.pf === 'statutory') {
    const res = computePf({ basicPlusDa: pfWageInput, rules });
    pf = res.employee;
    employerPfEps = res.employerEps;
    employerPfEpf = res.employerEpf;
    pfDetail = {
      actualWage: roundMoney(res.actualWage),
      pfWage: roundMoney(res.pfWage),
      employee: roundMoney(res.employee),
      employerEps: roundMoney(res.employerEps),
      employerEpf: roundMoney(res.employerEpf),
    };
  } else if (modes.pf !== 'off') {
    pf = M.money(calcToggleDeduction(gross, d.pf));
  }

  // ESI
  let esi = zero;
  let employerEsi = zero;
  let esiDetail: StatutoryDetail['esi'] = null;
  if (modes.esi === 'statutory') {
    const res = computeEsi({ monthlyGross: statGross, rules, periodEligible: ctx.esiPeriodEligible });
    esi = res.employee;
    employerEsi = res.employer;
    esiDetail = {
      applicable: res.applicable,
      basis: res.basis,
      employee: roundMoney(res.employee),
      employer: roundMoney(res.employer),
    };
  } else if (modes.esi !== 'off') {
    esi = M.money(calcToggleDeduction(statGross, d.esi));
  }

  // Professional tax
  let professionalTax = zero;
  let ptDetail: StatutoryDetail['pt'] = null;
  if (modes.pt === 'statutory') {
    const res = computePt({
      monthlyGross: statGross,
      stateCode: ctx.ptState,
      month: ctx.month,
      rules,
      gender: ctx.gender,
    });
    professionalTax = res.amount;
    ptDetail = { state: res.stateCode, amount: roundMoney(res.amount), knownState: res.known };
  } else if (modes.pt !== 'off') {
    professionalTax = r2(d.professionalTax.amount ?? 0);
  }

  // TDS (after PT, which the old regime deducts u/s 16(iii))
  let tds = zero;
  let tdsDetail: StatutoryDetail['tds'] = null;
  if (modes.tds === 'statutory') {
    const res = computeMonthlyTds({
      regime,
      rules,
      month: ctx.month,
      monthlyTaxableGross: statGross,
      priorTaxableGross: ctx.priorTaxableGross,
      priorTdsDeducted: ctx.priorTdsDeducted,
      declaredDeductions: ctx.declaredDeductions,
      monthlyProfessionalTax: professionalTax,
      priorProfessionalTax: ctx.priorProfessionalTax,
    });
    tds = res.monthlyTds;
    tdsDetail = {
      projectedAnnualGross: roundMoney(res.projectedAnnualGross),
      taxableIncome: roundMoney(res.annualTax.taxableIncome),
      annualTax: roundMoney(res.annualTax.totalTax),
      slabTax: roundMoney(res.annualTax.slabTax),
      rebate: roundMoney(res.annualTax.rebate),
      surcharge: roundMoney(res.annualTax.surcharge),
      cess: roundMoney(res.annualTax.cess),
      priorTdsDeducted: roundMoney(res.priorTdsDeducted),
      monthsRemaining: res.monthsRemaining,
      monthlyTds: roundMoney(res.monthlyTds),
    };
  } else if (modes.tds !== 'off') {
    tds = M.money(calcToggleDeduction(statGross, d.tds));
  }

  const esdCalc = calcEsdForMonth(d.esd);
  const esd = M.money(esdCalc.amount);
  const otherDeductions = M.sumBy(d.custom ?? [], (c) => r2(c.amount));

  let totalDeductions = M.add(pf, esi, tds, esd, professionalTax, otherDeductions);
  if (totalDeductions.greaterThan(grossWithAllowances)) {
    totalDeductions = grossWithAllowances;
  }
  const netSalary = roundMoney(M.nonNegative(grossWithAllowances.minus(totalDeductions)));

  return {
    grossSalary: roundMoney(gross),
    totalAllowances: roundMoney(totalAllowances),
    pf: roundMoney(pf),
    tds: roundMoney(tds),
    esi: roundMoney(esi),
    esd: roundMoney(esd),
    professionalTax: roundMoney(professionalTax),
    otherDeductions: roundMoney(otherDeductions),
    totalDeductions: roundMoney(totalDeductions),
    netSalary,
    esdRemainingBalance: esdCalc.remainingBalance,
    esdDeductedToDate: roundMoney(M.nonNegative(d.esd.deductedToDate ?? 0)),
    employerPfEps: roundMoney(employerPfEps),
    employerPfEpf: roundMoney(employerPfEpf),
    employerEsi: roundMoney(employerEsi),
    statutory: {
      financialYear: rules.financialYear,
      verifyWithCA: rules.verifyWithCA,
      taxRegime: regime,
      monthlyGross: roundMoney(statGross),
      modes,
      pf: pfDetail,
      esi: esiDetail,
      pt: ptDetail,
      tds: tdsDetail,
    },
  };
}

/**
 * Final net payable for an attendance month (gross-based settlement).
 * HD deductions are applied once (normal vs late split); PF/ESD only when enabled.
 */
export function calcMonthNetPayable(input: {
  grossMonthly: M.MoneyInput;
  overtimeEarnings?: M.MoneyInput;
  absentDeduction: M.MoneyInput;
  normalHalfDayDeduction: M.MoneyInput;
  lateConversionDeduction: M.MoneyInput;
  pf: M.MoneyInput;
  esd: M.MoneyInput;
  tds: M.MoneyInput;
  otherDeductions: M.MoneyInput;
}) {
  const nn = (v: M.MoneyInput) => M.round2(M.nonNegative(v));
  const gross = nn(input.grossMonthly);
  const ot = nn(input.overtimeEarnings ?? 0);
  const totalDed = M.add(
    nn(input.absentDeduction),
    nn(input.normalHalfDayDeduction),
    nn(input.lateConversionDeduction),
    nn(input.pf),
    nn(input.esd),
    nn(input.tds),
    nn(input.otherDeductions),
  );
  return roundMoney(M.nonNegative(gross.plus(ot).minus(totalDed)));
}

/**
 * Payslip totals from line items. Each line is rounded HALF_UP to 2dp, gross and deductions
 * are exact sums of the rounded lines, and net = max(0, gross − deductions) exactly.
 */
export function calcPayslipTotals(
  earnings: { amount: M.MoneyInput }[],
  deductions: { amount: M.MoneyInput }[],
) {
  const gross = M.sumBy(earnings, (e) => M.round2(e.amount));
  const totalDeductions = M.sumBy(deductions, (d) => M.round2(d.amount));
  const net = M.nonNegative(gross.minus(totalDeductions));
  return { gross, totalDeductions, net };
}

/**
 * EMI = P·r·(1+r)^n / ((1+r)^n − 1) with r = annual% ÷ 12 ÷ 100; P ÷ n when interest-free.
 * Rounded HALF_UP to 2dp.
 */
export function calcEmi(principal: M.MoneyInput, annualRatePercent: number, tenureMonths: number) {
  if (tenureMonths <= 0) return 0;
  const p = M.round2(principal);
  const r = M.div(M.div(annualRatePercent || 0, 100), 12);
  if (r.isZero()) return roundMoney(M.div(p, tenureMonths));
  const growth = r.plus(1).pow(tenureMonths);
  return roundMoney(M.div(p.times(r).times(growth), growth.minus(1)));
}

/**
 * Installment amounts for a loan schedule. Each installment is the stored EMI; for an
 * interest-free loan the final installment absorbs the paise remainder so the schedule
 * sums exactly to the principal (10,000 / 3 → 3,333.33 + 3,333.33 + 3,333.34).
 */
export function buildEmiAmounts(input: {
  principal: M.MoneyInput;
  emiAmount: M.MoneyInput;
  tenureMonths: number;
  interestRate: M.MoneyInput;
}): M.Decimal[] {
  const n = Math.max(0, Math.floor(input.tenureMonths));
  const emi = M.round2(input.emiAmount);
  const interestFree = M.money(input.interestRate).isZero();
  const out: M.Decimal[] = [];
  let scheduled = M.money(0);
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const amount =
      interestFree && isLast ? M.round2(M.nonNegative(M.sub(input.principal, scheduled))) : emi;
    scheduled = scheduled.plus(amount);
    out.push(amount);
  }
  return out;
}

export type DailyEarningResult = {
  amount: number;
  label: string;
  color: 'green' | 'red' | 'orange' | 'blue' | 'purple' | 'gray';
};

export function calcDailyEarning(
  status: string,
  dailySalary: M.MoneyInput,
  opts?: { workedOnWeekOff?: boolean; holidayPaid?: boolean },
): DailyEarningResult {
  const d = M.round2(dailySalary);
  const amt = (v: M.MoneyInput) => roundMoney(v);
  switch (status) {
    case 'P':
    case 'WFH':
    case 'OD':
      return { amount: amt(d), label: 'Present', color: 'green' };
    case 'A':
    case 'ULOB':
      return { amount: amt(d.negated()), label: 'Absent', color: 'red' };
    case 'HD':
      return { amount: amt(M.div(d, 2)), label: 'Half Day', color: 'orange' };
    case 'PL':
      return { amount: amt(d), label: 'Paid Leave', color: 'blue' };
    case 'H':
    case 'PH':
      return {
        amount: opts?.holidayPaid !== false ? amt(d) : 0,
        label: status === 'PH' ? 'Paid Holiday' : 'Holiday',
        color: 'purple',
      };
    case 'WO':
      if (opts?.workedOnWeekOff) {
        return { amount: amt(M.mul(d, 2)), label: 'Week Off (Worked)', color: 'purple' };
      }
      return { amount: amt(d), label: 'Week Off', color: 'purple' };
    case 'L':
      return { amount: amt(d), label: 'Late', color: 'green' };
    default:
      return { amount: 0, label: status, color: 'gray' };
  }
}
