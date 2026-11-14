/**
 * percent / fixed = manual override; statutory = computed by the API's statutory engine
 * (income-tax slabs, PF, ESI, PT rule tables). The local preview cannot compute statutory
 * amounts — use the API preview (POST /employees/:id/payroll-config/preview) for those.
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
    /** statutory = income-tax slab engine (server); fixed = manual monthly TDS. */
    tds: ToggleDeduction;
    /** Employee State Insurance (employee share). */
    esi: ToggleDeduction;
    esd: EsdDeduction;
    professionalTax: { enabled: boolean; amount: number; mode?: 'statutory' | 'fixed' };
    custom: CustomDeduction[];
  };
};

export type PayrollPreview = {
  grossSalary: number;
  totalAllowances: number;
  pf: number;
  tds: number;
  esi?: number;
  esd: number;
  professionalTax: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  esdRemainingBalance: number;
  esdDeductedToDate: number;
  /** Server preview only. */
  employerPfEps?: number;
  employerPfEpf?: number;
  employerEsi?: number;
  /** Local preview: true when some deductions are statutory and therefore not included. */
  statutoryPending?: boolean;
  statutory?: {
    financialYear: string;
    verifyWithCA: boolean;
    taxRegime: 'NEW' | 'OLD';
    monthlyGross: number;
    tds: { projectedAnnualGross: number; taxableIncome: number; annualTax: number } | null;
    esi: { applicable: boolean; basis: string } | null;
    pt: { state: string; amount: number } | null;
  };
};

export const TAX_REGIMES = [
  { value: 'NEW', label: 'New regime (default)' },
  { value: 'OLD', label: 'Old regime' },
] as const;

export const PT_STATES = [
  { value: 'NONE', label: 'None / not applicable' },
  { value: 'MH', label: 'Maharashtra' },
  { value: 'KA', label: 'Karnataka' },
  { value: 'WB', label: 'West Bengal' },
  { value: 'TN', label: 'Tamil Nadu' },
  { value: 'TS', label: 'Telangana' },
  { value: 'AP', label: 'Andhra Pradesh' },
  { value: 'GJ', label: 'Gujarat' },
] as const;

const ESD_DEFAULT_AMOUNT = 500;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
      tds: { enabled: true, mode: 'statutory' },
      esi: { enabled: false, mode: 'statutory' },
      esd: {
        enabled: false,
        amount: ESD_DEFAULT_AMOUNT,
        type: 'monthly',
        totalAmount: ESD_DEFAULT_AMOUNT,
        deductedToDate: 0,
      },
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
      // Mirrors the API's normalizePayrollConfig (apps/api/src/payroll/payroll-calculator.ts).
      pf: d.pf
        ? { ...base.deductions.pf, ...d.pf, enabled: !!d.pf.enabled, mode: d.pf.mode ?? 'statutory' }
        : base.deductions.pf,
      tds:
        d.tds?.mode === 'fixed'
          ? { enabled: d.tds.enabled !== false, mode: 'fixed', value: d.tds.value ?? d.tds.amount ?? 0 }
          : { enabled: d.tds?.enabled !== false, mode: 'statutory' },
      esi: { ...base.deductions.esi, ...(d.esi ?? {}) },
      esd: normalizeEsd(d.esd as Partial<EsdDeduction>),
      professionalTax: d.professionalTax
        ? {
            enabled: d.professionalTax.enabled ?? true,
            amount: Number(d.professionalTax.amount ?? 0) || 0,
            mode:
              d.professionalTax.mode ??
              ((Number(d.professionalTax.amount ?? 0) || 0) > 0 ? 'fixed' : 'statutory'),
          }
        : base.deductions.professionalTax,
      custom: Array.isArray(d.custom) ? d.custom : [],
    },
  };
}

/**
 * Per-day salary = Monthly Gross ÷ actual calendar days of the selected month.
 * Do not use a fixed 30-day divisor. Optional override only when explicitly provided
 * and positive (legacy); callers for attendance/payroll should omit override.
 */
export function calcDailySalary(grossMonthly: number, calendarDays = 30, override?: number) {
  if (override != null && override > 0) return roundMoney(override);
  if (calendarDays <= 0) return 0;
  return roundMoney(grossMonthly / calendarDays);
}

/** Manual (fixed / percent) deduction; statutory amounts are computed by the API, so 0 here. */
function calcToggleDeduction(base: number, item?: ToggleDeduction | null) {
  if (!item?.enabled || item.mode === 'statutory') return 0;
  if (item.mode === 'percent') return roundMoney((base * (item.value ?? 0)) / 100);
  return roundMoney(item.value ?? item.amount ?? 0);
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
  const deducted = Math.max(0, esd.deductedToDate ?? 0);
  const total = Math.max(0, esd.totalAmount ?? esd.amount ?? 0);
  const type = esd.type ?? 'monthly';

  if (!esd.enabled) {
    return {
      amount: 0,
      remainingBalance: Math.max(0, total - deducted),
      deductedToDate: deducted,
      type,
    };
  }

  if (type === 'one_time') {
    const target = total > 0 ? total : esd.amount;
    if (deducted >= target && target > 0) {
      return { amount: 0, remainingBalance: 0, deductedToDate: deducted, type };
    }
    const amount = roundMoney(target > 0 ? target : esd.amount);
    return {
      amount,
      remainingBalance: 0,
      deductedToDate: deducted + amount,
      type,
    };
  }

  if (type === 'custom') {
    const rem = total > 0 ? Math.max(0, total - deducted) : esd.amount;
    const amount = roundMoney(Math.min(esd.amount, rem > 0 ? rem : esd.amount));
    const nextDeducted = deducted + amount;
    return {
      amount,
      remainingBalance: total > 0 ? Math.max(0, total - nextDeducted) : 0,
      deductedToDate: nextDeducted,
      type,
    };
  }

  // monthly
  const amount = roundMoney(esd.amount);
  const nextDeducted = deducted + amount;
  return {
    amount,
    remainingBalance: total > 0 ? Math.max(0, total - nextDeducted) : 0,
    deductedToDate: nextDeducted,
    type: 'monthly',
  };
}

export function calcPayrollPreview(input: {
  grossMonthly: number;
  config: EmployeePayrollConfigJson;
}): PayrollPreview {
  const { grossMonthly } = input;
  const config = normalizePayrollConfig(input.config);
  const a = config.allowances;
  const totalAllowances =
    (a.basic ?? 0) +
    (a.hra ?? 0) +
    (a.medical ?? 0) +
    (a.travel ?? 0) +
    (a.internet ?? 0) +
    (a.overtime ?? 0) +
    (a.bonus ?? 0) +
    (a.incentive ?? 0) +
    (a.special ?? 0) +
    (a.custom ?? []).reduce((s, c) => s + (c.amount ?? 0), 0);

  const d = config.deductions;
  const grossWithAllowancesForPct = grossMonthly + totalAllowances;
  const pf = calcToggleDeduction(grossMonthly, d.pf);
  const tds = calcToggleDeduction(grossWithAllowancesForPct, d.tds);
  const esi = calcToggleDeduction(grossWithAllowancesForPct, d.esi);
  const esdCalc = calcEsdForMonth(d.esd);
  const esd = esdCalc.amount;
  const professionalTax =
    d.professionalTax.enabled && d.professionalTax.mode === 'fixed'
      ? roundMoney(d.professionalTax.amount ?? 0)
      : 0;
  const statutoryPending = [d.pf, d.tds, d.esi, d.professionalTax].some(
    (x) => x.enabled && (x.mode ?? 'statutory') === 'statutory',
  );
  const otherDeductions = (config.deductions.custom ?? []).reduce(
    (s, c) => s + (c.amount ?? 0),
    0,
  );

  let totalDeductions = pf + tds + esi + esd + professionalTax + otherDeductions;
  const grossWithAllowances = grossMonthly + totalAllowances;
  if (totalDeductions > grossWithAllowances) {
    totalDeductions = grossWithAllowances;
  }
  const netSalary = roundMoney(Math.max(0, grossWithAllowances - totalDeductions));

  return {
    grossSalary: roundMoney(grossMonthly),
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
    esdDeductedToDate: Math.max(0, (config.deductions.esd.deductedToDate ?? 0)),
    statutoryPending,
  };
}

/**
 * Final net payable for an attendance month (gross-based settlement).
 * HD deductions are applied once (normal vs late split); PF/ESD only when enabled.
 */
export function calcMonthNetPayable(input: {
  grossMonthly: number;
  overtimeEarnings?: number;
  absentDeduction: number;
  normalHalfDayDeduction: number;
  lateConversionDeduction: number;
  pf: number;
  esd: number;
  tds: number;
  otherDeductions: number;
}) {
  const gross = Math.max(0, input.grossMonthly);
  const ot = Math.max(0, input.overtimeEarnings ?? 0);
  const totalDed =
    Math.max(0, input.absentDeduction) +
    Math.max(0, input.normalHalfDayDeduction) +
    Math.max(0, input.lateConversionDeduction) +
    Math.max(0, input.pf) +
    Math.max(0, input.esd) +
    Math.max(0, input.tds) +
    Math.max(0, input.otherDeductions);
  return roundMoney(Math.max(0, gross + ot - totalDed));
}

export type DailyEarningResult = {
  amount: number;
  label: string;
  color: 'green' | 'red' | 'orange' | 'blue' | 'purple' | 'gray';
};

export function calcDailyEarning(
  status: string,
  dailySalary: number,
  opts?: { workedOnWeekOff?: boolean; holidayPaid?: boolean },
): DailyEarningResult {
  const d = dailySalary;
  switch (status) {
    case 'P':
    case 'WFH':
    case 'OD':
      return { amount: d, label: 'Present', color: 'green' };
    case 'A':
    case 'ULOB':
      return { amount: -d, label: 'Absent', color: 'red' };
    case 'HD':
      return { amount: d / 2, label: 'Half Day', color: 'orange' };
    case 'PL':
      return { amount: d, label: 'Paid Leave', color: 'blue' };
    case 'H':
    case 'PH':
      return {
        amount: opts?.holidayPaid !== false ? d : 0,
        label: status === 'PH' ? 'Paid Holiday' : 'Holiday',
        color: 'purple',
      };
    case 'WO':
      if (opts?.workedOnWeekOff) {
        return { amount: d * 2, label: 'Week Off (Worked)', color: 'purple' };
      }
      return { amount: d, label: 'Week Off', color: 'purple' };
    case 'L':
      return { amount: d, label: 'Late', color: 'green' };
    default:
      return { amount: 0, label: status, color: 'gray' };
  }
}

export const EARNING_COLOR_CLASS: Record<DailyEarningResult['color'], string> = {
  green: 'text-emerald-700',
  red: 'text-red-700',
  orange: 'text-amber-700',
  blue: 'text-blue-700',
  purple: 'text-purple-700',
  gray: 'text-ink/60',
};

export function formatEarningAmount(amount: number) {
  const abs = Math.round((Math.abs(amount) + Number.EPSILON) * 100) / 100;
  const formatted = abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (amount < 0) return `-₹${formatted}`;
  if (amount > 0) return `+₹${formatted}`;
  return `₹0.00`;
}
