/**
 * Recalculate month-scoped late→HD cycle + todaysEarnings for a company month.
 *
 * Rule: every 3 late marks = 1 Half Day on the exact 3rd date; cycle resets
 * (4th = 1st again). Safe: updates status/earnings only.
 *
 * Usage:
 *   npx tsx prisma/recalc-late-cycle-month.ts 2026 10
 */
import { AttendanceDayStatus, PrismaClient } from '@prisma/client';
import {
  calcDailyEarning,
  calcDailySalary,
  calendarDaysInMonth,
} from '../src/payroll/payroll-calculator';

const prisma = new PrismaClient();

async function setting<T>(companyId: string, key: string, fallback: T): Promise<T> {
  const row = await prisma.companySetting.findUnique({
    where: { companyId_key: { companyId, key } },
  });
  return (row?.value as T) ?? fallback;
}

async function ensureLatePolicy(companyId: string) {
  await prisma.companySetting.upsert({
    where: { companyId_key: { companyId, key: 'attendance.late_marks_to_half_day' } },
    create: {
      companyId,
      key: 'attendance.late_marks_to_half_day',
      value: 3,
    },
    update: { value: 3 },
  });
}

async function reapplyForEmployee(
  companyId: string,
  employeeId: string,
  year: number,
  month: number,
) {
  const lateToHalf = Math.max(
    1,
    await setting<number>(companyId, 'attendance.late_marks_to_half_day', 3),
  );
  const fullHours = await setting<number>(companyId, 'office.full_day_hours', 8);
  const halfHours = await setting<number>(companyId, 'office.half_day_hours', 4);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));
  const daysInMonth = calendarDaysInMonth(year, month);

  const records = await prisma.attendanceRecord.findMany({
    where: { companyId, employeeId, date: { gte: from, lte: to } },
    orderBy: { date: 'asc' },
  });

  const payrollCfg = await prisma.employeePayrollConfig.findUnique({ where: { employeeId } });
  const gross = payrollCfg?.grossMonthly ?? 0;
  // Always use actual calendar days of the month (not fixed 30 / stale dailySalary).
  const dailySalary = calcDailySalary(gross, daysInMonth);
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  const cycleMutable = new Set<AttendanceDayStatus>([
    AttendanceDayStatus.P,
    AttendanceDayStatus.L,
    AttendanceDayStatus.HD,
  ]);

  let lateCount = 0;
  let statusUpdates = 0;
  let earnUpdates = 0;
  const conversions: string[] = [];

  for (const rec of records) {
    let nextStatus = rec.status;
    const hours = (rec.workMinutes ?? 0) / 60;
    const hoursBasedHd = !!rec.checkOutAt && hours >= halfHours && hours < fullHours;
    const fullDayHours = !!rec.checkOutAt && hours >= fullHours;

    if (rec.isLate) {
      lateCount += 1;
      const shouldConvert = lateCount % lateToHalf === 0;

      if (cycleMutable.has(rec.status)) {
        if (shouldConvert) {
          nextStatus = AttendanceDayStatus.HD;
          if (rec.status !== AttendanceDayStatus.HD) {
            conversions.push(rec.date.toISOString().slice(0, 10));
          }
        } else if (hoursBasedHd) {
          nextStatus = AttendanceDayStatus.HD;
        } else {
          nextStatus = AttendanceDayStatus.L;
        }
      }
    } else if (cycleMutable.has(rec.status)) {
      if (rec.status === AttendanceDayStatus.HD && fullDayHours && !hoursBasedHd) {
        nextStatus = AttendanceDayStatus.P;
      } else if (rec.status === AttendanceDayStatus.L && fullDayHours) {
        nextStatus = AttendanceDayStatus.P;
      } else if (hoursBasedHd) {
        nextStatus = AttendanceDayStatus.HD;
      }
    }

    let todaysEarnings = rec.todaysEarnings;
    if (rec.checkInAt && rec.checkOutAt) {
      todaysEarnings = round2(calcDailyEarning(nextStatus, dailySalary).amount);
    } else if (
      !rec.checkInAt &&
      (nextStatus === AttendanceDayStatus.A || nextStatus === AttendanceDayStatus.ULOB)
    ) {
      todaysEarnings = round2(calcDailyEarning(nextStatus, dailySalary).amount);
    } else if (rec.checkInAt && !rec.checkOutAt && nextStatus === AttendanceDayStatus.HD) {
      todaysEarnings = round2(calcDailyEarning(AttendanceDayStatus.HD, dailySalary).amount);
    }

    const statusChanged = nextStatus !== rec.status;
    const earnChanged =
      todaysEarnings != null &&
      (rec.todaysEarnings == null || Math.abs((rec.todaysEarnings ?? 0) - todaysEarnings) > 0.001);

    if (statusChanged || earnChanged) {
      await prisma.attendanceRecord.update({
        where: { id: rec.id },
        data: {
          ...(statusChanged ? { status: nextStatus } : {}),
          ...(earnChanged || statusChanged ? { todaysEarnings } : {}),
        },
      });
      if (statusChanged) statusUpdates += 1;
      if (earnChanged || statusChanged) earnUpdates += 1;
    }
  }

  return { lateCount, statusUpdates, earnUpdates, conversions, convertedHd: Math.floor(lateCount / lateToHalf) };
}

async function main() {
  const year = Number(process.argv[2] ?? 2026);
  const month = Number(process.argv[3] ?? 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error('Usage: npx tsx prisma/recalc-late-cycle-month.ts <year> <month>');
  }

  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0));

  let employees = 0;
  let statusUpdates = 0;
  let earnUpdates = 0;
  let lateMarks = 0;
  let convertedHd = 0;

  for (const company of companies) {
    await ensureLatePolicy(company.id);
    const grouped = await prisma.attendanceRecord.groupBy({
      by: ['employeeId'],
      where: { companyId: company.id, date: { gte: from, lte: to } },
    });
    for (const g of grouped) {
      const r = await reapplyForEmployee(company.id, g.employeeId, year, month);
      employees += 1;
      statusUpdates += r.statusUpdates;
      earnUpdates += r.earnUpdates;
      lateMarks += r.lateCount;
      convertedHd += r.convertedHd;
    }
    console.log(
      `[${company.name}] ${year}-${String(month).padStart(2, '0')}: ${grouped.length} employee(s)`,
    );
  }

  console.log(
    JSON.stringify(
      {
        year,
        month,
        employeesProcessed: employees,
        statusUpdates,
        earnUpdates,
        lateMarksSeen: lateMarks,
        lateGeneratedHalfDays: convertedHd,
        policy: 'every 3 lates = 1 HD on that date; cycle resets',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
