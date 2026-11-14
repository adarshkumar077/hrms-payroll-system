import { PrismaClient, RoleCode, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_COMPANY_SETTINGS, DEFAULT_POLICIES } from '../src/company/default-settings';
import { seedStatutoryRuleSets } from '../src/payroll/statutory/seed-rules';

import { resolveBootstrapAdmin } from './bootstrap-admin';

const prisma = new PrismaClient();

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

  // Statutory payroll rule tables (FY 2025-26, 2026-27). Idempotent; never overwrites edits.
  // Defaults are marked verifyWithCA — VERIFY WITH CA BEFORE GO-LIVE (docs/PAYROLL-RULES.md).
  const statutoryCreated = await seedStatutoryRuleSets(prisma, company.id);
  if (statutoryCreated) console.log(`Seeded ${statutoryCreated} statutory rule set(s) — verify with your CA.`);

  const roleMap = await ensureRoles(company.id);
  const userCount = await prisma.user.count({ where: { companyId: company.id } });

  if (userCount > 0) {
    console.log(
      `Seed skipped user bootstrap — ${userCount} user(s) already exist (data preserved).`,
    );
    console.log('Roles/settings ensured. Demo accounts are never recreated by seed.');
    return;
  }

  const result = resolveBootstrapAdmin(process.env);
  if (result.kind === 'skip') {
    console.warn(`Seed: ${result.reason}`);
    console.log('Roles/settings ensured; no bootstrap user created.');
    return;
  }

  const admin = result.admin;
  const passwordHash = await bcrypt.hash(admin.password, 12);
  await prisma.user.create({
    data: {
      companyId: company.id,
      loginId: admin.loginId,
      email: admin.email,
      passwordHash,
      displayName: admin.displayName,
      status: UserStatus.ACTIVE,
      forcePasswordChange: true,
      userRoles: { create: [{ roleId: roleMap.get(RoleCode.SUPER_ADMIN)! }] },
    },
  });

  console.log(
    `Created bootstrap SUPER_ADMIN: ${admin.loginId} (password change required at first login).`,
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
