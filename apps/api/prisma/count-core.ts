import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const employees = await p.employee.count();
  const attendance = await p.attendanceRecord.count();
  const users = await p.user.count();
  const assets = await p.asset.count();
  const userList = await p.user.findMany({
    include: { userRoles: { include: { role: true } } },
  });
  console.log(JSON.stringify({ employees, attendance, users, assets }, null, 2));
  for (const u of userList) {
    console.log(
      `${u.loginId} emp=${u.employeeId ?? '-'} roles=${u.userRoles.map((r) => r.role.code).join(',')}`,
    );
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
