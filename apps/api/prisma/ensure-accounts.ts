/**
 * Ensures only the production Super Admin bootstrap account exists when the DB has zero users.
 * Never recreates demo Admin/HR/Employee accounts.
 * Run: npx tsx prisma/ensure-accounts.ts
 */
import { PrismaClient, RoleCode, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ROLE_DEFS: { code: RoleCode; name: string; description: string }[] = [
  { code: RoleCode.SUPER_ADMIN, name: 'Super Admin', description: 'Full system access' },
  { code: RoleCode.ADMIN, name: 'Admin', description: 'Operational control' },
  { code: RoleCode.HR, name: 'HR', description: 'HR operations' },
  { code: RoleCode.EMPLOYEE, name: 'Employee', description: 'Employee portal' },
];

const SUPER_ADMIN = {
  loginId: 'admin@eitf.in',
  email: 'admin@eitf.in',
  password: 'Admin@123',
  displayName: 'Super Admin',
} as const;

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
  const company = await prisma.company.findFirst();
  if (!company) throw new Error('No company — run seed first');

  const roleMap = await ensureRoles(company.id);
  const userCount = await prisma.user.count({ where: { companyId: company.id } });
  if (userCount > 0) {
    console.log(`Users already exist (${userCount}) — no demo accounts created.`);
    return;
  }

  const passwordHash = await bcrypt.hash(SUPER_ADMIN.password, 12);
  await prisma.user.create({
    data: {
      companyId: company.id,
      loginId: SUPER_ADMIN.loginId,
      email: SUPER_ADMIN.email,
      passwordHash,
      displayName: SUPER_ADMIN.displayName,
      status: UserStatus.ACTIVE,
      forcePasswordChange: false,
      userRoles: { create: [{ roleId: roleMap.get(RoleCode.SUPER_ADMIN)! }] },
    },
  });
  console.log(`Created SUPER_ADMIN: ${SUPER_ADMIN.loginId} / ${SUPER_ADMIN.password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
