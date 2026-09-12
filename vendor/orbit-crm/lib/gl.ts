import { db } from "./db";
import { emit } from "./events";
import { ACCOUNT_TYPES, isDebitNormal, type AccountType } from "./gl-constants";

// Double-entry General Ledger. Every posting must balance (sum debits === sum credits).
// Normal balances: Asset/Expense = debit-normal; Liability/Equity/Income = credit-normal.

// Pure constants live in ./gl-constants (client-safe); re-exported here for existing importers.
export { ACCOUNT_TYPES, isDebitNormal, type AccountType };

// Default chart of accounts seeded per tenant.
export const DEFAULT_COA: { code: string; name: string; type: AccountType }[] = [
  { code: "1000", name: "Cash", type: "Asset" },
  { code: "1010", name: "Bank", type: "Asset" },
  { code: "1100", name: "Accounts Receivable", type: "Asset" },
  { code: "1200", name: "Inventory", type: "Asset" },
  { code: "2000", name: "Accounts Payable", type: "Liability" },
  { code: "2100", name: "GST Payable", type: "Liability" },
  { code: "2200", name: "Salaries Payable", type: "Liability" },
  { code: "2300", name: "Statutory Dues (PF/ESI/TDS)", type: "Liability" },
  { code: "3000", name: "Owner's Equity", type: "Equity" },
  { code: "3100", name: "Retained Earnings", type: "Equity" },
  { code: "4000", name: "Sales Revenue", type: "Income" },
  { code: "5000", name: "Salaries Expense", type: "Expense" },
  { code: "5100", name: "Cost of Goods Sold", type: "Expense" },
  { code: "5200", name: "Operating Expense", type: "Expense" },
];

/** Idempotently ensure the tenant has a chart of accounts. Returns a code→account map. */
export async function ensureChart(tenantId: string) {
  const existing = await db.ledgerAccount.findMany({ where: { tenantId } });
  if (existing.length === 0) {
    await db.ledgerAccount.createMany({
      data: DEFAULT_COA.map((a) => ({ tenantId, code: a.code, name: a.name, type: a.type, isSystem: true })),
    });
  }
  const all = await db.ledgerAccount.findMany({ where: { tenantId } });
  const byCode: Record<string, (typeof all)[number]> = {};
  for (const a of all) byCode[a.code] = a;
  return byCode;
}

export type PostLine = { code: string; debit?: number; credit?: number };

/** Post a balanced journal entry. Throws if debits ≠ credits. */
export async function postJournal(params: {
  tenantId: string;
  narration: string;
  reference?: string;
  source?: string;
  date?: Date;
  lines: PostLine[];
}) {
  const byCode = await ensureChart(params.tenantId);
  const totDr = round2(params.lines.reduce((a, l) => a + (l.debit || 0), 0));
  const totCr = round2(params.lines.reduce((a, l) => a + (l.credit || 0), 0));
  if (totDr !== totCr) throw new Error(`Journal not balanced: Dr ${totDr} ≠ Cr ${totCr}`);
  if (totDr === 0) throw new Error("Journal has no amounts");

  const entry = await db.journalEntry.create({
    data: {
      tenantId: params.tenantId,
      narration: params.narration,
      reference: params.reference,
      source: params.source ?? "manual",
      date: params.date ?? new Date(),
      lines: {
        create: params.lines.map((l) => {
          const acc = byCode[l.code];
          if (!acc) throw new Error(`Unknown ledger account code ${l.code}`);
          return { tenantId: params.tenantId, accountId: acc.id, accountCode: l.code, debit: round2(l.debit || 0), credit: round2(l.credit || 0) };
        }),
      },
    },
    include: { lines: true },
  });
  await emit({ tenantId: params.tenantId, type: "journal.posted", entity: "JournalEntry", entityId: entry.id, payload: { reference: params.reference, amount: totDr } });
  return entry;
}

// ── Auto-posting hooks (called from module actions) ──────────
export async function postInvoiceJournal(tenantId: string, inv: { number: string; subtotal: number; cgst: number; sgst: number; igst: number; grandTotal: number }) {
  // Derive GST as the difference so the entry always balances despite per-component rounding.
  const gst = round2(inv.grandTotal - inv.subtotal);
  return postJournal({
    tenantId,
    narration: `Sales invoice ${inv.number}`,
    reference: inv.number,
    source: "invoice",
    lines: [
      { code: "1100", debit: inv.grandTotal }, // Dr Accounts Receivable
      { code: "4000", credit: inv.subtotal }, // Cr Sales Revenue
      { code: "2100", credit: gst }, // Cr GST Payable
    ],
  });
}

export async function postPaymentJournal(tenantId: string, p: { receiptNo: string; amount: number; method: string }) {
  const cashCode = p.method === "Cash" ? "1000" : "1010";
  return postJournal({
    tenantId,
    narration: `Payment received ${p.receiptNo}`,
    reference: p.receiptNo,
    source: "payment",
    lines: [
      { code: cashCode, debit: p.amount }, // Dr Bank/Cash
      { code: "1100", credit: p.amount }, // Cr Accounts Receivable
    ],
  });
}

export async function postPayrollJournal(tenantId: string, run: { label: string; grossTotal: number; netTotal: number; pfTotal: number; esiTotal: number; tdsTotal: number }) {
  // Employee view: gross expense = net payable + employee-side statutory deductions.
  // Statutory credit is derived as (gross − net) so it balances exactly. (Employer-side
  // contributions would be a separate Dr Expense / Cr Statutory entry — omitted for simplicity.)
  const statutory = round2(run.grossTotal - run.netTotal);
  return postJournal({
    tenantId,
    narration: `Payroll ${run.label}`,
    reference: `Payroll ${run.label}`,
    source: "payroll",
    lines: [
      { code: "5000", debit: run.grossTotal }, // Dr Salaries Expense
      { code: "2200", credit: run.netTotal }, // Cr Salaries Payable (net)
      { code: "2300", credit: statutory }, // Cr Statutory Dues (PF/ESI/TDS)
    ],
  });
}

// ── Reporting ────────────────────────────────────────────────
export type TrialRow = { code: string; name: string; type: string; debit: number; credit: number; balance: number };

export type DateRange = { from?: Date; to?: Date };

export async function trialBalance(tenantId: string, range?: DateRange): Promise<TrialRow[]> {
  const dateFilter = range && (range.from || range.to) ? { entry: { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } } : {};
  const [accounts, lines] = await Promise.all([
    db.ledgerAccount.findMany({ where: { tenantId }, orderBy: { code: "asc" } }),
    db.journalLine.groupBy({ by: ["accountCode"], where: { tenantId, ...dateFilter }, _sum: { debit: true, credit: true } }),
  ]);
  const sums: Record<string, { d: number; c: number }> = {};
  for (const l of lines) sums[l.accountCode] = { d: l._sum.debit || 0, c: l._sum.credit || 0 };
  return accounts.map((a) => {
    const s = sums[a.code] || { d: 0, c: 0 };
    const bal = isDebitNormal(a.type) ? s.d - s.c : s.c - s.d;
    return { code: a.code, name: a.name, type: a.type, debit: round2(s.d), credit: round2(s.c), balance: round2(bal) };
  });
}

export async function financialStatements(tenantId: string, range?: DateRange) {
  const tb = await trialBalance(tenantId, range);
  const sumType = (t: string) => round2(tb.filter((r) => r.type === t).reduce((a, r) => a + r.balance, 0));
  const income = sumType("Income");
  const expense = sumType("Expense");
  const netProfit = round2(income - expense);
  const assets = sumType("Asset");
  const liabilities = sumType("Liability");
  const equity = round2(sumType("Equity") + netProfit); // net profit rolls into equity
  return {
    pnl: { income, expense, netProfit, rows: tb.filter((r) => r.type === "Income" || r.type === "Expense") },
    balanceSheet: { assets, liabilities, equity, balanced: Math.abs(assets - (liabilities + equity)) < 1, rows: tb.filter((r) => r.type === "Asset" || r.type === "Liability" || r.type === "Equity") },
  };
}

/** Backfill journals from existing finalized/paid invoices + locked payroll (for the demo). */
export async function backfillLedger(tenantId: string) {
  const posted = await db.journalEntry.count({ where: { tenantId } });
  if (posted > 0) return { skipped: true };
  await ensureChart(tenantId);
  const invoices = await db.invoice.findMany({ where: { tenantId, status: { in: ["Finalized", "Paid"] } } });
  for (const inv of invoices) {
    await postInvoiceJournal(tenantId, inv);
    if (inv.status === "Paid") await postPaymentJournal(tenantId, { receiptNo: `AUTO-${inv.number}`, amount: inv.grandTotal, method: "Bank" });
  }
  const runs = await db.payrollRun.findMany({ where: { tenantId, status: { in: ["Locked", "Paid"] } } });
  for (const run of runs) {
    await postPayrollJournal(tenantId, { label: `${run.month}/${run.year}`, grossTotal: run.grossTotal, netTotal: run.netTotal, pfTotal: run.pfTotal, esiTotal: run.esiTotal, tdsTotal: run.tdsTotal });
  }
  return { skipped: false, invoices: invoices.length, runs: runs.length };
}

function round2(n: number) {
  return Math.round((n || 0) * 100) / 100;
}
