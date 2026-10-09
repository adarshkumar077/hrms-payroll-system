import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const day = new Date(Date.UTC(2026, 9, 4));
  console.log('UTC day', day.toISOString(), 'dow', day.getUTCDay());

  const recs = await p.attendanceRecord.findMany({
    where: { date: day },
    select: {
      id: true,
      employeeId: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
    },
    take: 40,
  });
  console.log(
    'records Oct4',
    recs.length,
    JSON.stringify(
      recs.map((r) => ({
        emp: r.employeeId.slice(0, 10),
        status: r.status,
        in: !!r.checkInAt,
        out: !!r.checkOutAt,
      })),
      null,
      2,
    ),
  );

  const hol = await p.holiday.findMany({
    where: {
      OR: [
        { date: { gte: new Date(Date.UTC(2026, 9, 1)), lte: new Date(Date.UTC(2026, 9, 31)) } },
        { repeatYearly: true },
      ],
    },
  });
  console.log(
    'holidays',
    hol.map((h) => ({
      name: h.name,
      date: h.date.toISOString().slice(0, 10),
      type: h.type,
      isPaid: h.isPaid,
      dayStatus: h.dayStatus,
      tag: h.systemTag,
      yearly: h.repeatYearly,
    })),
  );

  const aRecs = await p.attendanceRecord.findMany({
    where: { status: 'A' },
    select: { date: true, employeeId: true, checkInAt: true, status: true },
    take: 80,
    orderBy: { date: 'desc' },
  });
  console.log(
    'A records sample',
    aRecs.map((r) => ({
      d: r.date.toISOString().slice(0, 10),
      dow: r.date.getUTCDay(),
      in: !!r.checkInAt,
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
