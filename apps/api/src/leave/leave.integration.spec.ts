import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LeaveService } from './leave.service';
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
 * Leave approval chain against a real database (set TEST_DATABASE_URL to run).
 * Default chain: step 1 ADMIN (the applicant's reporting manager), step 2 HR; the balance is
 * debited only when the final step approves.
 */
describe('leave approval chain', { skip: SKIP_NO_DB }, () => {
  let prisma: PrismaClient;
  let svc: LeaveService;
  let companyId: string;
  let otherCompanyId: string;
  let applicant: any;
  let manager: any;
  let stranger: any;
  let hrEmp: any;
  let clTypeId: string;
  const year = 2027;
  let monthSeed = 0;

  const as = (roles: string[], employeeId: string | null) => authUser(companyId, roles, employeeId);
  const applicantUser = () => as(['EMPLOYEE'], applicant.id);
  const managerUser = () => as(['ADMIN'], manager.id);
  const strangerAdmin = () => as(['ADMIN'], stranger.id);
  const hrUser = () => as(['HR'], hrEmp.id);

  /** Each test uses its own days so applications never overlap. */
  function dates(days = 1) {
    const day = 1 + (monthSeed += 3);
    const from = new Date(Date.UTC(year, 2, day));
    const to = new Date(Date.UTC(year, 2, day + days - 1));
    return { fromDate: from.toISOString().slice(0, 10), toDate: to.toISOString().slice(0, 10) };
  }

  async function balance() {
    return prisma.leaveBalance.findUniqueOrThrow({
      where: { employeeId_leaveTypeId_year: { employeeId: applicant.id, leaveTypeId: clTypeId, year } },
    });
  }

  before(async () => {
    prisma = connect();
    svc = new LeaveService(prisma as any, auditFor(prisma) as any, workflowStub);
    companyId = (await createCompany(prisma)).id;
    otherCompanyId = (await createCompany(prisma, 'Other Co')).id;

    manager = await createEmployee(prisma, companyId, 'Manager');
    stranger = await createEmployee(prisma, companyId, 'Stranger');
    hrEmp = await createEmployee(prisma, companyId, 'HrPerson');
    applicant = await createEmployee(prisma, companyId, 'Applicant', { reportingToId: manager.id });

    const types = await svc.ensureDefaultTypes(companyId);
    clTypeId = types.find((t) => t.code === 'CL')!.id;
    await prisma.leaveBalance.create({
      data: { companyId, employeeId: applicant.id, leaveTypeId: clTypeId, year, opening: 5 },
    });
  });

  after(async () => {
    await destroyCompany(prisma, companyId);
    await destroyCompany(prisma, otherCompanyId);
    await prisma.$disconnect();
  });

  test('apply creates a PENDING application with the default ADMIN -> HR steps, balance untouched', async () => {
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(2), reason: 'trip' } as any);
    assert.equal(app.status, 'PENDING');
    assert.equal(app.days, 2);
    assert.equal(app.currentStep, 1);
    const steps = [...app.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    assert.deepEqual(steps.map((s) => s.approverRole), ['ADMIN', 'HR']);
    assert.equal(steps[0].approverId, manager.id);
    assert.equal((await balance()).used, 0);
  });

  test('step approvals advance the chain and only the FINAL approval debits the balance', async () => {
    const before = (await balance()).used;
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(2), reason: 'x' } as any);

    const afterStep1 = await svc.review(managerUser(), app.id, { status: 'APPROVED' } as any);
    assert.equal(afterStep1.status, 'PENDING');
    assert.equal(afterStep1.currentStep, 2);
    assert.equal((await balance()).used, before, 'no debit after step 1');

    const final = await svc.review(hrUser(), app.id, { status: 'APPROVED' } as any);
    assert.equal(final.status, 'APPROVED');
    assert.equal((await balance()).used, before + 2);

    const ledger = await prisma.leaveLedgerEntry.findMany({ where: { applicationId: app.id } });
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].entryType, 'DEBIT');
    assert.equal(ledger[0].days, 2);
    // 5 opening - 2 used
    assert.equal(ledger[0].balanceAfter, 5 - (before + 2));

    await assert.rejects(
      svc.review(hrUser(), app.id, { status: 'APPROVED' } as any),
      (e: any) => e instanceof BadRequestException && /not pending/.test(e.message),
      'approving twice must not double-debit',
    );
    assert.equal((await balance()).used, before + 2);
  });

  test('HR/SUPER_ADMIN may act on any step (override), so a single HR can run the whole chain', async () => {
    const before = (await balance()).used;
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    await svc.review(hrUser(), app.id, { status: 'APPROVED' } as any);
    const done = await svc.review(hrUser(), app.id, { status: 'APPROVED' } as any);
    assert.equal(done.status, 'APPROVED');
    assert.equal((await balance()).used, before + 1);
  });

  test('an ADMIN who is not the reporting manager cannot approve step 1', async () => {
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    await assert.rejects(svc.review(strangerAdmin(), app.id, { status: 'APPROVED' } as any), ForbiddenException);
  });

  test('an EMPLOYEE cannot review at all', async () => {
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    await assert.rejects(svc.review(applicantUser(), app.id, { status: 'APPROVED' } as any), ForbiddenException);
  });

  test('reject: terminal, no debit, and cannot be approved afterwards', async () => {
    const before = (await balance()).used;
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    const rejected = await svc.review(managerUser(), app.id, { status: 'REJECTED', comment: 'no' } as any);
    assert.equal(rejected.status, 'REJECTED');
    assert.equal((await balance()).used, before);
    await assert.rejects(svc.review(hrUser(), app.id, { status: 'APPROVED' } as any), BadRequestException);
  });

  test('review only accepts APPROVED or REJECTED', async () => {
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    await assert.rejects(svc.review(hrUser(), app.id, { status: 'WITHDRAWN' } as any), BadRequestException);
  });

  test('withdraw before final approval works, and then it cannot be approved', async () => {
    const before = (await balance()).used;
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    await svc.review(managerUser(), app.id, { status: 'APPROVED' } as any); // step 1 done, still pending
    const withdrawn = await svc.cancel(applicantUser(), app.id);
    assert.equal(withdrawn.status, 'WITHDRAWN');
    await assert.rejects(svc.review(hrUser(), app.id, { status: 'APPROVED' } as any), BadRequestException);
    assert.equal((await balance()).used, before);
  });

  test('withdraw after final approval is refused', async () => {
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    await svc.review(hrUser(), app.id, { status: 'APPROVED' } as any);
    await svc.review(hrUser(), app.id, { status: 'APPROVED' } as any);
    await assert.rejects(
      svc.cancel(applicantUser(), app.id),
      (e: any) => e instanceof BadRequestException && /Only pending/.test(e.message),
    );
  });

  test('insufficient balance is rejected at apply time (no application row created)', async () => {
    const count = await prisma.leaveApplication.count({ where: { employeeId: applicant.id } });
    await assert.rejects(
      svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(10), reason: 'long' } as any),
      (e: any) => e instanceof BadRequestException && /Insufficient balance/.test(e.message),
    );
    assert.equal(await prisma.leaveApplication.count({ where: { employeeId: applicant.id } }), count);
  });

  test('toDate before fromDate is rejected', async () => {
    await assert.rejects(
      svc.apply(applicantUser(), { leaveTypeId: clTypeId, fromDate: '2027-03-10', toDate: '2027-03-09', reason: 'x' } as any),
      BadRequestException,
    );
  });

  test('a user without an employee profile cannot apply', async () => {
    await assert.rejects(
      svc.apply(as(['EMPLOYEE'], null), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any),
      ForbiddenException,
    );
  });

  test('IDOR: another employee cannot withdraw my application; applications list is own-only', async () => {
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    await assert.rejects(svc.cancel(as(['EMPLOYEE'], stranger.id), app.id), NotFoundException);
    assert.deepEqual(await svc.myApplications(as(['EMPLOYEE'], stranger.id)), []);
    assert.ok((await svc.myApplications(applicantUser())).some((a) => a.id === app.id));
  });

  test('cross-company: HR of another company cannot review this application', async () => {
    const app = await svc.apply(applicantUser(), { leaveTypeId: clTypeId, ...dates(1), reason: 'x' } as any);
    await assert.rejects(
      svc.review(authUser(otherCompanyId, ['HR'], null), app.id, { status: 'APPROVED' } as any),
      NotFoundException,
    );
  });
});
