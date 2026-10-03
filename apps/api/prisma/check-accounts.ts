import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { userRoles: { include: { role: true } } },
  });
  console.log(`users=${users.length}`);
  for (const u of users) {
    console.log(
      `${u.loginId} ${u.email} roles=${u.userRoles.map((r) => r.role.code).join(',')}`,
    );
  }
  const sa = users.find((u) => u.email === 'admin@eitf.in');
  if (!sa?.passwordHash) {
    console.log('admin@eitf.in missing');
    return;
  }
  const ok = await bcrypt.compare('Admin@123', sa.passwordHash);
  console.log(`admin@eitf.in password check: ${ok ? 'OK' : 'FAIL'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
