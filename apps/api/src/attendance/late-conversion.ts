/** Month-scoped late → half-day policy helpers (3 late marks = 1 HD by default). */

export function lateMarksToHalfDays(lateMarks: number, threshold = 3) {
  const late = Math.max(0, Math.floor(lateMarks));
  const t = Math.max(1, Math.floor(threshold));
  const convertedHd = Math.floor(late / t);
  const remainingLate = late % t;
  return { lateMarks: late, convertedHd, remainingLate, threshold: t };
}

export type DayAggInput = {
  status: string;
  isLate?: boolean;
  todaysEarnings?: number | null;
  overtimeMinutes?: number;
  dailySalary: number;
  /** When true, this late day is the 3rd/6th/9th… conversion slot */
  lateGeneratedHd?: boolean;
};

export type EmployeeMonthAgg = {
  presentDays: number;
  absentDays: number;
  halfDays: number;
  /** HD days from late-conversion cycle (3rd/6th/9th…) */
  lateGeneratedHalfDays: number;
  /** HD days not from late conversion (hours-based / manual) */
  normalHalfDays: number;
  weeklyOffs: number;
  paidHolidays: number;
  paidLeaves: number;
  unpaidLeaves: number;
  lateMarks: number;
  convertedHd: number;
  remainingLate: number;
  overtimeMinutes: number;
  overtimeEarnings: number;
  netPayable: number;
  absentDeduction: number;
  normalHalfDayDeduction: number;
  lateConversionDeduction: number;
  workingDaysCounted: number;
  paidDays: number;
};

const PRESENT = new Set(['P', 'L', 'WFH', 'OD']);
const ABSENT = new Set(['A']);
const PAID_HOLIDAY = new Set(['PH', 'H']);

/**
 * Walk attendance days in chronological order and mark which late days
 * are conversion slots (3rd, 6th, 9th… → HD on that exact date).
 */
export function annotateLateCycle<T extends { date: string; isLate?: boolean; status: string }>(
  days: T[],
  threshold = 3,
): Array<T & { lateIndex: number; lateGeneratedHd: boolean }> {
  const t = Math.max(1, Math.floor(threshold));
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let lateCount = 0;
  return sorted.map((d) => {
    if (!d.isLate) {
      return { ...d, lateIndex: 0, lateGeneratedHd: false };
    }
    lateCount += 1;
    const lateGeneratedHd = lateCount % t === 0;
    return { ...d, lateIndex: lateCount, lateGeneratedHd };
  });
}

/**
 * Display status for Excel / UI: late-cycle HD is labelled distinctly from manual HD.
 */
export function displayAttendanceStatus(status: string, lateGeneratedHd: boolean): string {
  if (status === 'HD' && lateGeneratedHd) return 'HD (Late)';
  return status;
}

/**
 * Excel daily-earnings display value.
 * Absent / unpaid leave → blank (null). Present / HD / paid offs keep amounts.
 */
export function displayDailyEarning(
  status: string,
  todaysEarnings: number | null | undefined,
): number | null {
  if (status === 'A' || status === 'ULOB') return null;
  if (todaysEarnings == null) return null;
  return todaysEarnings;
}

/**
 * Aggregate one employee's month from sheet-style day rows.
 * Late→HD count uses floor(lates / threshold); deductions for late HD use that policy
 * count so Excel matches the 3/6/9 rule without double-counting vs status HD pay.
 */
export function aggregateEmployeeMonth(
  days: DayAggInput[],
  opts?: { lateToHalf?: number },
): EmployeeMonthAgg {
  const lateToHalf = opts?.lateToHalf ?? 3;
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  let presentDays = 0;
  let absentDays = 0;
  let halfDays = 0;
  let lateGeneratedHalfDays = 0;
  let normalHalfDays = 0;
  let weeklyOffs = 0;
  let paidHolidays = 0;
  let paidLeaves = 0;
  let unpaidLeaves = 0;
  let lateMarks = 0;
  let overtimeMinutes = 0;
  let netPayable = 0;
  let workingDaysCounted = 0;
  let daily = 0;

  for (const d of days) {
    if (d.dailySalary > 0) daily = d.dailySalary;
    if (d.isLate) lateMarks += 1;
    overtimeMinutes += Math.max(0, d.overtimeMinutes ?? 0);

    const s = d.status;
    // Monthly total: blank absent cells contribute 0 (not −daily). Other statuses use stored earnings.
    if (s !== 'A' && s !== 'ULOB' && d.todaysEarnings != null) {
      netPayable = round2(netPayable + d.todaysEarnings);
    }

    if (PRESENT.has(s)) {
      presentDays += 1;
      workingDaysCounted += 1;
    } else if (s === 'HD') {
      halfDays += 1;
      workingDaysCounted += 1;
      if (d.lateGeneratedHd) lateGeneratedHalfDays += 1;
      else normalHalfDays += 1;
    } else if (ABSENT.has(s)) {
      absentDays += 1;
      workingDaysCounted += 1;
    } else if (s === 'ULOB') {
      unpaidLeaves += 1;
      workingDaysCounted += 1;
    } else if (s === 'PL') {
      paidLeaves += 1;
      workingDaysCounted += 1;
    } else if (s === 'WO') {
      weeklyOffs += 1;
    } else if (PAID_HOLIDAY.has(s)) {
      paidHolidays += 1;
    } else if (s === 'WFH' || s === 'OD') {
      presentDays += 1;
      workingDaysCounted += 1;
    }
  }

  const { convertedHd, remainingLate } = lateMarksToHalfDays(lateMarks, lateToHalf);

  const absentDeduction = round2((absentDays + unpaidLeaves) * daily);
  const normalHalfDayDeduction = round2(normalHalfDays * (daily / 2));
  // Late conversion deduction: policy floor(lates/threshold) — matches 3/6/9/12 rule.
  const lateConversionDeduction = round2(convertedHd * (daily / 2));

  const paidDays = round2(
    presentDays + paidLeaves + weeklyOffs + paidHolidays + halfDays * 0.5,
  );

  return {
    presentDays,
    absentDays,
    halfDays,
    lateGeneratedHalfDays: Math.max(lateGeneratedHalfDays, convertedHd),
    normalHalfDays,
    weeklyOffs,
    paidHolidays,
    paidLeaves,
    unpaidLeaves,
    lateMarks,
    convertedHd,
    remainingLate,
    overtimeMinutes,
    overtimeEarnings: 0,
    netPayable,
    absentDeduction,
    normalHalfDayDeduction,
    lateConversionDeduction,
    workingDaysCounted,
    paidDays,
  };
}
