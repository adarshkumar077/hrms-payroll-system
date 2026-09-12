/**
 * Ensures enterprise test accounts exist with correct passwords.
 * Run: npx tsx prisma/ensure-accounts.ts
 */
import { PrismaClient, RoleCode, UserStatus, EmploymentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ROLE_DEFS: { code: RoleCode; name: string; description: string }[] = [
  { code: RoleCode.SUPER_ADMIN, name: 'Super Admin', description: 'Full system access' },
  { code: RoleCode.ADMIN, name: 'Admin', description: 'Operational control' },
  { code: RoleCode.HR, name: 'HR', description: 'HR operations' },
  { code: RoleCode.EMPLOYEE, name: 'Employee', description: 'Employee portal' },
];

const ACCOUNTS = [
  { loginId: 'superadmin', email: 'superadmin@company.com', password: 'Super@123', displayName: 'Super Admin', role: RoleCode.SUPER_ADMIN, employeeCode: 'SA001', firstName: 'Super', lastName: 'Admin', department: 'Management', designation: 'Super Admin' },
  { loginId: 'admin', email: 'admin@company.com', password: 'Admin@123', displayName: 'System Admin', role: RoleCode.ADMIN, employeeCode: 'ADM001', firstName: 'System', lastName: 'Admin', department: 'Operations', designation: 'Admin' },
  { loginId: 'hr001', email: 'hr001@company.com', password: 'HR@123', displayName: 'HR Manager', role: RoleCode.HR, employeeCode: 'HR001', firstName: 'HR', lastName: 'Manager', department: 'Human Resources', designation: 'HR' },
  { loginId: 'emp001', email: 'emp001@company.com', password: 'Emp@123', displayName: 'Sample Employee', role: RoleCode.EMPLOYEE, employeeCode: 'EMP001', firstName: 'Sample', lastName: 'Employee', department: 'General', designation: 'Employee' },
] as const;

async function ensureRoles(companyId: string) {
  const roleMap = new Map<RoleCode, string>();
  for (const def of ROLE_DEFS) {
    let role = await prisma.role.findFirst({
      where: { companyId, code: def.code },
    });
    if (!role) {
      role = await prisma.role.create({
        data: {
          companyId,
          code: def.code,
          name: def.name,
          description: def.description,
          isSystem: true,
        },
      });
    }
    roleMap.set(def.code, role.id);
  }
  return roleMap;
}

async function main() {
  const company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) throw new Error('No active company — run prisma:seed first');

  const roleMap = await ensureRoles(company.id);

  for (const acc of ACCOUNTS) {
    let employee = await prisma.employee.findFirst({
      where: { companyId: company.id, employeeCode: acc.employeeCode },
    });
    if (!employee) {
      employee = await prisma.employee.create({
        data: {
          companyId: company.id,
          employeeCode: acc.employeeCode,
          firstName: acc.firstName,
          lastName: acc.lastName,
          department: acc.department,
          designation: acc.designation,
          status: EmploymentStatus.ACTIVE,
          isActive: true,
          joinedAt: new Date(),
        },
      });
    } else {
      employee = await prisma.employee.update({
        where: { id: employee.id },
        data: {
          firstName: acc.firstName,
          lastName: acc.lastName,
          department: acc.department,
          designation: acc.designation,
          status: EmploymentStatus.ACTIVE,
          isActive: true,
        },
      });
    }

    const passwordHash = await bcrypt.hash(acc.password, 12);
    const roleId = roleMap.get(acc.role)!;
    let user = await prisma.user.findFirst({
      where: { companyId: company.id, loginId: acc.loginId },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          email: acc.email,
          displayName: acc.displayName,
          status: UserStatus.ACTIVE,
          forcePasswordChange: false,
          employeeId: employee.id,
          failedLoginAttempts: 0,
          lockedAt: null,
        },
      });
      await prisma.userRole.deleteMany({ where: { userId: user.id } });
      await prisma.userRole.create({ data: { userId: user.id, roleId } });
    } else {
      await prisma.user.create({
        data: {
          companyId: company.id,
          loginId: acc.loginId,
          email: acc.email,
          passwordHash,
          displayName: acc.displayName,
          status: UserStatus.ACTIVE,
          forcePasswordChange: false,
          employeeId: employee.id,
          userRoles: { create: [{ roleId }] },
        },
      });
    }
    console.log(`OK ${acc.role}: ${acc.loginId} / ${acc.password}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
