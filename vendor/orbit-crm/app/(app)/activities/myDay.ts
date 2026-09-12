// Pure date-window helpers for the Activities "My Day" section. Kept free of
// db/session imports so the boundary math is unit-testable without a DB —
// page.tsx computes `now` once and threads it through both here and the
// per-row overdue check so a render is internally consistent.

/** End-of-day (23:59:59.999) boundary — "My Day" includes anything due today or earlier. */
export function endOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** True if an activity's due date falls inside today's My Day window (due today or earlier). */
export function isInMyDay(dueDate: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return d <= endOfToday(now);
}

/**
 * True if an open activity is past due. Same convention as the vendor-bills
 * overdue check (finance/bills/page.tsx): a straight timestamp compare
 * against `now`, not a day-truncated compare — a same-day due date/time in
 * the past today already reads as overdue, matching that existing pattern.
 */
export function isOverdueActivity(dueDate: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return d < now;
}
