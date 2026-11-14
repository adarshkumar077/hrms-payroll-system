import { PrismaClient } from '@prisma/client';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AuditService } from '../audit/audit.service';

/**
 * Integration-test helpers. Specs that need real SQL run only when TEST_DATABASE_URL points at a
 * database that has had `prisma migrate deploy` applied; otherwise they are skipped so `npm test`
 * still passes without a database. Each spec creates its own company and removes it afterwards.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const HAS_DB = Boolean(TEST_DATABASE_URL);
export const SKIP_NO_DB = HAS_DB ? false : 'TEST_DATABASE_URL not set (integration test skipped)';

export function connect() {
  return new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
}

export function auditFor(prisma: PrismaClient) {
  return new AuditService(prisma as any);
}

/** Workflow engine stand-in: leave/payroll treat workflow errors as non-fatal. */
export const workflowStub = {
  startInstance: async () => ({}),
  syncFromLegacy: async () => ({}),
} as any;

let seq = 0;
export function uniq(prefix: string) {
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${++seq}`;
}

export async function createCompany(prisma: PrismaClient, name = 'Test Co') {
  return prisma.company.create({ data: { name: uniq(name) } });
}

export async function createEmployee(
  prisma: PrismaClient,
  companyId: string,
  firstName: string,
  extra: Record<string, unknown> = {},
) {
  return prisma.employee.create({
    data: { companyId, employeeCode: uniq('E'), firstName, ...extra } as any,
  });
}

export function authUser(
  companyId: string,
  roles: string[],
  employeeId: string | null = null,
  id = uniq('user'),
): AuthUser {
  return { id, companyId, displayName: id, roles, employeeId, moduleAccess: [] };
}

/** Best-effort teardown of everything a spec created under a company. */
export async function destroyCompany(prisma: PrismaClient, companyId: string) {
  try {
    await prisma.payrollRun.deleteMany({ where: { companyId } });
    await prisma.leaveApplication.deleteMany({ where: { companyId } });
    await prisma.leaveLedgerEntry.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  } catch (err) {
    console.warn(`test cleanup for company ${companyId} failed: ${(err as Error).message}`);
  }
}
