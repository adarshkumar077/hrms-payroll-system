/**
 * One-time installation helper — creates the first Super Admin ONLY when:
 * - No active Super Admin exists in the database
 * - All credentials are supplied via environment variables (no defaults)
 *
 * Usage:
 *   SETUP_SUPER_ADMIN_EMAIL=admin@company.com
 *   SETUP_SUPER_ADMIN_PASSWORD=YourSecurePassword
 *   SETUP_SUPER_ADMIN_MOBILE=9876543210
 *   SETUP_SUPER_ADMIN_NAME="Super Admin"
 *   npx tsx prisma/bootstrap-super-admin.ts
 */
import { PrismaClient, RoleCode, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const loginId = process.env.SETUP_SUPER_ADMIN_LOGIN_ID?.trim() || 'SA001';
  const email = process.env.SETUP_SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.SETUP_SUPER_ADMIN_PASSWORD;
  const mobile = process.env.SETUP_SUPER_ADMIN_MOBILE?.trim();
  const displayName = process.env.SETUP_SUPER_ADMIN_NAME?.trim() || 'Super Admin';

  if (!email || !password || !mobile) {
    throw new Error(
      'Missing required env vars: SETUP_SUPER_ADMIN_EMAIL, SETUP_SUPER_ADMIN_PASSWORD, SETUP_SUPER_ADMIN_MOBILE',
    );
  }
  if (password.length < 5) {
    throw new Error('SETUP_SUPER_ADMIN_PASSWORD must be at least 5 characters');
  }
  if (email.length < 5) {
    throw new Error('SETUP_SUPER_ADMIN_EMAIL must be at least 5 characters');
  }

  const company = await prisma.company.findFirst({ where: { isActive: true } });
  if (!company) {
    throw new Error('No company found. Run prisma seed first.');
  }

  const existing = await prisma.user.count({
    where: {
      companyId: company.id,
      status: { not: UserStatus.INACTIVE },
      userRoles: { some: { role: { code: RoleCode.CEO } } },
    },
  });
  if (existing > 0) {
    throw new Error('A Super Admin already exists. Bootstrap skipped.');
  }

  const role = await prisma.role.findFirst({
    where: { companyId: company.id, code: RoleCode.CEO },
  });
  if (!role) {
    throw new Error('Super Admin role missing. Run prisma seed first.');
  }

  const takenEmail = await prisma.user.findFirst({ where: { companyId: company.id, email } });
  if (takenEmail) {
    throw new Error('Email already in use');
  }
  const takenLoginId = await prisma.user.findFirst({
    where: { companyId: company.id, loginId },
  });
  if (takenLoginId) {
    throw new Error('User ID already in use');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      companyId: company.id,
      loginId,
      email,
      mobile,
      passwordHash,
      displayName,
      status: UserStatus.ACTIVE,
      forcePasswordChange: true,
      userRoles: { create: [{ roleId: role.id }] },
    },
  });

  console.log(
    JSON.stringify({
      ok: true,
      message: 'Initial Super Admin created. Password change is required on first login.',
      userId: user.id,
      loginId: user.loginId,
      email: user.email,
    }),
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
