import { db } from "@/lib/db";

/**
 * Orbit Studio — atomic, tenant-scoped document numbering.
 *
 * Replaces the old `count()+1` pattern (duplicate numbers under concurrent
 * writes — a legal problem on GST invoices, not just a bug). Sequences live in
 * NumberFormat.nextSeq and are allocated with a single atomic UPDATE.
 *
 * Format tokens: {YYYY} calendar year · {FY} Indian fiscal year "2026-27" ·
 * {seq} plain sequence · {seq:N} zero-padded to N digits.
 */

export const DEFAULT_FORMATS: Record<string, string> = {
  invoice: "INV-{YYYY}-{seq}",
  receipt: "RCPT-{YYYY}-{seq}",
  quotation: "QTN-{FY}-{seq:4}",
  lead: "L-{seq:5}",
  ticket: "T-{seq:5}",
  contract: "AMC-{FY}-{seq:4}",
};

/** Indian fiscal year label for a date: Apr 2026–Mar 2027 → "2026-27". */
export function fyLabel(date: Date): string {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

/** Render a format string with a sequence value. Pure — unit-tested. */
export function formatNumber(format: string, seq: number, date: Date = new Date()): string {
  return format
    .replace(/\{YYYY\}/g, String(date.getFullYear()))
    .replace(/\{FY\}/g, fyLabel(date))
    .replace(/\{seq:(\d+)\}/g, (_, n) => String(seq).padStart(Number(n), "0"))
    .replace(/\{seq\}/g, String(seq));
}

/**
 * Highest numeric tail found in existing document numbers (e.g. "INV-2026-612"
 * → 612). Used once per tenant+module to seed nextSeq ABOVE legacy numbers so
 * the allocator never re-issues one. Pure — unit-tested.
 */
export function maxNumericTail(numbers: (string | null | undefined)[]): number {
  let max = 0;
  for (const n of numbers) {
    const m = n?.match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

/** Seed values per module: scan legacy numbers so sequences start above them. */
async function initialSeq(tenantId: string, module: string): Promise<number> {
  if (module === "invoice") {
    const rows = await db.invoice.findMany({ where: { tenantId }, select: { number: true } });
    return maxNumericTail(rows.map((r) => r.number)) + 1;
  }
  if (module === "receipt") {
    const rows = await db.payment.findMany({ where: { tenantId }, select: { receiptNo: true } });
    return maxNumericTail(rows.map((r) => r.receiptNo)) + 1;
  }
  if (module === "quotation") {
    const rows = await db.quotation.findMany({ where: { tenantId }, select: { number: true } });
    return maxNumericTail(rows.map((r) => r.number)) + 1;
  }
  if (module === "contract") {
    const rows = await db.contract.findMany({ where: { tenantId }, select: { number: true } });
    return maxNumericTail(rows.map((r) => r.number)) + 1;
  }
  return 1;
}

/**
 * Allocate the next document number for a tenant+module. Safe under
 * concurrency: the increment is a single atomic UPDATE; two parallel calls get
 * distinct sequences. Lazily creates the NumberFormat row on first use, seeded
 * above any legacy numbers.
 */
export async function allocateNumber(tenantId: string, module: string, date: Date = new Date()): Promise<string> {
  const format = DEFAULT_FORMATS[module] ?? `${module.toUpperCase()}-{seq}`;

  let existing = await db.numberFormat.findUnique({ where: { tenantId_module: { tenantId, module } } });
  if (!existing) {
    const seed = await initialSeq(tenantId, module);
    try {
      existing = await db.numberFormat.create({ data: { tenantId, module, format, nextSeq: seed } });
    } catch {
      // Concurrent first-use: another request created it — fall through to the atomic increment.
    }
  }

  const updated = await db.numberFormat.update({
    where: { tenantId_module: { tenantId, module } },
    data: { nextSeq: { increment: 1 } },
  });
  const seq = updated.nextSeq - 1; // value we claimed
  return formatNumber(updated.format, seq, date);
}
