import { PrismaClient, RoleCode, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_COMPANY_SETTINGS, DEFAULT_POLICIES } from '../src/company/default-settings';

const prisma = new PrismaClient();

/** Production bootstrap only — never recreate demo Admin/HR/Employee accounts. */
const BOOTSTRAP_SUPER_ADMIN = {
  loginId: 'admin@eitf.in',
  email: 'admin@eitf.in',
  password: 'Admin@123',
  displayName: 'Super Admin',
} as const;

async function ensureRoles(companyId: string) {
  const roleDefs: { code: RoleCode; name: string; description: string }[] = [
    { code: RoleCode.SUPER_ADMIN, name: 'Super Admin', description: 'Full system access' },
    { code: RoleCode.ADMIN, name: 'Admin', description: 'Operational control' },
    { code: RoleCode.HR, name: 'HR', description: 'HR operations' },
    { code: RoleCode.EMPLOYEE, name: 'Employee', description: 'Employee portal' },
  ];

  const roleMap = new Map<RoleCode, string>();
  for (const def of roleDefs) {
    const role = await prisma.role.upsert({
      where: { companyId_code: { companyId, code: def.code } },
      create: {
        companyId,
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      update: {},
    });
    roleMap.set(def.code, role.id);
  }
  return roleMap;
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

  const roleMap = await ensureRoles(company.id);
  const userCount = await prisma.user.count({ where: { companyId: company.id } });

  if (userCount > 0) {
    console.log(
      `Seed skipped user bootstrap — ${userCount} user(s) already exist (data preserved).`,
    );
    console.log('Roles/settings ensured. Demo accounts are never recreated by seed.');
    return;
  }

  const passwordHash = await bcrypt.hash(BOOTSTRAP_SUPER_ADMIN.password, 12);
  await prisma.user.create({
    data: {
      companyId: company.id,
      loginId: BOOTSTRAP_SUPER_ADMIN.loginId,
      email: BOOTSTRAP_SUPER_ADMIN.email,
      passwordHash,
      displayName: BOOTSTRAP_SUPER_ADMIN.displayName,
      status: UserStatus.ACTIVE,
      forcePasswordChange: false,
      userRoles: { create: [{ roleId: roleMap.get(RoleCode.SUPER_ADMIN)! }] },
    },
  });

  console.log(
    `Created SUPER_ADMIN only: ${BOOTSTRAP_SUPER_ADMIN.loginId} / ${BOOTSTRAP_SUPER_ADMIN.password}`,
  );
  console.log('Seed complete — no demo Admin/HR/Employee accounts.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
