/**
 * Statutory payroll rule tables (India). Stored as JSON in `statutory_rule_sets.rules`
 * (one row per company per financial year) and validated by `parseStatutoryRules`.
 *
 * All amounts are INR. Rates are percentages (12 means 12%).
 * See docs/PAYROLL-RULES.md. VERIFY WITH CA BEFORE GO-LIVE.
 */

export type TaxRegimeCode = 'NEW' | 'OLD';

/** Rounding for a computed contribution line. */
export type RoundingMode =
  /** HALF_UP to 2dp (money.ts default). */
  | 'PAISA'
  /** HALF_UP to the nearest rupee. */
  | 'RUPEE'
  /** Round up to the next whole rupee (ESIC practice). */
  | 'CEIL_RUPEE';

export type TaxSlab = {
  /** Upper bound of the slab (inclusive), null = no upper bound. */
  upTo: number | null;
  /** Rate in % applied to the income inside this slab. */
  rate: number;
};

export type SurchargeSlab = {
  /** Surcharge applies when taxable income exceeds this amount. */
  above: number;
  /** Surcharge rate in % of income tax. */
  rate: number;
};

export type RegimeRules = {
  slabs: TaxSlab[];
  standardDeduction: number;
  rebate87A: {
    /** Rebate applies when taxable income ≤ this. */
    incomeLimit: number;
    /** Maximum rebate. */
    maxRebate: number;
    /** Tax cannot exceed income above incomeLimit (new regime, Budget 2025). */
    marginalRelief: boolean;
  };
  /** Ascending by `above`. */
  surcharge: SurchargeSlab[];
  /** Whether old-regime declared deductions (80C etc.) and PT u/s 16(iii) are allowed. */
  allowsChapterVIADeductions: boolean;
};

export type IncomeTaxRules = {
  regimes: Record<TaxRegimeCode, RegimeRules>;
  /** Health & education cess % on (tax after rebate + surcharge). */
  cessPercent: number;
  /** Surcharge marginal relief (tax+surcharge above a threshold ≤ tax at threshold + excess income). */
  surchargeMarginalRelief: boolean;
  /** Rounding for monthly TDS. */
  monthlyTdsRounding: RoundingMode;
};

export type PfRules = {
  /** PF wage ceiling per month. */
  wageCeiling: number;
  /** true = PF on min(Basic+DA, ceiling); false = PF on actual Basic+DA (company option). */
  restrictToWageCeiling: boolean;
  employeePercent: number;
  /** Total employer contribution % (EPS + EPF). */
  employerPercent: number;
  /** EPS (pension) % of min(wage, epsWageCeiling). */
  epsPercent: number;
  epsWageCeiling: number;
  rounding: RoundingMode;
};

export type EsiRules = {
  /** ESI applies when monthly gross ≤ this (at the start of the contribution period). */
  grossThreshold: number;
  employeePercent: number;
  employerPercent: number;
  /** Eligibility fixed for Apr–Sep / Oct–Mar contribution periods. */
  contributionPeriods: boolean;
  rounding: RoundingMode;
};

export type PtSlab = {
  /** Upper bound of monthly gross (inclusive); null = no upper bound. */
  upTo: number | null;
  /** PT per month (or per half-year when periodicity = HALF_YEARLY). */
  amount: number;
  /** Month (1–12) → amount override, e.g. Maharashtra February ₹300. */
  monthOverrides?: Record<string, number>;
};

export type PtStateRules = {
  name: string;
  /**
   * MONTHLY: slabs are on monthly gross and the amount is per month.
   * HALF_YEARLY: slabs are on half-yearly income and the amount is per half-year;
   * the engine uses the monthly equivalent (monthly gross × 6 vs slab, amount ÷ 6).
   */
  periodicity: 'MONTHLY' | 'HALF_YEARLY';
  slabs: PtSlab[];
  /** Optional separate slabs for female employees (Maharashtra). */
  femaleSlabs?: PtSlab[];
  notes?: string;
};

export type StatutoryRules = {
  financialYear: string;
  /** Every default value is unverified until a CA signs off. */
  verifyWithCA: boolean;
  incomeTax: IncomeTaxRules;
  pf: PfRules;
  esi: EsiRules;
  professionalTax: Record<string, PtStateRules>;
  notes?: string[];
};

// ---------------------------------------------------------------------------
// Validation (zod-like, hand-written; no new dependency)
// ---------------------------------------------------------------------------

export class StatutoryRulesError extends Error {}

function fail(path: string, msg: string): never {
  throw new StatutoryRulesError(`Invalid statutory rules at ${path}: ${msg}`);
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'expected object');
  return v as Record<string, unknown>;
}

function num(v: unknown, path: string, opts: { min?: number; max?: number } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected number');
  if (opts.min != null && v < opts.min) fail(path, `must be ≥ ${opts.min}`);
  if (opts.max != null && v > opts.max) fail(path, `must be ≤ ${opts.max}`);
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'expected boolean');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, 'expected string');
  return v;
}

function rounding(v: unknown, path: string): RoundingMode {
  if (v === 'PAISA' || v === 'RUPEE' || v === 'CEIL_RUPEE') return v;
  fail(path, 'expected PAISA | RUPEE | CEIL_RUPEE');
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'expected array');
  return v;
}

/** Slabs must be ascending with only the last one open-ended. */
function upToSlabs<T extends { upTo: number | null }>(list: T[], path: string): T[] {
  let prev = -Infinity;
  list.forEach((s, i) => {
    const last = i === list.length - 1;
    if (s.upTo == null) {
      if (!last) fail(`${path}[${i}].upTo`, 'only the last slab may be open-ended');
      return;
    }
    if (s.upTo <= prev) fail(`${path}[${i}].upTo`, 'slabs must be ascending');
    prev = s.upTo;
  });
  return list;
}

function taxSlabs(v: unknown, path: string): TaxSlab[] {
  const list = arr(v, path).map((raw, i) => {
    const o = obj(raw, `${path}[${i}]`);
    return {
      upTo: o.upTo == null ? null : num(o.upTo, `${path}[${i}].upTo`, { min: 0 }),
      rate: num(o.rate, `${path}[${i}].rate`, { min: 0, max: 100 }),
    };
  });
  if (!list.length) fail(path, 'at least one slab required');
  if (list[list.length - 1].upTo != null) fail(path, 'last slab must be open-ended (upTo: null)');
  return upToSlabs(list, path);
}

function ptSlabs(v: unknown, path: string): PtSlab[] {
  const list = arr(v, path).map((raw, i) => {
    const o = obj(raw, `${path}[${i}]`);
    const slab: PtSlab = {
      upTo: o.upTo == null ? null : num(o.upTo, `${path}[${i}].upTo`, { min: 0 }),
      amount: num(o.amount, `${path}[${i}].amount`, { min: 0 }),
    };
    if (o.monthOverrides != null) {
      const mo = obj(o.monthOverrides, `${path}[${i}].monthOverrides`);
      slab.monthOverrides = {};
      for (const [k, val] of Object.entries(mo)) {
        const m = Number(k);
        if (!Number.isInteger(m) || m < 1 || m > 12) fail(`${path}[${i}].monthOverrides.${k}`, 'month must be 1–12');
        slab.monthOverrides[k] = num(val, `${path}[${i}].monthOverrides.${k}`, { min: 0 });
      }
    }
    return slab;
  });
  if (list.length && list[list.length - 1].upTo != null) fail(path, 'last slab must be open-ended (upTo: null)');
  return upToSlabs(list, path);
}

function regime(v: unknown, path: string): RegimeRules {
  const o = obj(v, path);
  const r = obj(o.rebate87A, `${path}.rebate87A`);
  const surcharge = arr(o.surcharge, `${path}.surcharge`).map((raw, i) => {
    const s = obj(raw, `${path}.surcharge[${i}]`);
    return {
      above: num(s.above, `${path}.surcharge[${i}].above`, { min: 0 }),
      rate: num(s.rate, `${path}.surcharge[${i}].rate`, { min: 0, max: 100 }),
    };
  });
  surcharge.forEach((s, i) => {
    if (i > 0 && s.above <= surcharge[i - 1].above) fail(`${path}.surcharge[${i}]`, 'must be ascending');
  });
  return {
    slabs: taxSlabs(o.slabs, `${path}.slabs`),
    standardDeduction: num(o.standardDeduction, `${path}.standardDeduction`, { min: 0 }),
    rebate87A: {
      incomeLimit: num(r.incomeLimit, `${path}.rebate87A.incomeLimit`, { min: 0 }),
      maxRebate: num(r.maxRebate, `${path}.rebate87A.maxRebate`, { min: 0 }),
      marginalRelief: bool(r.marginalRelief, `${path}.rebate87A.marginalRelief`),
    },
    surcharge,
    allowsChapterVIADeductions: bool(o.allowsChapterVIADeductions, `${path}.allowsChapterVIADeductions`),
  };
}

/** Validate an unknown JSON value (e.g. from the DB) into StatutoryRules. Throws StatutoryRulesError. */
export function parseStatutoryRules(value: unknown): StatutoryRules {
  const o = obj(value, '$');
  const it = obj(o.incomeTax, '$.incomeTax');
  const regimes = obj(it.regimes, '$.incomeTax.regimes');
  const pf = obj(o.pf, '$.pf');
  const esi = obj(o.esi, '$.esi');
  const ptRaw = obj(o.professionalTax, '$.professionalTax');
  const professionalTax: Record<string, PtStateRules> = {};
  for (const [code, raw] of Object.entries(ptRaw)) {
    const p = obj(raw, `$.professionalTax.${code}`);
    const periodicity = p.periodicity === 'HALF_YEARLY' ? 'HALF_YEARLY' : p.periodicity === 'MONTHLY' ? 'MONTHLY' : null;
    if (!periodicity) fail(`$.professionalTax.${code}.periodicity`, 'expected MONTHLY | HALF_YEARLY');
    professionalTax[code] = {
      name: str(p.name, `$.professionalTax.${code}.name`),
      periodicity,
      slabs: ptSlabs(p.slabs, `$.professionalTax.${code}.slabs`),
      ...(p.femaleSlabs != null
        ? { femaleSlabs: ptSlabs(p.femaleSlabs, `$.professionalTax.${code}.femaleSlabs`) }
        : {}),
      ...(typeof p.notes === 'string' ? { notes: p.notes } : {}),
    };
  }
  const fy = str(o.financialYear, '$.financialYear');
  if (!/^\d{4}-\d{2}$/.test(fy)) fail('$.financialYear', 'expected e.g. "2026-27"');
  return {
    financialYear: fy,
    verifyWithCA: bool(o.verifyWithCA, '$.verifyWithCA'),
    incomeTax: {
      regimes: {
        NEW: regime(regimes.NEW, '$.incomeTax.regimes.NEW'),
        OLD: regime(regimes.OLD, '$.incomeTax.regimes.OLD'),
      },
      cessPercent: num(it.cessPercent, '$.incomeTax.cessPercent', { min: 0, max: 100 }),
      surchargeMarginalRelief: bool(it.surchargeMarginalRelief, '$.incomeTax.surchargeMarginalRelief'),
      monthlyTdsRounding: rounding(it.monthlyTdsRounding, '$.incomeTax.monthlyTdsRounding'),
    },
    pf: {
      wageCeiling: num(pf.wageCeiling, '$.pf.wageCeiling', { min: 0 }),
      restrictToWageCeiling: bool(pf.restrictToWageCeiling, '$.pf.restrictToWageCeiling'),
      employeePercent: num(pf.employeePercent, '$.pf.employeePercent', { min: 0, max: 100 }),
      employerPercent: num(pf.employerPercent, '$.pf.employerPercent', { min: 0, max: 100 }),
      epsPercent: num(pf.epsPercent, '$.pf.epsPercent', { min: 0, max: 100 }),
      epsWageCeiling: num(pf.epsWageCeiling, '$.pf.epsWageCeiling', { min: 0 }),
      rounding: rounding(pf.rounding, '$.pf.rounding'),
    },
    esi: {
      grossThreshold: num(esi.grossThreshold, '$.esi.grossThreshold', { min: 0 }),
      employeePercent: num(esi.employeePercent, '$.esi.employeePercent', { min: 0, max: 100 }),
      employerPercent: num(esi.employerPercent, '$.esi.employerPercent', { min: 0, max: 100 }),
      contributionPeriods: bool(esi.contributionPeriods, '$.esi.contributionPeriods'),
      rounding: rounding(esi.rounding, '$.esi.rounding'),
    },
    professionalTax,
    ...(Array.isArray(o.notes) ? { notes: o.notes.filter((n): n is string => typeof n === 'string') } : {}),
  };
}
