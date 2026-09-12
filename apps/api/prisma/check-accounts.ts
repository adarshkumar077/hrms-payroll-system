import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const TESTS = [
  { loginId: 'superadmin', password: 'Super@123' },
  { loginId: 'admin', password: 'Admin@123' },
  { loginId: 'hr001', password: 'HR@123' },
  { loginId: 'emp001', password: 'Emp@123' },
];

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, isActive: true },
  });
  console.log('Companies:', JSON.stringify(companies, null, 2));

  const first = companies.find((c) => c.isActive) ?? companies[0];
  if (!first) {
    console.log('No company found');
    return;
  }

  const users = await prisma.user.findMany({
    where: { companyId: first.id },
    select: {
      loginId: true,
      email: true,
      status: true,
      failedLoginAttempts: true,
      lockedAt: true,
      employeeId: true,
      passwordHash: true,
      userRoles: { select: { role: { select: { code: true } } } },
    },
  });
  console.log('Users in first active company:', JSON.stringify(users, null, 2));

  for (const t of TESTS) {
    const user = users.find((u) => u.loginId === t.loginId);
    if (!user?.passwordHash) {
      console.log(`${t.loginId}: MISSING`);
      continue;
    }
    const ok = await bcrypt.compare(t.password, user.passwordHash);
    let empActive = true;
    if (user.employeeId) {
      const emp = await prisma.employee.findFirst({
        where: { id: user.employeeId },
        select: { isActive: true, employeeCode: true },
      });
      empActive = emp?.isActive ?? false;
      console.log(`${t.loginId}: password=${ok} locked=${!!user.lockedAt} empActive=${empActive} emp=${emp?.employeeCode}`);
    } else {
      console.log(`${t.loginId}: password=${ok} locked=${!!user.lockedAt} (no employee link)`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
