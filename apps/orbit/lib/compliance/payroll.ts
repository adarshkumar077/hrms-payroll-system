// India payroll statutory engine — verified rules (2025-2026).
// PF 12%+12% (₹15k wage ceiling, 8.33% to EPS); ESI 0.75%/3.25% (≤₹21k); PT state slabs;
// 2025 Labour Codes: basic must be >= 50% of gross.

export const PF_WAGE_CEILING = 15000;
export const ESI_WAGE_THRESHOLD = 21000;

export function isWageCompliant(gross: number, basic: number): boolean {
  return basic >= gross * 0.5 - 0.01;
}

/** Suggest a compliant split: basic = 50% of gross, HRA = 40% of basic, rest allowances. */
export function suggestStructure(gross: number) {
  const basic = Math.round(gross * 0.5);
  const hra = Math.round(basic * 0.4);
  const allowances = Math.max(0, gross - basic - hra);
  return { gross, basic, hra, allowances, compliant: true };
}

export function pfEmployee(basic: number): number {
  const base = Math.min(basic, PF_WAGE_CEILING);
  return Math.round(base * 0.12);
}
export function pfEmployer(basic: number): number {
  const base = Math.min(basic, PF_WAGE_CEILING);
  return Math.round(base * 0.12);
}

export function esiEmployee(gross: number): number {
  if (gross > ESI_WAGE_THRESHOLD) return 0;
  return Math.round(gross * 0.0075);
}
export function esiEmployer(gross: number): number {
  if (gross > ESI_WAGE_THRESHOLD) return 0;
  return Math.round(gross * 0.0325);
}

/** Simplified Maharashtra-style PT slab (state-varying in reality). */
export function professionalTax(gross: number): number {
  if (gross <= 7500) return 0;
  if (gross <= 10000) return 175;
  return 200;
}

/** Very simplified monthly TDS (new regime, ₹7L rebate) — placeholder for a full engine. */
export function estimatedTds(annualGross: number): number {
  const taxable = Math.max(0, annualGross - 75000); // std deduction
  if (taxable <= 700000) return 0;
  let tax = 0;
  const slabs = [
    [400000, 0],
    [800000, 0.05],
    [1200000, 0.1],
    [1600000, 0.15],
    [2000000, 0.2],
    [Infinity, 0.3],
  ] as const;
  let prev = 0;
  for (const [ceil, rate] of slabs) {
    if (taxable > prev) {
      tax += (Math.min(taxable, ceil) - prev) * rate;
      prev = ceil;
    }
  }
  return Math.round((tax * 1.04) / 12); // +4% cess, monthly
}

export type PayslipCalc = {
  gross: number;
  basic: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  pt: number;
  tds: number;
  lossOfPay: number;
  netPay: number;
};

export function computePayslip(params: {
  gross: number;
  basic: number;
  annualGross?: number;
  lopDays?: number;
  daysInMonth?: number;
}): PayslipCalc {
  const { gross, basic } = params;
  const daysInMonth = params.daysInMonth ?? 30;
  const lopDays = params.lopDays ?? 0;
  const lossOfPay = Math.round((gross / daysInMonth) * lopDays);
  const payableGross = gross - lossOfPay;

  const pfE = pfEmployee(basic);
  const pfR = pfEmployer(basic);
  const esiE = esiEmployee(payableGross);
  const esiR = esiEmployer(payableGross);
  const pt = professionalTax(payableGross);
  const tds = estimatedTds(params.annualGross ?? gross * 12);
  const netPay = Math.round(payableGross - pfE - esiE - pt - tds);

  return {
    gross,
    basic,
    pfEmployee: pfE,
    pfEmployer: pfR,
    esiEmployee: esiE,
    esiEmployer: esiR,
    pt,
    tds,
    lossOfPay,
    netPay,
  };
}
