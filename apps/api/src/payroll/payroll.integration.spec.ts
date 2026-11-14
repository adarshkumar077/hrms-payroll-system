import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
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
 * Payroll generate -> approve -> payslip visibility against a real database
 * (set TEST_DATABASE_URL to a migrated database to run).
 * June 2027 has 30 calendar days.
 */
const YEAR = 2027;
const MONTH = 6;

type Line = { code: string; amount: number };
const earn = (line: any): Line[] => line.earningsJson as Line[];
const ded = (line: any): Line[] => line.deductionsJson as Line[];
const amt = (items: Line[], code: string) => items.find((i) => i.code === code)?.amount;

const noDeductions = {
  pf: { enabled: false, mode: 'statutory' },
  tds: { enabled: false, mode: 'statutory' },
  esi: { enabled: false, mode: 'statutory' },
  professionalTax: { enabled: false, amount: 0 },
};

describe('payroll generate / approve / payslip visibility', { skip: SKIP_NO_DB }, () => {
  let prisma: PrismaClient;
  let svc: PayrollService;
  let companyId: string;
  let otherCompanyId: string;
  const emp: Record<'gross' | 'basic' | 'lop' | 'other', any> = {} as any;
  let hr: ReturnType<typeof authUser>;
  let runId: string;

  before(async () => {
    prisma = connect();
    svc = new PayrollService(
      prisma as any,
      auditFor(prisma) as any,
      workflowStub,
      new StatutoryRulesService(prisma as any),
    );
    companyId = (await createCompany(prisma)).id;
    otherCompanyId = (await createCompany(prisma, 'Other Co')).id;

    emp.gross = await createEmployee(prisma, companyId, 'GrossOnly');
    emp.basic = await createEmployee(prisma, companyId, 'WithBasic');
    emp.lop = await createEmployee(prisma, companyId, 'LopEmp');
    emp.other = await createEmployee(prisma, otherCompanyId, 'Outsider');

    const cfg = (allowances: Record<string, unknown>) => ({
      allowances: { custom: [], ...allowances },
      deductions: { ...noDeductions, esd: { enabled: false }, custom: [] },
    });
    const effectiveFrom = new Date(Date.UTC(2027, 0, 1));
    const mk = (employeeId: string, cId: string, gross: number, allowances: Record<string, unknown>) =>
      prisma.employeePayrollConfig.create({
        data: { companyId: cId, employeeId, grossMonthly: gross, effectiveFrom, configJson: cfg(allowances) as any },
      });
    await mk(emp.gross.id, companyId, 30000, {});
    await mk(emp.basic.id, companyId, 10000, { basic: 15000, hra: 5000 });
    await mk(emp.lop.id, companyId, 30000, {});
    await mk(emp.other.id, otherCompanyId, 50000, {});

    // 2 absent days for the LOP employee.
    for (const day of [3, 4]) {
      await prisma.attendanceRecord.create({
        data: { companyId, employeeId: emp.lop.id, date: new Date(Date.UTC(YEAR, MONTH - 1, day)), status: 'A' },
      });
    }

    hr = authUser(companyId, ['HR'], null);
  });

  after(async () => {
    await destroyCompany(prisma, companyId);
    await destroyCompany(prisma, otherCompanyId);
    await prisma.$disconnect();
  });

  test('an EMPLOYEE cannot generate or approve payroll', async () => {
    const e = authUser(companyId, ['EMPLOYEE'], emp.gross.id);
    await assert.rejects(svc.generate(e, { year: YEAR, month: MONTH } as any), ForbiddenException);
    await assert.rejects(svc.approve(e, 'whatever'), ForbiddenException);
  });

  test('generate: configured gross 30,000 with no allowances pays a SALARY earning of 30,000', async () => {
    const run = await svc.generate(hr, { year: YEAR, month: MONTH } as any);
    runId = run.id;
    assert.equal(run.status, 'REVIEW');
    // generate is scoped to the HR user's company only
    assert.equal(run.lines.length, 3);
    assert.ok(run.lines.every((l) => l.employeeId !== emp.other.id));

    const line = run.lines.find((l) => l.employeeId === emp.gross.id)!;
    assert.equal(amt(earn(line), 'SALARY'), 30000);
    assert.equal(earn(line).length, 1);
    assert.equal(Number(line.grossEarnings), 30000);
    assert.equal(Number(line.totalDeductions), 0);
    assert.equal(Number(line.netPay), 30000);
    assert.equal(line.lopDays, 0);
  });

  test('generate: basic 15,000 + HRA 5,000 + grossMonthly 10,000 -> SALARY 10,000 + BASIC + HRA', async () => {
    const run = await svc.getRun(companyId, runId);
    const line = run.lines.find((l) => l.employeeId === emp.basic.id)!;
    assert.equal(amt(earn(line), 'SALARY'), 10000);
    assert.equal(amt(earn(line), 'BASIC'), 15000);
    assert.equal(amt(earn(line), 'HRA'), 5000);
    assert.equal(Number(line.grossEarnings), 30000);
    assert.equal(Number(line.netPay), 30000);
  });

  test('generate: 2 LOP days in a 30-day month with no Basic prorates the SALARY line (2,000 on 30,000)', async () => {
    const run = await svc.getRun(companyId, runId);
    const line = run.lines.find((l) => l.employeeId === emp.lop.id)!;
    assert.equal(line.lopDays, 2);
    assert.equal(amt(earn(line), 'SALARY'), 30000);
    assert.equal(amt(ded(line), 'LOP'), 2000);
    assert.equal(Number(line.totalDeductions), 2000);
    assert.equal(Number(line.netPay), 28000);
  });

  test('every line satisfies gross - deductions = net', async () => {
    const run = await svc.getRun(companyId, runId);
    for (const l of run.lines) {
      assert.equal(
        Number(l.grossEarnings) - Number(l.totalDeductions),
        Number(l.netPay),
        `employee ${l.employeeId}`,
      );
    }
  });

  test('with default statutory toggles (TDS on) a 30,000/month salary still nets gross - deductions', async () => {
    await prisma.employeePayrollConfig.update({
      where: { employeeId: emp.gross.id },
      data: { configJson: { allowances: { custom: [] }, deductions: { custom: [] } } as any },
    });
    const run = await svc.generate(hr, { year: YEAR, month: MONTH } as any);
    runId = run.id;
    const line = run.lines.find((l) => l.employeeId === emp.gross.id)!;
    assert.equal(amt(earn(line), 'SALARY'), 30000);
    assert.equal(Number(line.grossEarnings) - Number(line.totalDeductions), Number(line.netPay));
    assert.ok(Number(line.netPay) <= 30000 && Number(line.netPay) > 0);
  });

  test('payslips are invisible to employees while the run is in REVIEW', async () => {
    const e = authUser(companyId, ['EMPLOYEE'], emp.gross.id);
    assert.deepEqual(await svc.myPayslips(e), []);
    const run = await svc.getRun(companyId, runId);
    const line = run.lines.find((l) => l.employeeId === emp.gross.id)!;
    await assert.rejects(svc.myPayslip(e, line.id), NotFoundException);
  });

  test('cross-company: another company cannot read the run', async () => {
    await assert.rejects(svc.getRun(otherCompanyId, runId), NotFoundException);
    await assert.rejects(svc.approve(authUser(otherCompanyId, ['HR']), runId), NotFoundException);
  });

  test('approve locks the run; regenerate and re-approve are refused', async () => {
    const run = await svc.approve(hr, runId);
    assert.equal(run.status, 'LOCKED');
    assert.ok(run.approvedAt);
    assert.equal(run.approvedBy, hr.id);
    await assert.rejects(svc.approve(hr, runId), BadRequestException);
    await assert.rejects(svc.generate(hr, { year: YEAR, month: MONTH } as any), BadRequestException);
  });

  test('an EMPLOYEE sees only their own payslips once the run is APPROVED/LOCKED', async () => {
    const run = await svc.getRun(companyId, runId);
    const gross = run.lines.find((l) => l.employeeId === emp.gross.id)!;
    const basic = run.lines.find((l) => l.employeeId === emp.basic.id)!;

    const e = authUser(companyId, ['EMPLOYEE'], emp.gross.id);
    const mine = await svc.myPayslips(e);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].id, gross.id);

    const slip = await svc.myPayslip(e, gross.id);
    assert.equal(slip.employeeId, emp.gross.id);
    // IDOR: someone else's payslip id is indistinguishable from a missing one
    await assert.rejects(svc.myPayslip(e, basic.id), NotFoundException);
  });

  test('an APPROVED (not yet locked) run is also visible to its employee', async () => {
    await prisma.payrollRun.update({ where: { id: runId }, data: { status: 'APPROVED' } });
    const e = authUser(companyId, ['EMPLOYEE'], emp.lop.id);
    const mine = await svc.myPayslips(e);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].employeeId, emp.lop.id);
    await prisma.payrollRun.update({ where: { id: runId }, data: { status: 'LOCKED' } });
  });

  test('a user with no linked employee profile has no payslips', async () => {
    await assert.rejects(svc.myPayslips(authUser(companyId, ['EMPLOYEE'], null)), ForbiddenException);
  });
});
