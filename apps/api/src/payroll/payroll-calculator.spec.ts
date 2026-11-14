import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../common/money';
import {
  buildEmiAmounts,
  calcDailyEarning,
  calcDailySalary,
  calcEmi,
  calcEsdForMonth,
  calcEstimatedMonthlyTds,
  calcMonthNetPayable,
  calcPayrollPreview,
  calcPayslipTotals,
  calcProratedAmount,
  calendarDaysInMonth,
  defaultPayrollConfigJson,
  normalizePayrollConfig,
  type EmployeePayrollConfigJson,
  type StatutoryContext,
} from './payroll-calculator';
import { defaultStatutoryRules } from './statutory';

// Golden values below were computed independently with Python's decimal module
// (ROUND_HALF_UP, 2dp), not with this code.

const BASIC = 33333.33;

test('calendar days: 31 / 30 / 28 / leap 29', () => {
  assert.equal(calendarDaysInMonth(2026, 1), 31);
  assert.equal(calendarDaysInMonth(2026, 4), 30);
  assert.equal(calendarDaysInMonth(2026, 2), 28);
  assert.equal(calendarDaysInMonth(2028, 2), 29);
});

test('per-day salary for an odd basic in 31/30/28/29-day months', () => {
  assert.equal(calcDailySalary(BASIC, 31), 1075.27);
  assert.equal(calcDailySalary(BASIC, 30), 1111.11);
  assert.equal(calcDailySalary(BASIC, 28), 1190.48);
  assert.equal(calcDailySalary(BASIC, 29), 1149.43);
  assert.equal(calcDailySalary(BASIC, 0), 0);
  assert.equal(calcDailySalary(BASIC, 30, 999.995), 1000); // explicit override, rounded half-up
});

test('LOP proration rounds once (basic × days ÷ calendarDays), not per-day first', () => {
  // 31-day month
  assert.equal(calcProratedAmount(BASIC, 1, 31), 1075.27);
  assert.equal(calcProratedAmount(BASIC, 2.5, 31), 2688.17); // per-day-first would give 2688.18
  // 30-day month
  assert.equal(calcProratedAmount(BASIC, 3, 30), 3333.33);
  // 28-day month
  assert.equal(calcProratedAmount(BASIC, 1, 28), 1190.48);
  assert.equal(calcProratedAmount(BASIC, 2, 28), 2380.95); // per-day-first would give 2380.96
  // whole month of LOP = the whole basic, to the paisa
  assert.equal(calcProratedAmount(BASIC, 31, 31), BASIC);
  assert.equal(calcProratedAmount(BASIC, 28, 28), BASIC);
  assert.equal(calcProratedAmount(BASIC, 1, 0), 0);
});

test('daily earnings: half day rounds half-up at .005', () => {
  const daily = calcDailySalary(BASIC, 31); // 1075.27
  assert.equal(calcDailyEarning('P', daily).amount, 1075.27);
  assert.equal(calcDailyEarning('HD', daily).amount, 537.64); // 537.635 → 537.64
  assert.equal(calcDailyEarning('A', daily).amount, -1075.27);
  assert.equal(calcDailyEarning('WO', daily, { workedOnWeekOff: true }).amount, 2150.54);
  assert.equal(calcDailyEarning('PH', daily, { holidayPaid: false }).amount, 0);
});

test('manual overrides still work: PF 12% of gross (percent), fixed TDS / PF', () => {
  const config: EmployeePayrollConfigJson = defaultPayrollConfigJson();
  config.deductions.pf = { enabled: true, mode: 'percent', value: 12 };
  const p = calcPayrollPreview({ grossMonthly: BASIC, config });
  assert.equal(p.pf, 4000); // 3999.9996 → 4000.00
  assert.equal(p.employerPfEps, 0); // employer share is only computed in statutory mode
  // Statutory TDS: 33,333.33 × 12 = 3,99,999.96 − 75,000 → nil under the new regime
  assert.equal(p.tds, 0);
  assert.equal(p.statutory.modes.tds, 'statutory');

  config.deductions.pf = { enabled: true, mode: 'fixed', value: 3600 };
  config.deductions.tds = { enabled: true, mode: 'fixed', value: 1234.565 };
  const q = calcPayrollPreview({ grossMonthly: BASIC, config });
  assert.equal(q.pf, 3600);
  assert.equal(q.tds, 1234.57); // half-up
  assert.equal(q.statutory.tds, null);
});

test('legacy config JSON: flat 1% TDS migrates to the slab engine; fixed PF / PT overrides are kept', () => {
  const legacy = {
    allowances: defaultPayrollConfigJson().allowances,
    deductions: {
      pf: { enabled: true, mode: 'fixed', value: 3600 },
      tds: { enabled: true, mode: 'percent', value: 1 },
      esd: { enabled: false, amount: 500 },
      professionalTax: { enabled: true, amount: 200 },
      custom: [],
    },
  } as unknown as EmployeePayrollConfigJson;
  const c = normalizePayrollConfig(legacy);
  assert.deepEqual(c.deductions.pf, { enabled: true, mode: 'fixed', value: 3600 });
  assert.deepEqual(c.deductions.tds, { enabled: true, mode: 'statutory' });
  assert.deepEqual(c.deductions.professionalTax, { enabled: true, amount: 200, mode: 'fixed' });
  assert.deepEqual(c.deductions.esi, { enabled: false, mode: 'statutory' });
  const zeroPt = normalizePayrollConfig({
    ...legacy,
    deductions: { ...legacy.deductions, professionalTax: { enabled: true, amount: 0 } },
  });
  assert.equal(zeroPt.deductions.professionalTax.mode, 'statutory');
});

test('statutory preview: PF on capped wage, ESI, Maharashtra February PT, employer shares', () => {
  const config = defaultPayrollConfigJson();
  config.deductions.pf = { enabled: true, mode: 'statutory' };
  config.deductions.esi = { enabled: true, mode: 'statutory' };
  const ctx: StatutoryContext = {
    rules: defaultStatutoryRules('2026-27'),
    year: 2027,
    month: 2,
    taxRegime: 'NEW',
    ptState: 'MH',
  };
  const p = calcPayrollPreview({ grossMonthly: 18000, config, statutory: ctx });
  assert.equal(p.pf, 1800); // 12% of min(18,000, 15,000)
  assert.equal(p.employerPfEps, 1250);
  assert.equal(p.employerPfEpf, 550);
  assert.equal(p.esi, 135); // 0.75% of 18,000
  assert.equal(p.employerEsi, 585); // 3.25%
  assert.equal(p.professionalTax, 300); // February
  assert.equal(p.tds, 0);
  assert.equal(p.totalDeductions, 2235);
  assert.equal(p.netSalary, 15765);
  assert.equal(p.statutory.verifyWithCA, true);
});

test('statutory preview: steady-state TDS new vs old regime at ₹1.5L/month', () => {
  const config = defaultPayrollConfigJson();
  const base: StatutoryContext = { rules: defaultStatutoryRules('2026-27'), year: 2026, month: 4, ptState: 'MH' };
  // 18,00,000 − 75,000 = 17,25,000 → 1,45,000 + 5,800 cess = 1,50,800 ÷ 12 = 12,566.67 → 12,567
  assert.equal(calcPayrollPreview({ grossMonthly: 150000, config, statutory: { ...base, taxRegime: 'NEW' } }).tds, 12567);
  // 18,00,000 − 50,000 − 1,50,000 − 2,400 PT = 15,97,600 → 2,91,780 + 11,671.20 = 3,03,451.20 ÷ 12 → 25,288
  assert.equal(
    calcPayrollPreview({
      grossMonthly: 150000,
      config,
      statutory: { ...base, taxRegime: 'OLD', declaredDeductions: 150000 },
    }).tds,
    25288,
  );
  assert.equal(calcEstimatedMonthlyTds(150000, { ...base, taxRegime: 'NEW' }), 12567);
});

test('payroll preview: gross + allowances − deductions = net exactly', () => {
  const config: EmployeePayrollConfigJson = defaultPayrollConfigJson();
  config.allowances.hra = 0.1;
  config.allowances.medical = 0.2;
  config.allowances.special = 1234.567; // stored line rounds to 1234.57
  config.allowances.custom = [{ name: 'Phone', amount: 0.1 }];
  config.deductions.pf = { enabled: true, mode: 'percent', value: 12 };
  config.deductions.professionalTax = { enabled: true, amount: 200 };
  config.deductions.esd = { enabled: true, amount: 500, type: 'monthly', totalAmount: 6000, deductedToDate: 1000 };
  config.deductions.custom = [
    { name: 'Canteen', amount: 0.1 },
    { name: 'Club', amount: 0.2 },
  ];
  const p = calcPayrollPreview({ grossMonthly: BASIC, config });

  assert.equal(p.grossSalary, 33333.33);
  assert.equal(p.totalAllowances, 1234.97); // 0.1 + 0.2 + 1234.57 + 0.1, exact
  assert.equal(p.otherDeductions, 0.3); // 0.1 + 0.2, exact
  assert.equal(p.esd, 500);
  assert.equal(p.esdRemainingBalance, 4500);
  assert.equal(p.esdDeductedToDate, 1000);
  assert.equal(p.professionalTax, 200);

  const expectedDed = M.add(p.pf, p.esi, p.tds, p.esd, p.professionalTax, p.otherDeductions);
  assert.ok(M.money(p.totalDeductions).equals(expectedDed));
  assert.equal(p.tds, 0); // 34,568.30 × 12 − 75,000 is under the ₹12L rebate limit
  assert.equal(p.totalDeductions, 4700.3); // 4000 + 0 + 500 + 200 + 0.30
  const expectedNet = M.sub(M.add(p.grossSalary, p.totalAllowances), p.totalDeductions);
  assert.ok(M.money(p.netSalary).equals(expectedNet));
  assert.equal(p.netSalary, 29868); // 33333.33 + 1234.97 − 4700.30
});

test('payroll preview: deductions are capped at gross and net never goes negative', () => {
  const config = defaultPayrollConfigJson();
  config.deductions.custom = [{ name: 'Recovery', amount: 50000 }];
  const p = calcPayrollPreview({ grossMonthly: 10000.01, config });
  assert.equal(p.totalDeductions, 10000.01);
  assert.equal(p.netSalary, 0);
});

test('ESD one_time / custom installments reach the target exactly', () => {
  // custom: min(installment, remaining) each month; the paise remainder is collected next month.
  const custom = calcEsdForMonth({ enabled: true, type: 'custom', amount: 333.33, totalAmount: 1000, deductedToDate: 666.66 });
  assert.equal(custom.amount, 333.33);
  assert.equal(custom.remainingBalance, 0.01); // exact, not 0.010000000000047748
  assert.equal(custom.deductedToDate, 999.99);
  const last = calcEsdForMonth({ enabled: true, type: 'custom', amount: 333.33, totalAmount: 1000, deductedToDate: 999.99 });
  assert.equal(last.amount, 0.01);
  assert.equal(last.remainingBalance, 0);
  assert.equal(last.deductedToDate, 1000);

  const once = calcEsdForMonth({ enabled: true, type: 'one_time', amount: 0, totalAmount: 2500.5, deductedToDate: 0 });
  assert.equal(once.amount, 2500.5);
  const done = calcEsdForMonth({ enabled: true, type: 'one_time', amount: 0, totalAmount: 2500.5, deductedToDate: 2500.5 });
  assert.equal(done.amount, 0);
});

test('EMI: interest-free and amortised, and the schedule closes at exactly zero', () => {
  assert.equal(calcEmi(10000, 0, 3), 3333.33);
  assert.equal(calcEmi(100000, 12, 12), 8884.88);
  assert.equal(calcEmi(250000, 10.5, 24), 11594.01);
  assert.equal(calcEmi(1000, 0, 0), 0);

  const schedule = buildEmiAmounts({ principal: 10000, emiAmount: 3333.33, tenureMonths: 3, interestRate: 0 });
  assert.deepEqual(schedule.map((d) => d.toFixed(2)), ['3333.33', '3333.33', '3333.34']);
  assert.ok(M.sum(schedule).equals(10000));

  const withInterest = buildEmiAmounts({ principal: 100000, emiAmount: 8884.88, tenureMonths: 12, interestRate: 12 });
  assert.equal(withInterest.length, 12);
  assert.ok(withInterest.every((d) => d.equals('8884.88')));
});

test('payslip totals with LOP, loan EMI and reimbursements: gross − deductions = net exactly', () => {
  const days = calendarDaysInMonth(2026, 1); // 31
  const reimbursements = [0.1, 0.2, 1499.99]; // approved claims
  const earnings = [
    { code: 'BASIC', amount: BASIC },
    { code: 'HRA', amount: 13333.33 },
    { code: 'REIMB', amount: M.toNumber(M.sum(reimbursements)) },
  ];
  const emis = [3333.33, 1250.005]; // two active loans; second rounds to 1250.01
  const deductions = [
    { code: 'LOP', amount: calcProratedAmount(BASIC, 2.5, days) },
    { code: 'TDS', amount: 333.33 },
    { code: 'LOAN_EMI', amount: M.toNumber(M.sumBy(emis, (e) => M.round2(e))) },
  ];
  const t = calcPayslipTotals(earnings, deductions);

  assert.equal(earnings[2].amount, 1500.29); // 0.1 + 0.2 + 1499.99 exactly
  assert.equal(deductions[2].amount, 4583.34); // 3333.33 + 1250.01
  assert.equal(t.gross.toFixed(2), '48166.95'); // 33333.33 + 13333.33 + 1500.29
  assert.equal(t.totalDeductions.toFixed(2), '7604.84'); // 2688.17 + 333.33 + 4583.34
  assert.equal(t.net.toFixed(2), '40562.11');
  assert.ok(t.gross.minus(t.totalDeductions).equals(t.net));
});

test('month net payable (attendance settlement) is exact', () => {
  const daily = calcDailySalary(BASIC, 30); // 1111.11
  const net = calcMonthNetPayable({
    grossMonthly: BASIC,
    absentDeduction: M.toNumber(M.mul(daily, 2)), // 2222.22
    normalHalfDayDeduction: M.toNumber(M.div(daily, 2)), // 555.555 → 555.56
    lateConversionDeduction: 0,
    pf: 1800,
    esd: 500,
    tds: 333.33,
    otherDeductions: 0.1,
  });
  // 33333.33 − 2222.22 − 555.56 − 1800 − 500 − 333.33 − 0.10
  assert.equal(net, 27922.12);
  assert.equal(
    calcMonthNetPayable({
      grossMonthly: 100,
      absentDeduction: 500,
      normalHalfDayDeduction: 0,
      lateConversionDeduction: 0,
      pf: 0,
      esd: 0,
      tds: 0,
      otherDeductions: 0,
    }),
    0,
  );
});
