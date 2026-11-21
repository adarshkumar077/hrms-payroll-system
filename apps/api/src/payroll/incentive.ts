/** Attendance incentive eligibility for one employee-month (company `incentive.*` settings). */
export type IncentiveRules = {
  enabled: boolean;
  amount: number;
  maxLateMarks: number;
  requireNoHalfDay: boolean;
  requireNoAbsent: boolean;
  requireNoUlob: boolean;
};

export type MonthAttendanceTally = {
  lateMarks: number;
  absentDays: number;
  halfDays: number;
  ulobDays: number;
};

/** Count the month's late marks / absences / half-days / ULOB from attendance records. */
export function tallyMonthAttendance(records: { status: string; isLate?: boolean | null }[]): MonthAttendanceTally {
  return {
    lateMarks: records.filter((r) => r.isLate).length,
    absentDays: records.filter((r) => r.status === 'A').length,
    halfDays: records.filter((r) => r.status === 'HD').length,
    ulobDays: records.filter((r) => r.status === 'ULOB').length,
  };
}

export function isIncentiveEligible(t: MonthAttendanceTally, r: IncentiveRules): boolean {
  if (!r.enabled || r.amount <= 0) return false;
  if (t.lateMarks > r.maxLateMarks) return false;
  if (r.requireNoHalfDay && t.halfDays > 0) return false;
  if (r.requireNoAbsent && t.absentDays > 0) return false;
  if (r.requireNoUlob && t.ulobDays > 0) return false;
  return true;
}
