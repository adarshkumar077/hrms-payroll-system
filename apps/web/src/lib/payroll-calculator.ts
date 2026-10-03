export type DeductionMode = 'percent' | 'fixed';

export type ToggleDeduction = {
  enabled: boolean;
  mode?: DeductionMode;
  value?: number;
  amount?: number;
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
    tds: ToggleDeduction;
    esd: { enabled: boolean; amount: number };
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
};

const PF_DEFAULT_AMOUNT = 3600;
const ESD_DEFAULT_AMOUNT = 500;
const TDS_DEFAULT_PERCENT = 1;

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
      tds: { enabled: false, mode: 'percent', value: TDS_DEFAULT_PERCENT },
      esd: { enabled: false, amount: ESD_DEFAULT_AMOUNT },
      professionalTax: { enabled: false, amount: 0 },
      custom: [],
    },
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
      tds: { ...base.deductions.tds, ...(d.tds ?? {}) },
      esd: { ...base.deductions.esd, ...(d.esd ?? {}) },
      professionalTax: { ...base.deductions.professionalTax, ...(d.professionalTax ?? {}) },
      custom: Array.isArray(d.custom) ? d.custom : [],
    },
  };
}

export function calcDailySalary(grossMonthly: number, workingDays = 30, override?: number) {
  if (override != null && override > 0) return roundMoney(override);
  if (workingDays <= 0) return 0;
  return roundMoney(grossMonthly / workingDays);
}

function calcToggleDeduction(base: number, item?: ToggleDeduction | null) {
  if (!item?.enabled) return 0;
  if (item.mode === 'percent') return roundMoney((base * (item.value ?? 0)) / 100);
  return roundMoney(item.value ?? item.amount ?? 0);
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

  const pf = calcToggleDeduction(grossMonthly, config.deductions.pf);
  const tds = calcToggleDeduction(grossMonthly, config.deductions.tds);
  const esd = config.deductions.esd.enabled ? roundMoney(config.deductions.esd.amount ?? 0) : 0;
  const professionalTax = config.deductions.professionalTax.enabled
    ? roundMoney(config.deductions.professionalTax.amount ?? 0)
    : 0;
  const otherDeductions = (config.deductions.custom ?? []).reduce(
    (s, c) => s + (c.amount ?? 0),
    0,
  );

  let totalDeductions = pf + tds + esd + professionalTax + otherDeductions;
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
    esd: roundMoney(esd),
    professionalTax: roundMoney(professionalTax),
    otherDeductions: roundMoney(otherDeductions),
    totalDeductions: roundMoney(totalDeductions),
    netSalary,
  };
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
  const abs = roundMoney(Math.abs(amount)).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (amount < 0) return `-₹${abs}`;
  if (amount > 0) return `+₹${abs}`;
  return `₹0.00`;
}
