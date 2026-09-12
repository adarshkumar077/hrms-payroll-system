/**
 * Orbit — turnaround-time (TAT) formatting.
 *
 * Pure, dependency-free: given two Dates, renders a human-readable elapsed
 * duration ("12 Days, 2 Hours"). Used by the opportunity record page's
 * Lead-Created TAT stat and can be reused anywhere else an elapsed-time
 * label is needed.
 */

/**
 * Format the elapsed time between `from` and `to` as a short human string.
 *  - < 1 hour  → "N Minutes" (or "1 Minute")
 *  - < 1 day   → "N Hours" (or "1 Hour")
 *  - >= 1 day  → "N Days, M Hours" (singular where N/M === 1)
 * Negative spans (to before from) clamp to zero.
 */
export function formatElapsed(from: Date, to: Date): string {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const totalMinutes = Math.floor(ms / 60_000);
  const totalHours = Math.floor(ms / 3_600_000);
  const totalDays = Math.floor(totalHours / 24);

  if (totalHours < 1) {
    return `${totalMinutes} ${totalMinutes === 1 ? "Minute" : "Minutes"}`;
  }
  if (totalDays < 1) {
    return `${totalHours} ${totalHours === 1 ? "Hour" : "Hours"}`;
  }
  const remHours = totalHours % 24;
  return `${totalDays} ${totalDays === 1 ? "Day" : "Days"}, ${remHours} ${remHours === 1 ? "Hour" : "Hours"}`;
}
