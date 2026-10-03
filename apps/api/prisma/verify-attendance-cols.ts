import { PrismaClient } from '@prisma/client';

async function main() {
  const p = new PrismaClient();
  const cols = await p.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_name='attendance_records' AND column_name IN ('overtime_minutes','todays_earnings','check_in_latitude','check_out_source') ORDER BY 1`,
  );
  const employees = await p.employee.count();
  const users = await p.user.count();
  const attendance = await p.attendanceRecord.count();
  console.log(JSON.stringify({ cols: cols.map((c) => c.column_name), employees, users, attendance }));
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
