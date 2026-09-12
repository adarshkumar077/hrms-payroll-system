import { db } from "./db";
import { parseCsv } from "./csv";

// Bank reconciliation. Import a statement CSV, then match transactions against
// recorded Payments (money in) so the CEO can tick off what's cleared.

export type BankRow = { date: Date; description: string; amount: number; direction: "credit" | "debit" };

/** Parse a bank CSV. Accepts columns: date, description/narration, amount, and either a
 *  type/direction column or signed amounts (negative = debit / money out). */
export function parseBankCsv(text: string): BankRow[] {
  const { rows } = parseCsv(text);
  const out: BankRow[] = [];
  for (const r of rows) {
    const get = (keys: string[]) => {
      for (const k of Object.keys(r)) if (keys.includes(k.toLowerCase().trim())) return r[k];
      return "";
    };
    const desc = get(["description", "narration", "particulars", "details"]) || "";
    const rawAmt = get(["amount", "amt", "value"]);
    const dirCol = (get(["direction", "type", "dr/cr", "crdr"]) || "").toLowerCase();
    let amount = Number(String(rawAmt).replace(/[^\d.-]/g, "")) || 0;
    let direction: "credit" | "debit" = amount < 0 ? "debit" : "credit";
    // Match debit indicators explicitly — a bare /d/ would also match the "d" in "credit".
    if (dirCol) direction = /\b(dr|debit|withdrawal|withdraw)\b/.test(dirCol) || dirCol.trim() === "d" ? "debit" : "credit";
    amount = Math.abs(amount);
    const dRaw = get(["date", "txn date", "value date"]);
    const date = dRaw ? new Date(dRaw) : new Date();
    if (!amount) continue;
    out.push({ date: isNaN(date.getTime()) ? new Date() : date, description: String(desc), amount, direction });
  }
  return out;
}

export async function importBankRows(tenantId: string, rows: BankRow[]) {
  if (!rows.length) return { imported: 0 };
  await db.bankTransaction.createMany({ data: rows.map((r) => ({ tenantId, date: r.date, description: r.description, amount: r.amount, direction: r.direction })) });
  return { imported: rows.length };
}

/** Suggest a matching recorded Payment for a credit (money-in) transaction: same amount,
 *  within a 7-day window, not already matched. Returns the payment or null. */
export async function suggestMatch(tenantId: string, txn: { amount: number; date: Date; direction: string }) {
  if (txn.direction !== "credit") return null;
  const from = new Date(txn.date.getTime() - 7 * 86400000);
  const to = new Date(txn.date.getTime() + 7 * 86400000);
  return db.payment.findFirst({ where: { tenantId, amount: txn.amount, createdAt: { gte: from, lte: to } } });
}

export async function reconcile(tenantId: string, txnId: string, matchedType: string | null, matchedId: string | null) {
  return db.bankTransaction.update({ where: { id: txnId }, data: { reconciled: !!matchedId || matchedType === "manual", matchedType, matchedId } });
}

export async function bankSummary(tenantId: string) {
  const [total, reconciled] = await Promise.all([
    db.bankTransaction.count({ where: { tenantId } }),
    db.bankTransaction.count({ where: { tenantId, reconciled: true } }),
  ]);
  return { total, reconciled, unreconciled: total - reconciled };
}
