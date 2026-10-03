/** Attendance photo/GPS visibility and 9:00 PM auto-checkout helpers. */

export const CHECK_OUT_SOURCE = {
  MANUAL_OUT: 'MANUAL_OUT',
  SYSTEM_LOGOUT: 'SYSTEM_LOGOUT',
  HR_MANUAL: 'HR_MANUAL',
} as const;

export type CheckOutSource = (typeof CHECK_OUT_SOURCE)[keyof typeof CHECK_OUT_SOURCE];

export const COMPANY_TZ = 'Asia/Kolkata';
/** Auto checkout hour in Asia/Kolkata (21:00). */
export const SYSTEM_LOGOUT_HOUR = 21;

const GEO_RECORD_FIELDS = [
  'latitude',
  'longitude',
  'selfieUrl',
  'checkInLatitude',
  'checkInLongitude',
  'checkInAddress',
  'checkInSelfieUrl',
  'checkInMapsUrl',
  'checkOutLatitude',
  'checkOutLongitude',
  'checkOutAddress',
  'checkOutSelfieUrl',
  'checkOutMapsUrl',
] as const;

const GEO_PUNCH_FIELDS = [
  'latitude',
  'longitude',
  'accuracyM',
  'address',
  'mapsUrl',
  'selfieUrl',
] as const;

export function checkOutSourceLabel(source?: string | null): string | null {
  if (source === CHECK_OUT_SOURCE.SYSTEM_LOGOUT) return 'Auto Checkout';
  if (source === CHECK_OUT_SOURCE.MANUAL_OUT) return 'Manual OUT';
  if (source === CHECK_OUT_SOURCE.HR_MANUAL) return 'Manual (HR)';
  return null;
}

export function dateKeyInTz(d: Date, timeZone = COMPANY_TZ): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * 21:00 Asia/Kolkata on the given YYYY-MM-DD calendar date (= 15:30 UTC).
 */
export function autoCheckoutUtcForDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T15:30:00.000Z`);
}

/** @deprecated Use autoCheckoutUtcForDateKey — kept for older imports/tests. */
export const tenPmUtcForDateKey = autoCheckoutUtcForDateKey;

/**
 * First 9:00 PM Asia/Kolkata strictly after check-in if already past 9 PM
 * that calendar day; otherwise 9 PM on the check-in calendar day.
 */
export function nextSystemLogoutAt(checkInAt: Date): Date {
  const key = dateKeyInTz(checkInAt);
  const ninePm = autoCheckoutUtcForDateKey(key);
  if (checkInAt.getTime() < ninePm.getTime()) return ninePm;
  const [y, m, d] = key.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return autoCheckoutUtcForDateKey(next.toISOString().slice(0, 10));
}

export function isDueForSystemLogout(checkInAt: Date, now: Date): boolean {
  return now.getTime() >= nextSystemLogoutAt(checkInAt).getTime();
}

function stripFields<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): T {
  const out = { ...obj };
  for (const k of keys) {
    delete (out as Record<string, unknown>)[k];
  }
  return out;
}

export function sanitizePunch<T extends Record<string, unknown>>(punch: T): T {
  return stripFields(punch, GEO_PUNCH_FIELDS);
}

export function sanitizeAttendanceRecord<T>(record: T, privileged: boolean): T {
  if (!record || typeof record !== 'object') return record;
  const rec = { ...(record as Record<string, unknown>) };
  rec.checkOutLabel = checkOutSourceLabel(
    typeof rec.checkOutSource === 'string' ? rec.checkOutSource : null,
  );
  if (privileged) return rec as T;

  const stripped = stripFields(rec, GEO_RECORD_FIELDS);
  delete stripped.sourceNote;
  if (Array.isArray(stripped.punches)) {
    stripped.punches = stripped.punches.map((p) =>
      p && typeof p === 'object' ? sanitizePunch(p as Record<string, unknown>) : p,
    );
  }
  if (Array.isArray(stripped.auditLogs)) {
    stripped.auditLogs = stripped.auditLogs.map((a) =>
      a && typeof a === 'object'
        ? { ...(a as Record<string, unknown>), beforeJson: null, afterJson: null }
        : a,
    );
  }
  return stripped as T;
}

export function sanitizeAttendanceRecords<T>(records: T[], privileged: boolean): T[] {
  return records.map((r) => sanitizeAttendanceRecord(r, privileged));
}
