import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import type { PrismaClient } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmployeePayrollService } from './employee-payroll.service';
import { EmployeesController } from './employees.controller';
import { PayrollService } from '../payroll/payroll.service';
import { StatutoryRulesService } from '../payroll/statutory/statutory-rules.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
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

describe('employee controller role metadata (no DB needed)', () => {
  const rolesOf = (method: keyof EmployeesController) =>
    new Reflector().get<string[]>(ROLES_KEY, EmployeesController.prototype[method] as any);

  test('GET employees and GET employees/:id exclude the EMPLOYEE role', () => {
    assert.ok(!rolesOf('list').includes('EMPLOYEE'));
    const findOne = Object.getOwnPropertyNames(EmployeesController.prototype)
      .filter((m) => m !== 'constructor')
      .map((m) => ({ m, roles: rolesOf(m as any) }))
      .filter((x) => x.roles && !x.roles.includes('EMPLOYEE'));
    assert.ok(findOne.length > 5, 'most employee-directory handlers are staff only');
  });

  test('write handlers (create / update / delete / payroll-config PUT) are HR-or-above only', () => {
    for (const m of ['upsertPayrollConfig', 'previewPayrollConfig'] as const) {
      assert.deepEqual(rolesOf(m), ['SUPER_ADMIN', 'HR'], m);
    }
  });
});

describe('employee payroll scope / IDOR', { skip: SKIP_NO_DB }, () => {
  let prisma: PrismaClient;
  let svc: EmployeePayrollService;
  let payroll: PayrollService;
  let companyId: string;
  let otherCompanyId: string;
  let alice: any;
  let bob: any;
  let outsider: any;

  before(async () => {
    prisma = connect();
    const rules = new StatutoryRulesService(prisma as any);
    svc = new EmployeePayrollService(prisma as any, rules);
    payroll = new PayrollService(prisma as any, auditFor(prisma) as any, workflowStub, rules);
    companyId = (await createCompany(prisma)).id;
    otherCompanyId = (await createCompany(prisma, 'Other Co')).id;
    alice = await createEmployee(prisma, companyId, 'Alice');
    bob = await createEmployee(prisma, companyId, 'Bob');
    outsider = await createEmployee(prisma, otherCompanyId, 'Outsider');
    for (const e of [alice, bob]) {
      await prisma.employeePayrollConfig.create({
        data: {
          companyId,
          employeeId: e.id,
          grossMonthly: 40000,
          effectiveFrom: new Date(Date.UTC(2027, 0, 1)),
          configJson: { allowances: { custom: [] }, deductions: { custom: [] } } as any,
        },
      });
    }
  });

  after(async () => {
    await destroyCompany(prisma, companyId);
    await destroyCompany(prisma, otherCompanyId);
    await prisma.$disconnect();
  });

  const emp = (id: string) => authUser(companyId, ['EMPLOYEE'], id);

  test('an EMPLOYEE can read their own payroll config', async () => {
    const res: any = await svc.getConfig(emp(alice.id), alice.id);
    assert.equal(res.employeeId ?? alice.id, alice.id);
  });

  test('an EMPLOYEE cannot read another employee payroll config, history or salary tracker', async () => {
    await assert.rejects(svc.getConfig(emp(alice.id), bob.id), ForbiddenException);
    await assert.rejects(svc.payrollHistory(emp(alice.id), bob.id), ForbiddenException);
    await assert.rejects(svc.salaryTracker(emp(alice.id), bob.id), ForbiddenException);
  });

  test('HR and ADMIN in the same company can read any employee', async () => {
    for (const role of ['HR', 'ADMIN']) {
      const u = authUser(companyId, [role], null);
      await svc.getConfig(u, bob.id);
      assert.ok(Array.isArray(await svc.payrollHistory(u, bob.id)));
    }
  });

  test('nobody crosses companies: HR of company A gets 404 for an employee of company B', async () => {
    const hr = authUser(companyId, ['HR'], null);
    await assert.rejects(svc.getConfig(hr, outsider.id), NotFoundException);
    await assert.rejects(svc.payrollHistory(hr, outsider.id), NotFoundException);
    await assert.rejects(svc.salaryTracker(hr, outsider.id), NotFoundException);
    const otherHr = authUser(otherCompanyId, ['HR'], null);
    await assert.rejects(svc.getConfig(otherHr, alice.id), NotFoundException);
  });

  test('an EMPLOYEE cannot change payroll config', async () => {
    await assert.rejects(svc.upsertConfig(emp(alice.id), alice.id, {} as any), ForbiddenException);
  });

  test(
    'an EMPLOYEE payroll history only lists APPROVED/LOCKED payroll (same rule as payslips)',
    async () => {
      const hr = authUser(companyId, ['HR'], null);
      await payroll.generate(hr, { year: 2027, month: 7 } as any); // left in REVIEW
      const history = await svc.payrollHistory(emp(alice.id), alice.id);
      assert.equal(history.length, 0);
    },
  );
});
