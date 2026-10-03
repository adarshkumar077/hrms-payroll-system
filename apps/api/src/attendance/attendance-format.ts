/** Format minutes as "8h 32m" */
export function formatMinutes(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '—';
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60);
  const mins = total % 60;
  return `${h}h ${mins}m`;
}

/** Format minutes as "08:58" (sheet / payroll style). */
export function formatHoursClock(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '—';
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/** Derive work minutes from check-in/out when stored workMinutes is missing. */
export function workMinutesBetween(
  checkInAt?: Date | string | null,
  checkOutAt?: Date | string | null,
  stored?: number | null,
): number | null {
  if (stored != null && !Number.isNaN(stored)) return Math.max(0, Math.round(stored));
  if (!checkInAt || !checkOutAt) return null;
  const a = typeof checkInAt === 'string' ? new Date(checkInAt) : checkInAt;
  const b = typeof checkOutAt === 'string' ? new Date(checkOutAt) : checkOutAt;
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));
}

/** Format ISO/Date as "10:31 am" in Asia/Kolkata */
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d
    .toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\u202f/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Short locality label from a full address.
 * Prefers first 2 comma-separated parts (e.g. "Borivali West, Mumbai").
 * Falls back to lat/lng when address is empty but coordinates exist.
 */
export function shortLocation(
  address: string | null | undefined,
  lat?: number | null,
  lng?: number | null,
): string {
  if (address?.trim()) {
    const parts = address
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return '—';
    if (parts.length === 1) return parts[0];
    return `${parts[0]}, ${parts[1]}`;
  }
  if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
  }
  return '—';
}

export function buildMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
