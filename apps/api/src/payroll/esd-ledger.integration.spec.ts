import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { PayrollService } from './payroll.service';
import { StatutoryRulesService } from './statutory/statutory-rules.service';
import {
  SKIP_NO_DB,
  auditFor,
  authUser,
  connect,
  createCompany,
  createEmployee,
  destroyCompany,
  workflowStub,
} from '../testing/test-db';

/**
 * Regression: approving payroll must post to the ESD ledger exactly what each payslip deducted
 * as ESD. Before the fix every line got the company default (Rs 500) — a ledger of 452 deposits
 * (Rs 2,26,000) for a run where only 2 payslips deducted ESD.
 */
const YEAR = 2027;
const MONTH = 7;
const off = { enabled: false, mode: 'statutory' };

describe('ESD ledger matches payslip deductions', { skip: SKIP_NO_DB }, () => {
  let prisma: PrismaClient;
  let svc: PayrollService;
  let companyId: string;
  const emp: Record<'esdOff' | 'esdOn' | 'noConfig', any> = {} as any;

  before(async () => {
    prisma = connect();
    svc = new PayrollService(prisma as any, auditFor(prisma) as any, workflowStub, new StatutoryRulesService(prisma as any));
    companyId = (await createCompany(prisma, 'ESD Co')).id;
    await prisma.companySetting.createMany({
      data: [
        { companyId, key: 'esd.enabled', value: true, group: 'esd' },
        { companyId, key: 'esd.monthly_amount', value: 500, group: 'esd' },
      ],
    });
    emp.esdOff = await createEmployee(prisma, companyId, 'EsdOff');
    emp.esdOn = await createEmployee(prisma, companyId, 'EsdOn');
    emp.noConfig = await createEmployee(prisma, companyId, 'NoConfig');
    const effectiveFrom = new Date(Date.UTC(2027, 0, 1));
    const cfg = (esd: Record<string, unknown>) => ({
      allowances: { custom: [] },
      deductions: { pf: off, tds: off, esi: off, professionalTax: { enabled: false, amount: 0 }, esd, custom: [] },
    });
    await prisma.employeePayrollConfig.create({
      data: { companyId, employeeId: emp.esdOff.id, grossMonthly: 30000, effectiveFrom, configJson: cfg({ enabled: false }) as any },
    });
    await prisma.employeePayrollConfig.create({
      data: {
        companyId,
        employeeId: emp.esdOn.id,
        grossMonthly: 30000,
        effectiveFrom,
        configJson: cfg({ enabled: true, amount: 500, type: 'monthly', totalAmount: 6000, deductedToDate: 0 }) as any,
      },
    });
    // emp.noConfig has no payroll config: the company default ESD (Rs 500) applies.
  });

  after(async () => {
    await destroyCompany(prisma, companyId);
    await prisma.$disconnect();
  });

  test('ledger deposits equal the ESD each payslip actually deducted', async () => {
    const hr = authUser(companyId, ['HR'], null);
    const run = await svc.generate(hr, { year: YEAR, month: MONTH } as any);
    const esdOf = (employeeId: string) => {
      const line = run.lines.find((l) => l.employeeId === employeeId)!;
      return ((line.deductionsJson as { code: string; amount: number }[]).find((d) => d.code === 'ESD')?.amount) ?? 0;
    };
    assert.equal(esdOf(emp.esdOff.id), 0, 'ESD switched off in the employee config');
    assert.equal(esdOf(emp.esdOn.id), 500);
    assert.equal(esdOf(emp.noConfig.id), 500, 'company default for employees without config');

    await svc.approve(authUser(companyId, ['SUPER_ADMIN'], null), run.id);

    const deposits = await prisma.esdLedgerEntry.findMany({
      where: { companyId, year: YEAR, month: MONTH, entryType: 'DEPOSIT' },
    });
    const depositOf = (employeeId: string) =>
      deposits.filter((d) => d.employeeId === employeeId).reduce((s, d) => s + Number(d.amount), 0);
    assert.equal(depositOf(emp.esdOff.id), 0, 'no deposit when nothing was deducted');
    assert.equal(depositOf(emp.esdOn.id), 500);
    assert.equal(depositOf(emp.noConfig.id), 500);
    assert.equal(deposits.length, 2);
  });
});
