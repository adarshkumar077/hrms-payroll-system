/**
 * Safe one-shot: flip stored Absent → WO/PH on Sundays / Festival / Office / PH days
 * when there is no check-in. Never touches leave, punches, or genuine working days.
 *
 * Also soft-clears erroneous WORKING_DAY overrides on Sundays (→ WO paid) so the
 * sheet calendar resolves Weekly Off. Does not delete holidays or other records.
 */
import { PrismaClient, AttendanceDayStatus } from '@prisma/client';
import {
  resolveCalendarDay,
  resolveLastSaturdayOff,
  holidaysForMonth,
  toDateKey,
  type CalendarHoliday,
  WORKING_DAY_TAG,
} from '../src/attendance/attendance-calendar';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  let updatedRecords = 0;
  let clearedWorkingDaySundays = 0;

  for (const company of companies) {
    // Soft-fix smoke WORKING_DAY rows that land on Sunday → Weekly Off (paid).
    const workDayRows = await prisma.holiday.findMany({
      where: {
        companyId: company.id,
        OR: [{ systemTag: WORKING_DAY_TAG }, { dayStatus: 'WORK' }],
      },
    });
    for (const h of workDayRows) {
      const key = toDateKey(h.date);
      const dow = new Date(`${key}T00:00:00.000Z`).getUTCDay();
      if (dow !== 0) continue;
      await prisma.holiday.update({
        where: { id: h.id },
        data: {
          name: h.name?.includes('Working') ? 'Weekly Off' : h.name,
          type: 'COMPANY',
          dayStatus: 'WO',
          systemTag: null,
          isPaid: true,
        },
      });
      clearedWorkingDaySundays += 1;
      console.log(`[${company.name}] Sunday WORKING_DAY → WO paid: ${key} (${h.name})`);
    }

    const holidays = await prisma.holiday.findMany({ where: { companyId: company.id } });
    const absents = await prisma.attendanceRecord.findMany({
      where: {
        companyId: company.id,
        status: AttendanceDayStatus.A,
        checkInAt: null,
      },
      select: { id: true, date: true, status: true, employeeId: true },
    });

    for (const rec of absents) {
      const dateKey = toDateKey(rec.date);
      const [y, m] = dateKey.split('-').map(Number);
      const utcDay = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
      const calendarHolidays: CalendarHoliday[] = holidaysForMonth(
        holidays.map((h) => ({
          id: h.id,
          name: h.name,
          date: toDateKey(h.date),
          type: h.type,
          isPaid: h.isPaid,
          systemTag: h.systemTag,
          dayStatus: h.dayStatus,
          repeatYearly: h.repeatYearly,
        })),
        y,
        m,
      );
      const holidayByDate = new Map(calendarHolidays.map((h) => [toDateKey(h.date), h]));
      const lastSaturday = resolveLastSaturdayOff(y, m, calendarHolidays);
      const cal = resolveCalendarDay({
        dateKey,
        utcDay,
        holiday: holidayByDate.get(dateKey) ?? null,
        lastSaturday,
        hasCheckIn: false,
      });

      if (!cal.autoStatus || (cal.autoStatus !== 'WO' && cal.autoStatus !== 'PH' && cal.autoStatus !== 'HD')) {
        continue;
      }
      // Only correct full paid offs incorrectly stored as Absent (skip unpaid HD if any).
      if (cal.autoStatus === 'HD') continue;

      const nextStatus =
        cal.autoStatus === 'WO' ? AttendanceDayStatus.WO : AttendanceDayStatus.PH;

      await prisma.attendanceRecord.update({
        where: { id: rec.id },
        data: { status: nextStatus },
      });
      updatedRecords += 1;
      console.log(
        `[${company.name}] ${dateKey} emp=${rec.employeeId.slice(0, 8)} A → ${nextStatus} (${cal.holidayType ?? 'calendar'})`,
      );
    }
  }

  console.log(
    JSON.stringify(
      { updatedRecords, clearedWorkingDaySundays, companies: companies.length },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
