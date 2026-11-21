import * as M from '../../common/money';
import { RoundingMode } from './types';

/** Round a contribution line according to a rule-set rounding mode. */
export function roundBy(value: M.MoneyInput, mode: RoundingMode): M.Decimal {
  const d = M.money(value);
  switch (mode) {
    case 'RUPEE':
      return d.toDecimalPlaces(0, M.Decimal.ROUND_HALF_UP);
    case 'CEIL_RUPEE':
      // Round up to the next whole rupee (values here are never negative).
      return d.toDecimalPlaces(0, M.Decimal.ROUND_CEIL);
    case 'PAISA':
    default:
      return M.round2(d);
  }
}

/** Indian financial year label for a payroll month, e.g. (2026, 3) → "2025-26", (2026, 4) → "2026-27". */
export function financialYearOf(year: number, month: number): string {
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** Start calendar year of a FY label ("2026-27" → 2026). */
export function financialYearStart(fy: string): number {
  return Number(fy.slice(0, 4));
}

/** 0 for April … 11 for March. */
export function fyMonthIndex(month: number): number {
  return (month + 8) % 12;
}

/** Months left in the FY including the given month (April → 12, March → 1). */
export function monthsRemainingInFy(month: number): number {
  return 12 - fyMonthIndex(month);
}

/** The (year, month) pairs of a FY that come before the given payroll month. */
export function priorMonthsInFy(year: number, month: number): { year: number; month: number }[] {
  const startYear = financialYearStart(financialYearOf(year, month));
  const out: { year: number; month: number }[] = [];
  for (let i = 0; i < fyMonthIndex(month); i++) {
    const m = ((3 + i) % 12) + 1; // 4,5,…,12,1,2,3
    out.push({ year: m >= 4 ? startYear : startYear + 1, month: m });
  }
  return out;
}

/**
 * ESI contribution periods: April–September and October–March.
 * Returns the (year, month) pairs of the current period that come before the given month.
 */
export function priorMonthsInEsiPeriod(year: number, month: number): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = month <= 3 ? year - 1 : year;
  let m = month >= 4 && month <= 9 ? 4 : 10;
  while (!(y === year && m === month) && out.length < 6) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
