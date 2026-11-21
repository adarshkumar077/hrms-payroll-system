import * as M from '../../common/money';

/**
 * Pure builders for statutory / bank export files. No database access here so they can be
 * unit-tested; payroll-exports.service.ts maps Prisma rows into ExportLine.
 */

type Item = { code: string; amount: number };

export type ExportLine = {
  employeeCode: string;
  name: string;
  uan?: string | null;
  esicNumber?: string | null;
  pan?: string | null;
  bankAccount?: string | null;
  ifsc?: string | null;
  regime?: string | null;
  declaredDeductions?: M.MoneyInput;
  year: number;
  month: number;
  lopDays: number;
  gross: M.MoneyInput;
  net: M.MoneyInput;
  earnings: Item[];
  deductions: Item[];
  employerPfEps: M.MoneyInput;
  employerPfEpf: M.MoneyInput;
  employerEsi: M.MoneyInput;
  statutory?: {
    monthlyGross?: number;
    taxRegime?: string;
    pf?: { actualWage?: number; pfWage?: number; employee?: number } | null;
    esi?: { applicable?: boolean; employee?: number; employer?: number } | null;
  } | null;
};

export const ECR_SEPARATOR = '#~#';
/** EPS wage ceiling (Rs 15,000). Not stored per line; override if the company rule set differs. */
export const DEFAULT_EPS_WAGE_CEILING = 15000;

const itemSum = (items: Item[], code: string) =>
  M.sumBy(
    items.filter((i) => i.code === code),
    (i) => i.amount,
  );

const rupees = (v: M.MoneyInput) =>
  M.money(v).toDecimalPlaces(0, M.Decimal.ROUND_HALF_UP).toFixed(0);

/** Employee PF deduction for the month (statutory_json first, else the PF deduction item). */
export function pfEmployee(l: ExportLine): M.Decimal {
  if (l.statutory?.pf?.employee != null) return M.money(l.statutory.pf.employee);
  return itemSum(l.deductions, 'PF');
}

export function hasPf(l: ExportLine): boolean {
  return pfEmployee(l).gt(0) || M.money(l.employerPfEpf).gt(0) || M.money(l.employerPfEps).gt(0);
}

export function esiEmployee(l: ExportLine): M.Decimal {
  if (l.statutory?.esi?.employee != null) return M.money(l.statutory.esi.employee);
  return itemSum(l.deductions, 'ESI');
}

export function hasEsi(l: ExportLine): boolean {
  return (
    l.statutory?.esi?.applicable === true || esiEmployee(l).gt(0) || M.money(l.employerEsi).gt(0)
  );
}

export function tdsOf(l: ExportLine): M.Decimal {
  return itemSum(l.deductions, 'TDS');
}

/** Name safe for ECR: the separator characters are stripped. */
const ecrName = (s: string) => s.replace(/[#~\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

/** One ECR 2.0 line (11 fields joined by #~#). Wages and contributions in whole rupees. */
export function buildEcrLine(l: ExportLine, epsWageCeiling = DEFAULT_EPS_WAGE_CEILING): string {
  const epfWage = M.money(l.statutory?.pf?.pfWage ?? l.statutory?.pf?.actualWage ?? 0);
  const epsWage = M.min(epfWage, epsWageCeiling);
  const gross = l.statutory?.monthlyGross ?? l.gross;
  const fields = [
    (l.uan ?? '').trim(),
    ecrName(l.name),
    rupees(gross),
    rupees(epfWage),
    rupees(epsWage),
    rupees(epsWage), // EDLI wages = EPS wages (capped)
    rupees(pfEmployee(l)),
    rupees(l.employerPfEps),
    rupees(l.employerPfEpf), // EPF-EPS diff remitted by employer
    String(Math.max(0, Math.round(l.lopDays ?? 0))), // NCP days
    '0', // refund of advances
  ];
  return fields.join(ECR_SEPARATOR);
}

export type EcrResult = {
  content: string;
  included: number;
  missingUan: ExportLine[];
  skippedNoPf: number;
};

/** Members without a UAN are left out of the file (EPFO rejects them) and reported. */
export function buildEcrFile(
  lines: ExportLine[],
  epsWageCeiling = DEFAULT_EPS_WAGE_CEILING,
): EcrResult {
  const missingUan: ExportLine[] = [];
  const out: string[] = [];
  let skippedNoPf = 0;
  for (const l of lines) {
    if (!hasPf(l)) {
      skippedNoPf++;
      continue;
    }
    if (!l.uan || !l.uan.trim()) {
      missingUan.push(l);
      continue;
    }
    out.push(buildEcrLine(l, epsWageCeiling));
  }
  return {
    content: out.length ? out.join('\r\n') + '\r\n' : '',
    included: out.length,
    missingUan,
    skippedNoPf,
  };
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** ESI contribution-sheet rows (keys are the column headers of the XLSX). */
export function buildEsiRows(lines: ExportLine[]): Record<string, unknown>[] {
  return lines.filter(hasEsi).map((l) => {
    const days = Math.max(0, daysInMonth(l.year, l.month) - (l.lopDays ?? 0));
    return {
      'IP Number': l.esicNumber ?? '',
      'IP Name': l.name,
      'No. of Days for which wages paid': days,
      'Total Monthly Wages': M.toNumber(M.round2(l.statutory?.monthlyGross ?? l.gross)),
      'Reason Code for Zero Working Days': '',
      'Last Working Day': '',
      'Employee Contribution (ref)': M.toNumber(M.round2(esiEmployee(l))),
      'Employer Contribution (ref)': M.toNumber(
        M.round2(l.statutory?.esi?.employer ?? l.employerEsi),
      ),
    };
  });
}

/** Bank transfer rows; employees without account number or IFSC (or with no net pay) are skipped. */
export function buildBankRows(
  lines: ExportLine[],
  year: number,
  month: number,
): Record<string, unknown>[] {
  const narration = `Salary ${String(month).padStart(2, '0')}-${year}`;
  return lines
    .filter((l) => l.bankAccount?.trim() && l.ifsc?.trim() && M.money(l.net).gt(0))
    .map((l) => ({
      'Employee Name': l.name,
      'Account Number': l.bankAccount!.trim(),
      IFSC: l.ifsc!.trim().toUpperCase(),
      'Net Amount': M.round2(l.net).toFixed(2),
      Narration: narration,
    }));
}

export type ValidationIssue = { employeeCode: string; name: string };
export type ExportValidation = {
  missingUan: ValidationIssue[];
  missingEsicNumber: ValidationIssue[];
  missingPan: ValidationIssue[];
  missingBank: ValidationIssue[];
};

export function validateExportLines(lines: ExportLine[]): ExportValidation {
  const ref = (l: ExportLine): ValidationIssue => ({ employeeCode: l.employeeCode, name: l.name });
  const blank = (s?: string | null) => !s || !s.trim();
  return {
    missingUan: lines.filter((l) => hasPf(l) && blank(l.uan)).map(ref),
    missingEsicNumber: lines.filter((l) => hasEsi(l) && blank(l.esicNumber)).map(ref),
    missingPan: lines.filter((l) => tdsOf(l).gt(0) && blank(l.pan)).map(ref),
    missingBank: lines
      .filter((l) => M.money(l.net).gt(0) && (blank(l.bankAccount) || blank(l.ifsc)))
      .map(ref),
  };
}

/** FY label "2026-27" gives its start year, or null when malformed. */
export function parseFinancialYear(fy: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(fy ?? '');
  if (!m) return null;
  const start = Number(m[1]);
  return (start + 1) % 100 === Number(m[2]) ? start : null;
}

/** Calendar (year, month) pairs April..March of a FY. */
export function fyMonths(startYear: number): { year: number; month: number }[] {
  return [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((month) => ({
    year: month >= 4 ? startYear : startYear + 1,
    month,
  }));
}

const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const TDS_EXPORT_NOTE =
  'Data for Form 16 / 24Q preparation only - not the official form. Verify with your CA.';

const taxableOf = (l: ExportLine): M.Decimal => {
  if (l.statutory?.monthlyGross != null) return M.money(l.statutory.monthlyGross);
  return M.nonNegative(M.sub(l.gross, itemSum(l.earnings, 'REIMB')));
};

/**
 * Aggregate approved/locked payroll lines of one FY into one row per employee with month-wise
 * taxable gross and TDS (April..March) plus totals.
 */
export function buildTdsRows(lines: ExportLine[], fy: string): Record<string, unknown>[] {
  const start = parseFinancialYear(fy);
  if (start == null) throw new Error('Invalid financial year');
  const months = fyMonths(start);
  const byEmp = new Map<string, ExportLine[]>();
  for (const l of lines) {
    if (!months.some((m) => m.year === l.year && m.month === l.month)) continue;
    const list = byEmp.get(l.employeeCode) ?? [];
    list.push(l);
    byEmp.set(l.employeeCode, list);
  }
  const rows: Record<string, unknown>[] = [];
  for (const code of [...byEmp.keys()].sort()) {
    const emp = byEmp.get(code)!;
    // Latest month's master data wins (PAN / regime / declaration can change during the year).
    const latest = [...emp].sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month)).at(-1)!;
    const regime = latest.regime ?? latest.statutory?.taxRegime ?? '';
    const row: Record<string, unknown> = {
      'Financial Year': fy,
      'Employee Code': code,
      'Employee Name': latest.name,
      PAN: latest.pan ?? '',
      'Tax Regime': regime,
      'Declared Old-Regime Deductions':
        regime === 'OLD' ? M.toNumber(M.round2(latest.declaredDeductions)) : '',
    };
    let totalTaxable = M.money(0);
    let totalTds = M.money(0);
    for (const m of months) {
      const forMonth = emp.filter((l) => l.year === m.year && l.month === m.month);
      const taxable = M.sumBy(forMonth, taxableOf);
      const tds = M.sumBy(forMonth, tdsOf);
      const label = `${MONTH_LABEL[m.month - 1]}-${m.year}`;
      row[`${label} Taxable Gross`] = forMonth.length ? M.toNumber(M.round2(taxable)) : '';
      row[`${label} TDS`] = forMonth.length ? M.toNumber(M.round2(tds)) : '';
      totalTaxable = totalTaxable.plus(taxable);
      totalTds = totalTds.plus(tds);
    }
    row['Total Taxable Gross'] = M.toNumber(M.round2(totalTaxable));
    row['Total TDS'] = M.toNumber(M.round2(totalTds));
    row['Note'] = TDS_EXPORT_NOTE;
    rows.push(row);
  }
  return rows;
}
