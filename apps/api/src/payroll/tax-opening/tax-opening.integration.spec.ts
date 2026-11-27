import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { PayrollService } from '../payroll.service';
import { StatutoryRulesService } from '../statutory/statutory-rules.service';
import { TaxOpeningService } from './tax-opening.service';
import { SKIP_NO_DB, auditFor, authUser, connect, createCompany, createEmployee, destroyCompany, workflowStub } from '../../testing/test-db';

/**
 * Mid-year go-live: Apr–Nov salary and TDS were paid outside the system. With an opening balance
 * the December TDS projects the WHOLE year (opening + Dec–Mar) and subtracts the TDS already
 * deducted; without it the system would only see Dec–Mar and under-deduct.
 */
const YEAR = 2026;
const MONTH = 12; // FY 2026-27, 4 months remaining (Dec–Mar)
const FY = '2026-27';

describe('tax opening balances feed the TDS projection', { skip: SKIP_NO_DB }, () => {
  let prisma: PrismaClient;
  let payroll: PayrollService;
  let opening: TaxOpeningService;
  let companyId: string;
  let withOpening: any;
  let without: any;

  before(async () => {
    prisma = connect();
    const audit = auditFor(prisma);
    payroll = new PayrollService(prisma as any, audit as any, workflowStub, new StatutoryRulesService(prisma as any));
    opening = new TaxOpeningService(prisma as any, audit as any);
    companyId = (await createCompany(prisma, 'Opening Co')).id;
    withOpening = await createEmployee(prisma, companyId, 'OpenA');
    without = await createEmployee(prisma, companyId, 'OpenB');
    const off = { enabled: false, mode: 'statutory' };
    const cfg = {
      allowances: { custom: [] },
      deductions: { pf: off, esi: off, tds: { enabled: true, mode: 'statutory' }, professionalTax: { enabled: false, amount: 0 }, esd: { enabled: false }, custom: [] },
    };
    for (const e of [withOpening, without]) {
      await prisma.employeePayrollConfig.create({
        data: { companyId, employeeId: e.id, grossMonthly: 150000, effectiveFrom: new Date(Date.UTC(2026, 3, 1)), configJson: cfg as any },
      });
    }
  });

  after(async () => {
    await destroyCompany(prisma, companyId);
    await prisma.$disconnect();
  });

  test('validation: unknown employee, negative amount, TDS above gross, bad FY; dry run saves nothing', async () => {
    const sa = authUser(companyId, ['SUPER_ADMIN']);
    await assert.rejects(opening.save(sa, { financialYear: '2026-28', source: 'x source', rows: [] }), /2026-27/);
    const r = await opening.save(sa, {
      financialYear: FY,
      source: 'Apr–Nov 2026 old payroll',
      rows: [
        { employeeCode: 'NOPE', taxableGross: 1, tdsDeducted: 0 },
        { employeeCode: withOpening.employeeCode, taxableGross: -5, tdsDeducted: 0 },
        { employeeCode: without.employeeCode, taxableGross: 100, tdsDeducted: 500 },
      ],
    });
    assert.equal(r.saved, false);
    assert.deepEqual(r.errors.map((e) => e.row), [1, 2, 3]);
    const dry = await opening.save(sa, { financialYear: FY, source: 'dry run test', dryRun: true, rows: [{ employeeCode: withOpening.employeeCode, taxableGross: 1200000, tdsDeducted: 90000 }] });
    assert.equal(dry.saved, false);
    assert.equal(await prisma.employeeTaxOpeningBalance.count({ where: { companyId } }), 0);
  });

  test('December TDS uses opening gross and subtracts opening TDS', async () => {
    const sa = authUser(companyId, ['SUPER_ADMIN']);
    const saved = await opening.save(sa, {
      financialYear: FY,
      source: 'Apr–Nov 2026 old payroll (test)',
      rows: [{ employeeCode: withOpening.employeeCode, taxableGross: '12,00,000', tdsDeducted: 90000, professionalTax: 0 }],
    });
    assert.equal(saved.saved, true);

    const run = await payroll.generate(authUser(companyId, ['SUPER_ADMIN'], null), { year: YEAR, month: MONTH } as any);
    const tdsDetail = (employeeId: string) => (run.lines.find((l) => l.employeeId === employeeId)!.statutoryJson as any).tds;
    const a = tdsDetail(withOpening.id);
    const b = tdsDetail(without.id);

    assert.equal(b.monthsRemaining, 4);
    assert.equal(b.projectedAnnualGross, 600000, 'no opening: only Dec–Mar is visible');
    assert.equal(b.priorTdsDeducted, 0);

    assert.equal(a.projectedAnnualGross, 1800000, 'opening 12,00,000 + 4 × 1,50,000');
    assert.equal(a.priorTdsDeducted, 90000);
    // Monthly TDS = (annual tax on the full year − TDS already deducted) ÷ remaining months.
    const expected = Math.max(0, (a.annualTax - 90000) / 4);
    assert.ok(Math.abs(a.monthlyTds - expected) <= 1, `monthly TDS ${a.monthlyTds} ≈ ${expected}`);
    assert.ok(a.annualTax > b.annualTax, 'full-year income is taxed at the correct (higher) slab');

    const listed = await opening.list(sa, FY);
    assert.equal(listed.rows.length, 1);
    assert.equal(listed.rows[0].tdsDeducted, 90000);
  });
});
