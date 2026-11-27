import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { EmployeesService } from '../employees/employees.service';
import { EmployeePayrollService } from '../employees/employee-payroll.service';
import { StatutoryRulesService } from '../payroll/statutory/statutory-rules.service';
import { EmployeeImportService } from './employee-import.service';
import { SKIP_NO_DB, auditFor, authUser, connect, createCompany, destroyCompany } from '../testing/test-db';

/**
 * Employee master import against a real database (TEST database only; synthetic test rows).
 * Covers preview, the Super-Admin-only commit, file checksum binding, backup confirmation,
 * duplicate detection, no overwrite of existing employees, and safe re-import.
 */
async function xlsx(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employees');
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const HEAD = ['Employee ID', 'Full Name', 'Mobile Number', 'Email', 'Joining Date', 'Department', 'Designation', 'Gross Monthly Salary'];
const file = (buffer: Buffer) => ({ originalname: 'employees.xlsx', size: buffer.length, buffer });

describe('employee master import', { skip: SKIP_NO_DB }, () => {
  let prisma: PrismaClient;
  let svc: EmployeeImportService;
  let companyId: string;
  let sa: ReturnType<typeof authUser>;
  let hr: ReturnType<typeof authUser>;

  before(async () => {
    prisma = connect();
    companyId = (await createCompany(prisma, 'Import Co')).id;
    await prisma.role.createMany({ data: [{ companyId, code: 'EMPLOYEE', name: 'Employee' }] });
    const audit = auditFor(prisma);
    const lifecycleStub = { startOnboarding: async () => undefined };
    const employees = new EmployeesService(prisma as any, audit as any, lifecycleStub as any);
    const payroll = new EmployeePayrollService(prisma as any, new StatutoryRulesService(prisma as any));
    svc = new EmployeeImportService(prisma as any, { get: () => undefined } as any, audit as any, employees, payroll);
    sa = authUser(companyId, ['SUPER_ADMIN']);
    hr = authUser(companyId, ['HR']);
    // An existing employee the import must not overwrite.
    await prisma.employee.create({ data: { companyId, employeeCode: 'IMP-EXIST', firstName: 'Existing', mobile: '9811111111', email: 'existing@imp.test' } });
  });

  after(async () => {
    await destroyCompany(prisma, companyId);
    await prisma.$disconnect();
  });

  test('preview reports errors, in-file duplicates and clashes with existing employees', async () => {
    const buf = await xlsx([
      HEAD,
      ['IMP-001', 'Asha Test', '9822222221', 'asha@imp.test', '01-04-2026', 'IT', 'Engineer', 40000],
      ['IMP-002', 'Bad Mobile', '12345', 'bad@imp.test', '01-04-2026', 'IT', 'Engineer', 40000],
      ['IMP-003', 'Dup Email', '9822222223', 'asha@imp.test', '01-04-2026', 'IT', 'Engineer', 40000],
      ['IMP-EXIST', 'Existing', '9811111112', 'existing2@imp.test', '01-04-2026', 'IT', 'Engineer', 40000],
      ['IMP-004', 'Clash Mobile', '9811111111', 'clash@imp.test', '01-04-2026', 'IT', 'Engineer', 40000],
    ]);
    const p = await svc.preview(hr, file(buf));
    assert.deepEqual(p.summary, { totalRows: 5, ready: 1, existing: 1, errors: 3 });
    assert.equal(p.canImport, false);
    const byCode = Object.fromEntries(p.rows.map((r) => [r.employeeCode, r]));
    assert.equal(byCode['IMP-002'].errors[0].field, 'Mobile Number');
    assert.match(byCode['IMP-003'].errors.map((e) => e.message).join(), /duplicate of row 2/);
    assert.match(byCode['IMP-004'].errors.map((e) => e.message).join(), /already registered to employee IMP-EXIST/);
    assert.equal(byCode['IMP-EXIST'].status, 'exists');
    // Nothing was created by the preview.
    assert.equal(await prisma.employee.count({ where: { companyId } }), 1);
    // The audit record holds counts / reasons only — no names, mobiles or emails.
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: p.jobId } });
    assert.ok(!JSON.stringify(job.errorReport).includes('@imp.test'));
    assert.ok(!JSON.stringify(job.errorReport).includes('9822222223'));
  });

  test('commit: only Super Admin, same file, backup confirmed, zero errors', async () => {
    const good = await xlsx([
      HEAD,
      ['IMP-101', 'Ravi Test', '9833333331', 'ravi@imp.test', '2026-04-01', 'Finance', 'Accountant', 52000],
      ['IMP-102', 'Meera Test', '+91 98333 33332', 'Meera@Imp.Test', '15/05/2026', 'HR', 'Executive', 35000],
      ['IMP-EXIST', 'Existing', '9811111111', 'existing@imp.test', '01-04-2026', 'IT', 'Engineer', 40000],
    ]);
    const p = await svc.preview(sa, file(good));
    assert.equal(p.canImport, true);
    assert.deepEqual(p.summary, { totalRows: 3, ready: 2, existing: 1, errors: 0 });

    await assert.rejects(svc.commit(hr, file(good), p.jobId, true), ForbiddenException);
    await assert.rejects(svc.commit(sa, file(good), p.jobId, false), /backup/);
    const other = await xlsx([HEAD, ['IMP-999', 'Other', '9844444444', 'o@imp.test', '2026-04-01', 'X', 'Y', 1000]]);
    await assert.rejects(svc.commit(sa, file(other), p.jobId, true), /differs from the previewed file/);

    const r = await svc.commit(sa, file(good), p.jobId, true);
    assert.deepEqual([r.status, r.created, r.skippedExisting, r.failed.length], ['COMPLETED', 2, 1, 0]);

    const meera = await prisma.employee.findFirstOrThrow({
      where: { companyId, employeeCode: 'IMP-102' },
      include: { user: { include: { userRoles: { include: { role: true } } } } },
    });
    assert.equal(meera.email, 'meera@imp.test');
    assert.equal(meera.mobile, '9833333332');
    assert.equal(meera.department, 'HR');
    assert.equal(meera.user?.userRoles[0]?.role.code, 'EMPLOYEE');
    assert.equal(meera.user?.forcePasswordChange, true);
    const cfg = await prisma.employeePayrollConfig.findUniqueOrThrow({ where: { employeeId: meera.id } });
    assert.equal(Number(cfg.grossMonthly), 35000);
    // The existing employee was not touched.
    const ex = await prisma.employee.findFirstOrThrow({ where: { companyId, employeeCode: 'IMP-EXIST' } });
    assert.equal(ex.firstName, 'Existing');

    // A preview can be used only once.
    await assert.rejects(svc.commit(sa, file(good), p.jobId, true), /already used/);
  });

  test('re-importing the same file creates no duplicates', async () => {
    const before = await prisma.employee.count({ where: { companyId } });
    const again = await xlsx([
      HEAD,
      ['IMP-101', 'Ravi Test', '9833333331', 'ravi@imp.test', '2026-04-01', 'Finance', 'Accountant', 52000],
      ['IMP-102', 'Meera Test', '+91 98333 33332', 'meera@imp.test', '15/05/2026', 'HR', 'Executive', 35000],
    ]);
    const p = await svc.preview(sa, file(again));
    assert.deepEqual(p.summary, { totalRows: 2, ready: 0, existing: 2, errors: 0 });
    assert.equal(p.canImport, false);
    assert.equal(await prisma.employee.count({ where: { companyId } }), before);
  });

  test('rejects missing columns and non-spreadsheet files', async () => {
    await assert.rejects(svc.preview(hr, file(await xlsx([['Employee ID', 'Full Name'], ['A', 'B']]))), BadRequestException);
    await assert.rejects(svc.preview(hr, { originalname: 'x.xlsx', size: 4, buffer: Buffer.from('junk') }), /\.xlsx/);
  });
});
