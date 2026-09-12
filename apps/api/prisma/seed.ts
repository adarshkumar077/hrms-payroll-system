import { PrismaClient, RoleCode, Prisma, UserStatus, EmploymentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_COMPANY_SETTINGS, DEFAULT_POLICIES } from '../src/company/default-settings';

const prisma = new PrismaClient();

const ENTERPRISE_ACCOUNTS = [
  {
    loginId: 'superadmin',
    email: 'superadmin@company.com',
    password: 'Super@123',
    displayName: 'Super Admin',
    role: RoleCode.SUPER_ADMIN,
    employeeCode: 'SA001',
    firstName: 'Super',
    lastName: 'Admin',
    department: 'Management',
    designation: 'Super Admin',
  },
  {
    loginId: 'admin',
    email: 'admin@company.com',
    password: 'Admin@123',
    displayName: 'System Admin',
    role: RoleCode.ADMIN,
    employeeCode: 'ADM001',
    firstName: 'System',
    lastName: 'Admin',
    department: 'Operations',
    designation: 'Admin',
  },
  {
    loginId: 'hr001',
    email: 'hr001@company.com',
    password: 'HR@123',
    displayName: 'HR Manager',
    role: RoleCode.HR,
    employeeCode: 'HR001',
    firstName: 'HR',
    lastName: 'Manager',
    department: 'Human Resources',
    designation: 'HR',
  },
  {
    loginId: 'emp001',
    email: 'emp001@company.com',
    password: 'Emp@123',
    displayName: 'Sample Employee',
    role: RoleCode.EMPLOYEE,
    employeeCode: 'EMP001',
    firstName: 'Sample',
    lastName: 'Employee',
    department: 'General',
    designation: 'Employee',
  },
] as const;

async function wipeLegacyAuth(companyId: string) {
  await prisma.refreshToken.deleteMany({ where: { user: { companyId } } });
  await prisma.otpChallenge.deleteMany({ where: { companyId } });
  await prisma.loginSession.deleteMany({ where: { companyId } });
  await prisma.userRole.deleteMany({ where: { role: { companyId } } });
  await prisma.userModuleAccess.deleteMany({ where: { user: { companyId } } });
  await prisma.user.updateMany({
    where: { companyId },
    data: { employeeId: null },
  });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.role.deleteMany({ where: { companyId } });
}

async function main() {
  const companyName = 'EITF Enhancing IT Infrastructure Pvt. Ltd.';

  let company = await prisma.company.findFirst({ where: { name: companyName } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: companyName,
        legalName: companyName,
        phone: '+91-0000000000',
        addressLine1: 'To be configured',
        city: 'To be configured',
        state: 'To be configured',
        country: 'India',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
      },
    });
  }

  for (const setting of DEFAULT_COMPANY_SETTINGS) {
    await prisma.companySetting.upsert({
      where: { companyId_key: { companyId: company.id, key: setting.key } },
      create: {
        companyId: company.id,
        key: setting.key,
        value: setting.value as Prisma.InputJsonValue,
        label: setting.label,
        group: setting.group,
      },
      update: {},
    });
  }

  for (const policy of DEFAULT_POLICIES) {
    await prisma.companyPolicy.upsert({
      where: { companyId_code: { companyId: company.id, code: policy.code } },
      create: {
        companyId: company.id,
        code: policy.code,
        title: policy.title,
        description: policy.description,
        content: policy.content,
        isEnabled: policy.isEnabled,
      },
      update: {},
    });
  }

  await wipeLegacyAuth(company.id);

  const roleDefs: { code: RoleCode; name: string; description: string }[] = [
    { code: RoleCode.SUPER_ADMIN, name: 'Super Admin', description: 'Full system access' },
    { code: RoleCode.ADMIN, name: 'Admin', description: 'Operational control' },
    { code: RoleCode.HR, name: 'HR', description: 'HR operations' },
    { code: RoleCode.EMPLOYEE, name: 'Employee', description: 'Employee portal' },
  ];

  const roleMap = new Map<RoleCode, string>();
  for (const def of roleDefs) {
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
    });
    roleMap.set(def.code, role.id);
  }

  for (const acc of ENTERPRISE_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(acc.password, 12);
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
    }

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
        userRoles: { create: [{ roleId: roleMap.get(acc.role)! }] },
      },
    });
    console.log(`Created ${acc.role}: ${acc.loginId} / ${acc.password}`);
  }

  console.log('Enterprise seed complete — 4 roles, 4 accounts only.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
