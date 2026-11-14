import * as M from '../common/money';

export type DeductionMode = 'percent' | 'fixed';

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
    /** Always applied at 1% of applicable salary — enable flag kept for legacy JSON. */
    tds: ToggleDeduction;
    esd: EsdDeduction;
    professionalTax: { enabled: boolean; amount: number };
    custom: CustomDeduction[];
  };
};

export type PayrollPreview = {
  grossSalary: number;
  totalAllowances: number;
  pf: number;
  tds: number;
  esd: number;
  professionalTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  esdRemainingBalance: number;
  esdDeductedToDate: number;
};

const PF_DEFAULT_AMOUNT = 3600;
const ESD_DEFAULT_AMOUNT = 500;
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
      pf: { enabled: false, mode: 'fixed', value: PF_DEFAULT_AMOUNT },
      // Mandatory 1% TDS — always on for new configs.
      tds: { enabled: true, mode: 'percent', value: TDS_PERCENT },
      esd: {
        enabled: false,
        amount: ESD_DEFAULT_AMOUNT,
        type: 'monthly',
        totalAmount: ESD_DEFAULT_AMOUNT,
        deductedToDate: 0,
      },
      professionalTax: { enabled: false, amount: 0 },
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
      pf: { ...base.deductions.pf, ...(d.pf ?? {}) },
      tds: {
        ...base.deductions.tds,
        ...(d.tds ?? {}),
        enabled: true,
        mode: 'percent',
        value: TDS_PERCENT,
      },
      esd: normalizeEsd(d.esd as Partial<EsdDeduction>),
      professionalTax: { ...base.deductions.professionalTax, ...(d.professionalTax ?? {}) },
      custom: Array.isArray(d.custom) ? d.custom : [],
    },
  };
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

/** Mandatory 1% TDS on applicable monthly salary (gross). */
export function calcMandatoryTds(applicableMonthlySalary: M.MoneyInput) {
  return roundMoney(M.percentOf(M.nonNegative(applicableMonthlySalary), TDS_PERCENT));
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

export function calcPayrollPreview(input: {
  grossMonthly: M.MoneyInput;
  config: EmployeePayrollConfigJson;
}): PayrollPreview {
  const config = normalizePayrollConfig(input.config);
  const a = config.allowances;
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
  const pf = M.money(calcToggleDeduction(gross, config.deductions.pf));
  // Mandatory 1% TDS for every employee — never skip / never duplicate via toggle off.
  const tds = M.money(calcMandatoryTds(gross));
  const esdCalc = calcEsdForMonth(config.deductions.esd);
  const esd = M.money(esdCalc.amount);
  const professionalTax = config.deductions.professionalTax.enabled
    ? r2(config.deductions.professionalTax.amount ?? 0)
    : M.money(0);
  const otherDeductions = M.sumBy(config.deductions.custom ?? [], (c) => r2(c.amount));

  let totalDeductions = M.add(pf, tds, esd, professionalTax, otherDeductions);
  const grossWithAllowances = gross.plus(totalAllowances);
  if (totalDeductions.greaterThan(grossWithAllowances)) {
    totalDeductions = grossWithAllowances;
  }
  const netSalary = roundMoney(M.nonNegative(grossWithAllowances.minus(totalDeductions)));

  return {
    grossSalary: roundMoney(gross),
    totalAllowances: roundMoney(totalAllowances),
    pf: roundMoney(pf),
    tds: roundMoney(tds),
    esd: roundMoney(esd),
    professionalTax: roundMoney(professionalTax),
    otherDeductions: roundMoney(otherDeductions),
    totalDeductions: roundMoney(totalDeductions),
    netSalary,
    esdRemainingBalance: esdCalc.remainingBalance,
    esdDeductedToDate: roundMoney(M.nonNegative(config.deductions.esd.deductedToDate ?? 0)),
  };
}

/**
 * Final net payable for an attendance month (gross-based settlement).
 * HD deductions are applied once (normal vs late split); PF/ESD only when enabled; TDS always 1%.
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
