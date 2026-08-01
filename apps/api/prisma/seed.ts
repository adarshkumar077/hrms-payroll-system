import { PrismaClient, RoleCode, DocumentTypeCode, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_COMPANY_SETTINGS, DEFAULT_POLICIES } from '../src/company/default-settings';

const prisma = new PrismaClient();

const INITIAL_SUPER_ADMIN = {
  loginId: 'SA001',
  email: 'superadmin@company.com',
  password: 'SuperAdmin@123',
  displayName: 'Super Admin',
} as const;

const DEMO_ADMIN_EMAILS = ['hr@eitf.local', 'admin@eitf.local'];

async function ensureInitialSuperAdmin(companyId: string) {
  const role = await prisma.role.findFirst({
    where: { companyId, code: RoleCode.CEO },
  });
  if (!role) {
    throw new Error('Super Admin role missing after seed.');
  }

  const passwordHash = await bcrypt.hash(INITIAL_SUPER_ADMIN.password, 12);

  let canonical = await prisma.user.findFirst({
    where: {
      companyId,
      OR: [
        { loginId: INITIAL_SUPER_ADMIN.loginId },
        { email: INITIAL_SUPER_ADMIN.email },
      ],
    },
    include: { userRoles: { include: { role: true } } },
  });

  const activeCeoUsers = await prisma.user.findMany({
    where: {
      companyId,
      status: { not: UserStatus.INACTIVE },
      userRoles: { some: { role: { code: RoleCode.CEO } } },
    },
    include: { userRoles: { include: { role: true } } },
  });

  if (!canonical && activeCeoUsers.length > 0) {
    canonical = activeCeoUsers[0];
  }

  if (canonical) {
    const forcePasswordReset = process.env.RESET_SUPER_ADMIN_PASSWORD === '1';
    const needsCredentialReset =
      forcePasswordReset ||
      canonical.email === 'ceo@eitf.local' ||
      canonical.loginId !== INITIAL_SUPER_ADMIN.loginId ||
      canonical.email !== INITIAL_SUPER_ADMIN.email;

    await prisma.user.update({
      where: { id: canonical.id },
      data: {
        loginId: INITIAL_SUPER_ADMIN.loginId,
        email: INITIAL_SUPER_ADMIN.email,
        displayName: INITIAL_SUPER_ADMIN.displayName,
        status: UserStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedAt: null,
        ...(needsCredentialReset
          ? { passwordHash, forcePasswordChange: true }
          : {}),
      },
    });

    const hasCeoRole = canonical.userRoles.some((ur) => ur.role.code === RoleCode.CEO);
    if (!hasCeoRole) {
      await prisma.userRole.create({
        data: { userId: canonical.id, roleId: role.id },
      });
    }

    const otherCeoIds = activeCeoUsers.filter((u) => u.id !== canonical!.id).map((u) => u.id);
    if (otherCeoIds.length) {
      await prisma.user.updateMany({
        where: { id: { in: otherCeoIds } },
        data: { status: UserStatus.INACTIVE },
      });
    }

    console.log(
      `Ensured initial Super Admin (${INITIAL_SUPER_ADMIN.loginId} / ${INITIAL_SUPER_ADMIN.email}). Password change required on first login.`,
    );
  } else {
    await prisma.user.create({
      data: {
        companyId,
        loginId: INITIAL_SUPER_ADMIN.loginId,
        email: INITIAL_SUPER_ADMIN.email,
        passwordHash,
        displayName: INITIAL_SUPER_ADMIN.displayName,
        status: UserStatus.ACTIVE,
        forcePasswordChange: true,
        userRoles: { create: [{ roleId: role.id }] },
      },
    });
    console.log(
      `Created initial Super Admin (${INITIAL_SUPER_ADMIN.loginId} / ${INITIAL_SUPER_ADMIN.email}). Password change required on first login.`,
    );
  }

  await prisma.user.updateMany({
    where: {
      companyId,
      employeeId: null,
      email: { in: DEMO_ADMIN_EMAILS },
      status: { not: UserStatus.INACTIVE },
    },
    data: { status: UserStatus.INACTIVE },
  });
}

async function releaseInactiveEmployeeContacts(companyId: string) {
  const inactiveUsers = await prisma.user.findMany({
    where: {
      companyId,
      status: UserStatus.INACTIVE,
      employeeId: { not: null },
    },
    select: { id: true, email: true, mobile: true },
  });

  let released = 0;
  for (const user of inactiveUsers) {
    const alreadyArchived = user.email?.endsWith('@inactive.local');
    if (!user.mobile && alreadyArchived) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mobile: null,
        email: alreadyArchived
          ? user.email
          : user.email
            ? `archived.${user.id.slice(-8)}@inactive.local`
            : null,
      },
    });
    released += 1;
  }

  if (released > 0) {
    console.log(`Released mobile/email from ${released} inactive employee login(s).`);
  }
}

async function main() {
  const companyName = 'EITF Enhancing IT Infrastructure Pvt. Ltd.';

  let company = await prisma.company.findFirst({
    where: { name: companyName },
  });

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
    console.log(`Created company: ${company.id}`);
  } else {
    console.log(`Company already exists: ${company.id}`);
  }

  for (const setting of DEFAULT_COMPANY_SETTINGS) {
    await prisma.companySetting.upsert({
      where: {
        companyId_key: { companyId: company.id, key: setting.key },
      },
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
      where: {
        companyId_code: { companyId: company.id, code: policy.code },
      },
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

  const roleDefs: { code: RoleCode; name: string; description: string }[] = [
    { code: RoleCode.CEO, name: 'Super Admin', description: 'Full access' },
    { code: RoleCode.HR, name: 'HR', description: 'HR configuration and approvals' },
    { code: RoleCode.MANAGER, name: 'Manager', description: 'Team attendance and approvals' },
    { code: RoleCode.EMPLOYEE, name: 'Employee', description: 'Self-service' },
    { code: RoleCode.EMPLOYEE_ADMIN, name: 'Employee-Admin', description: 'Elevated employee' },
    { code: RoleCode.FINANCE, name: 'Finance', description: 'Payroll and compliance' },
    { code: RoleCode.ADMIN, name: 'Admin', description: 'Assets, tickets, ops support' },
  ];

  for (const def of roleDefs) {
    await prisma.role.upsert({
      where: { companyId_code: { companyId: company.id, code: def.code } },
      create: {
        companyId: company.id,
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      update: { name: def.name, description: def.description },
    });
  }

  const docTypes: { code: DocumentTypeCode; name: string }[] = [
    { code: DocumentTypeCode.AADHAAR, name: 'Aadhaar' },
    { code: DocumentTypeCode.PAN, name: 'PAN' },
    { code: DocumentTypeCode.PASSPORT, name: 'Passport' },
    { code: DocumentTypeCode.RESUME, name: 'Resume' },
    { code: DocumentTypeCode.EDUCATIONAL, name: 'Educational' },
    { code: DocumentTypeCode.OFFER, name: 'Offer Letter' },
    { code: DocumentTypeCode.APPOINTMENT, name: 'Appointment Letter' },
    { code: DocumentTypeCode.INCREMENT, name: 'Increment Letter' },
    { code: DocumentTypeCode.EXPERIENCE, name: 'Experience Letter' },
    { code: DocumentTypeCode.RELIEVING, name: 'Relieving Letter' },
    { code: DocumentTypeCode.BANK, name: 'Bank Proof' },
    { code: DocumentTypeCode.CUSTOM, name: 'Custom' },
  ];
  for (const d of docTypes) {
    await prisma.documentType.upsert({
      where: { companyId_code: { companyId: company.id, code: d.code } },
      create: { companyId: company.id, code: d.code, name: d.name, isSystem: true },
      update: { name: d.name },
    });
  }

  const employeeCount = await prisma.employee.count({ where: { companyId: company.id } });
  await ensureInitialSuperAdmin(company.id);
  await releaseInactiveEmployeeContacts(company.id);

  const superAdminCount = await prisma.user.count({
    where: {
      companyId: company.id,
      status: { not: UserStatus.INACTIVE },
      userRoles: { some: { role: { code: RoleCode.CEO } } },
    },
  });

  console.log(`Employee count: ${employeeCount}`);
  console.log(`Super Admin accounts: ${superAdminCount}`);
  console.log('Seed complete. No other default or demo accounts are created.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
