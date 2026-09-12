/** Format minutes as "8h 32m" */
export function formatMinutes(m: number | null | undefined): string {
  if (m == null || Number.isNaN(m)) return '—';
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60);
  const mins = total % 60;
  return `${h}h ${mins}m`;
}

/** Format ISO/Date as "09:58 AM" in Asia/Kolkata */
export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Short locality label from a full address.
 * Prefers first 2 comma-separated parts (e.g. "Borivali West, Mumbai").
 */
export function shortLocation(address: string | null | undefined): string {
  if (!address?.trim()) return '—';
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  return `${parts[0]}, ${parts[1]}`;
}

export function buildMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
