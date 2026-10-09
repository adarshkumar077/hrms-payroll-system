/** Calendar rules for Sundays, last Saturday WO, and company holidays (sheet/payroll display). */

export type CalendarHoliday = {
  id: string;
  name: string;
  date: string | Date;
  type: string;
  isPaid: boolean;
  systemTag?: string | null;
  /** PH | WO | HD | WORK */
  dayStatus?: string | null;
  repeatYearly?: boolean;
};

export const LAST_SATURDAY_OVERRIDE_TAG = 'LAST_SATURDAY_OVERRIDE';
export const WORKING_DAY_TAG = 'WORKING_DAY';

export function toDateKey(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Last Saturday of month (UTC date key YYYY-MM-DD). month is 1–12. */
export function lastSaturdayOfMonth(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0));
  const dow = lastDay.getUTCDay();
  const daysBack = (dow - 6 + 7) % 7;
  const sat = new Date(Date.UTC(year, month - 1, lastDay.getUTCDate() - daysBack));
  return sat.toISOString().slice(0, 10);
}

export function resolveLastSaturdayOff(
  year: number,
  month: number,
  holidays: CalendarHoliday[],
): { date: string; name: string; isPaid: boolean; holidayId?: string } {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  const override = holidays.find((h) => {
    if (h.systemTag !== LAST_SATURDAY_OVERRIDE_TAG) return false;
    return toDateKey(h.date).startsWith(ym);
  });
  if (override) {
    return {
      date: toDateKey(override.date),
      name: override.name || 'Last Saturday Weekly Off',
      isPaid: override.isPaid !== false,
      holidayId: override.id,
    };
  }
  return {
    date: lastSaturdayOfMonth(year, month),
    name: 'Last Saturday Weekly Off',
    isPaid: true,
  };
}

/**
 * Project holidays into a target year/month, including repeatYearly entries
 * whose month-day falls in that month (any original year).
 */
export function holidaysForMonth(
  holidays: CalendarHoliday[],
  year: number,
  month: number,
): CalendarHoliday[] {
  const out: CalendarHoliday[] = [];
  const seen = new Set<string>();
  for (const h of holidays) {
    const key = toDateKey(h.date);
    const [, hm, hd] = key.split('-').map(Number);
    const inMonth = hm === month && key.startsWith(`${year}-`);
    const repeatInMonth = !!h.repeatYearly && hm === month;
    if (!inMonth && !repeatInMonth) continue;
    const projected =
      inMonth
        ? key
        : `${year}-${String(month).padStart(2, '0')}-${String(hd).padStart(2, '0')}`;
    if (seen.has(projected)) continue;
    seen.add(projected);
    out.push({ ...h, date: projected });
  }
  return out;
}

export type ResolvedCalendarDay = {
  autoStatus: 'WO' | 'PH' | 'HD' | null;
  holidayName: string | null;
  paid: boolean;
  holidayType: string | null;
};

/**
 * Resolve Sunday / last-Saturday WO / festival-office / HD / working-day for a day.
 * Sundays + Festival/Office holidays never auto-resolve to Absent without a check-in.
 */
export function resolveCalendarDay(opts: {
  dateKey: string;
  utcDay: number;
  holiday?: CalendarHoliday | null;
  lastSaturday: { date: string; name: string; isPaid: boolean };
  hasCheckIn: boolean;
}): ResolvedCalendarDay {
  const { dateKey, utcDay, holiday, lastSaturday, hasCheckIn } = opts;

  let holidayName: string | null = null;
  let holidayType: string | null = null;
  let paid = true;
  let autoStatus: 'WO' | 'PH' | 'HD' | null = null;

  const tag = holiday?.systemTag ?? null;
  const dayStatus = (holiday?.dayStatus ?? '').toUpperCase();
  const isSunday = utcDay === 0;
  const isLastSaturday = dateKey === lastSaturday.date;

  if (holiday && (tag === WORKING_DAY_TAG || dayStatus === 'WORK')) {
    holidayName = holiday.name || 'Working Day';
    holidayType = 'WORKING_DAY';
    paid = holiday.isPaid !== false;
    // Explicit "working day" override: if employee punched, keep punch status.
    // Without a punch on a Sunday/last-Saturday, NEVER auto-Absent — keep paid WO.
    if ((isSunday || isLastSaturday) && !hasCheckIn) {
      return {
        autoStatus: 'WO',
        holidayName: 'Weekly Off',
        paid: true,
        holidayType: 'WEEKLY_OFF',
      };
    }
    if (hasCheckIn) return { autoStatus: null, holidayName, paid, holidayType };
    return { autoStatus: null, holidayName, paid, holidayType };
  }

  if (holiday && tag === LAST_SATURDAY_OVERRIDE_TAG && toDateKey(holiday.date) === dateKey) {
    holidayName = holiday.name || lastSaturday.name;
    holidayType = holiday.type;
    paid = holiday.isPaid !== false;
    autoStatus = 'WO';
  } else if (holiday && tag !== LAST_SATURDAY_OVERRIDE_TAG) {
    holidayName = holiday.name;
    holidayType = holiday.type;
    // Festival / Office / WO / PH default Paid unless explicitly unpaid
    const festOrOffice =
      holiday.type === 'FESTIVAL' ||
      holiday.type === 'OFFICE' ||
      holiday.type === 'NATIONAL' ||
      dayStatus === 'PH' ||
      dayStatus === 'WO';
    paid = festOrOffice ? holiday.isPaid !== false : holiday.isPaid !== false;
    if (dayStatus === 'WO') autoStatus = 'WO';
    else if (dayStatus === 'HD') autoStatus = 'HD';
    else if (dayStatus === 'PH' || dayStatus === '' || dayStatus === 'H') autoStatus = 'PH';
    else if (holiday.type === 'FESTIVAL' || holiday.type === 'OFFICE' || holiday.type === 'NATIONAL') {
      autoStatus = 'PH';
    } else {
      autoStatus = 'PH';
    }
  } else if (isSunday) {
    holidayName = 'Weekly Off';
    holidayType = 'WEEKLY_OFF';
    paid = true;
    autoStatus = 'WO';
  } else if (isLastSaturday) {
    holidayName = lastSaturday.name;
    holidayType = 'WEEKLY_OFF';
    paid = lastSaturday.isPaid !== false;
    autoStatus = 'WO';
  }

  if (hasCheckIn) {
    return { autoStatus: null, holidayName, paid, holidayType };
  }

  return { autoStatus, holidayName, paid, holidayType };
}

/** Map Quick Action status label → holiday type + dayStatus + systemTag */
export function mapQuickActionStatus(status: string): {
  type: 'FESTIVAL' | 'OFFICE' | 'COMPANY' | 'NATIONAL';
  dayStatus: 'PH' | 'WO' | 'HD' | 'WORK';
  systemTag: string | null;
  defaultName: string;
} {
  switch (status) {
    case 'PH':
    case 'PAID_HOLIDAY':
      return { type: 'NATIONAL', dayStatus: 'PH', systemTag: null, defaultName: 'Paid Holiday' };
    case 'WO':
    case 'WEEKLY_OFF':
      return { type: 'COMPANY', dayStatus: 'WO', systemTag: null, defaultName: 'Weekly Off' };
    case 'FESTIVAL':
    case 'FESTIVAL_HOLIDAY':
      return { type: 'FESTIVAL', dayStatus: 'PH', systemTag: null, defaultName: 'Festival Holiday' };
    case 'OFFICE':
    case 'OFFICE_HOLIDAY':
      return { type: 'OFFICE', dayStatus: 'PH', systemTag: null, defaultName: 'Office Holiday' };
    case 'HD':
    case 'HALF_DAY':
      return { type: 'COMPANY', dayStatus: 'HD', systemTag: null, defaultName: 'Half Day' };
    case 'WORK':
    case 'WORKING_DAY':
      return {
        type: 'COMPANY',
        dayStatus: 'WORK',
        systemTag: WORKING_DAY_TAG,
        defaultName: 'Working Day',
      };
    default:
      return { type: 'COMPANY', dayStatus: 'PH', systemTag: null, defaultName: 'Holiday' };
  }
}
