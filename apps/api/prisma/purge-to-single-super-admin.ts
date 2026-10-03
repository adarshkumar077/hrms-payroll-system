/**
 * One-shot: remove all login users except a single Super Admin (admin@eitf.in).
 * Preserves Employee / attendance / payroll / asset and all other HRMS business data.
 * Explicit ops script — does not run as part of normal migrate/seed.
 */
import { PrismaClient, RoleCode, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const KEEP_EMAIL = 'admin@eitf.in';
const KEEP_LOGIN = 'admin@eitf.in';
const KEEP_PASSWORD = 'Admin@123';
const KEEP_DISPLAY = 'Super Admin';

async function main() {
  const beforeUsers = await prisma.user.findMany({
    include: { userRoles: { include: { role: true } }, employee: true },
  });
  const beforeEmployees = await prisma.employee.count();
  const beforeAttendance = await prisma.attendanceRecord.count().catch(() => -1);
  const beforeAssets = await prisma.asset.count().catch(() => -1);

  const backupDir = path.join(process.cwd(), 'prisma', 'backups');
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `users-before-purge-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        beforeEmployees,
        beforeAttendance,
        beforeAssets,
        users: beforeUsers.map((u) => ({
          id: u.id,
          companyId: u.companyId,
          loginId: u.loginId,
          email: u.email,
          displayName: u.displayName,
          status: u.status,
          employeeId: u.employeeId,
          employeeCode: u.employee?.employeeCode ?? null,
          roles: u.userRoles.map((r) => r.role.code),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`Backup written: ${backupPath}`);
  console.log(
    `Before: users=${beforeUsers.length} employees=${beforeEmployees} attendance=${beforeAttendance} assets=${beforeAssets}`,
  );

  const company = await prisma.company.findFirst();
  if (!company) throw new Error('No company found — aborting');

  let superRole = await prisma.role.findFirst({
    where: { companyId: company.id, code: RoleCode.SUPER_ADMIN },
  });
  if (!superRole) {
    superRole = await prisma.role.create({
      data: {
        companyId: company.id,
        code: RoleCode.SUPER_ADMIN,
        name: 'Super Admin',
        description: 'Full system access',
        isSystem: true,
      },
    });
  }

  // Ensure other system roles remain so Super Admin can create Admin/HR/Employee later
  for (const def of [
    { code: RoleCode.ADMIN, name: 'Admin', description: 'Operational control' },
    { code: RoleCode.HR, name: 'HR', description: 'HR operations' },
    { code: RoleCode.EMPLOYEE, name: 'Employee', description: 'Employee portal' },
  ] as const) {
    const existing = await prisma.role.findFirst({
      where: { companyId: company.id, code: def.code },
    });
    if (!existing) {
      await prisma.role.create({
        data: {
          companyId: company.id,
          code: def.code,
          name: def.name,
          description: def.description,
          isSystem: true,
        },
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    // Unlink users from employees so deleting users cannot affect employee rows
    await tx.user.updateMany({ data: { employeeId: null } });

    // Delete all users (cascades auth sessions/roles/tokens; employees untouched)
    await tx.user.deleteMany({});

    const passwordHash = await bcrypt.hash(KEEP_PASSWORD, 12);
    await tx.user.create({
      data: {
        companyId: company.id,
        loginId: KEEP_LOGIN,
        email: KEEP_EMAIL,
        passwordHash,
        displayName: KEEP_DISPLAY,
        status: UserStatus.ACTIVE,
        forcePasswordChange: false,
        employeeId: null,
        userRoles: { create: [{ roleId: superRole!.id }] },
      },
    });
  });

  const afterUsers = await prisma.user.findMany({
    include: { userRoles: { include: { role: true } } },
  });
  const afterEmployees = await prisma.employee.count();
  const afterAttendance = await prisma.attendanceRecord.count().catch(() => -1);
  const afterAssets = await prisma.asset.count().catch(() => -1);

  console.log('After users:');
  for (const u of afterUsers) {
    console.log(
      `  ${u.loginId} / ${u.email} roles=${u.userRoles.map((r) => r.role.code).join(',')}`,
    );
  }
  console.log(
    `After: users=${afterUsers.length} employees=${afterEmployees} attendance=${afterAttendance} assets=${afterAssets}`,
  );

  if (afterUsers.length !== 1) throw new Error('Expected exactly 1 user');
  if (afterUsers[0].email !== KEEP_EMAIL) throw new Error('Keep email mismatch');
  if (!afterUsers[0].userRoles.some((r) => r.role.code === RoleCode.SUPER_ADMIN)) {
    throw new Error('Keep user is not SUPER_ADMIN');
  }
  if (afterEmployees !== beforeEmployees) {
    throw new Error(`Employee count changed ${beforeEmployees} -> ${afterEmployees}`);
  }
  if (beforeAttendance >= 0 && afterAttendance !== beforeAttendance) {
    throw new Error(`Attendance count changed ${beforeAttendance} -> ${afterAttendance}`);
  }
  if (beforeAssets >= 0 && afterAssets !== beforeAssets) {
    throw new Error(`Asset count changed ${beforeAssets} -> ${afterAssets}`);
  }

  console.log('Purge complete: only Super Admin admin@eitf.in remains; business data preserved.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
