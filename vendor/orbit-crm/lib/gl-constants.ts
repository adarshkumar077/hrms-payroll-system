// Pure GL constants — NO server imports (db/events/notify). Safe to import from
// client components. lib/gl.ts re-exports these so existing server imports keep working.

export const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const isDebitNormal = (type: string) => type === "Asset" || type === "Expense";
