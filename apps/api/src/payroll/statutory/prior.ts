import * as M from '../../common/money';

type Item = { code: string; amount: number };

/** A payroll line approved earlier in the same FY. */
export type PriorPayrollLine = {
  year: number;
  month: number;
  earnings: Item[];
  deductions: Item[];
  grossEarnings: M.MoneyInput;
  /** payroll_lines.statutory_json (null for lines generated before T9). */
  statutory?: { monthlyGross?: number; esi?: { applicable?: boolean } | null } | null;
};

export type PriorPayrollSummary = {
  priorTaxableGross: M.Decimal;
  priorTdsDeducted: M.Decimal;
  priorProfessionalTax: M.Decimal;
  /** true when the employee was ESI-covered in the first payroll month of the current contribution period. */
  esiPeriodEligible: boolean | null;
};

const NON_TAXABLE_EARNINGS = new Set(['REIMB']);

const key = (y: number, m: number) => y * 100 + m;

/**
 * Sum what was already paid / deducted this FY (approved or locked runs only).
 * Lines from before T9 have no statutory_json: their taxable gross falls back to
 * gross earnings minus reimbursements.
 */
export function summarizePriorPayroll(
  lines: PriorPayrollLine[],
  esiPeriodMonths: { year: number; month: number }[] = [],
): PriorPayrollSummary {
  let taxable = M.money(0);
  let tds = M.money(0);
  let pt = M.money(0);
  for (const l of lines) {
    if (l.statutory?.monthlyGross != null) {
      taxable = taxable.plus(M.money(l.statutory.monthlyGross));
    } else {
      const reimb = M.sumBy(
        l.earnings.filter((e) => NON_TAXABLE_EARNINGS.has(e.code)),
        (e) => e.amount,
      );
      taxable = taxable.plus(M.nonNegative(M.sub(l.grossEarnings, reimb)));
    }
    tds = tds.plus(M.sumBy(l.deductions.filter((d) => d.code === 'TDS'), (d) => d.amount));
    pt = pt.plus(M.sumBy(l.deductions.filter((d) => d.code === 'PT'), (d) => d.amount));
  }

  const periodKeys = new Set(esiPeriodMonths.map((p) => key(p.year, p.month)));
  const inPeriod = lines
    .filter((l) => periodKeys.has(key(l.year, l.month)) && l.statutory?.esi != null)
    .sort((a, b) => key(a.year, a.month) - key(b.year, b.month));
  const first = inPeriod[0];
  const esiPeriodEligible = first?.statutory?.esi?.applicable === true ? true : null;

  return {
    priorTaxableGross: M.round2(taxable),
    priorTdsDeducted: M.round2(tds),
    priorProfessionalTax: M.round2(pt),
    esiPeriodEligible,
  };
}
