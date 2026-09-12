import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { inr, shortDate } from "@/lib/format";
import { ensureChart, isDebitNormal } from "@/lib/gl";
import { NewAccountForm } from "./NewAccountForm";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const typeTone: Record<string, string> = {
  Asset: "blue",
  Liability: "red",
  Equity: "brand",
  Income: "green",
  Expense: "amber",
};

const sourceTone: Record<string, string> = {
  manual: "slate",
  invoice: "blue",
  payment: "green",
  payroll: "amber",
};

export default async function LedgerPage() {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;
  const t = s.tenantId;

  // Ensure the tenant has a chart of accounts (idempotent — creates default COA on first visit).
  await ensureChart(t);

  const [accounts, lineSums, entries] = await Promise.all([
    db.ledgerAccount.findMany({ where: { tenantId: t }, orderBy: { code: "asc" } }),
    db.journalLine.groupBy({ by: ["accountCode"], where: { tenantId: t }, _sum: { debit: true, credit: true } }),
    db.journalEntry.findMany({
      where: { tenantId: t },
      include: { lines: true },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  const sums: Record<string, { d: number; c: number }> = {};
  for (const l of lineSums) sums[l.accountCode] = { d: l._sum.debit || 0, c: l._sum.credit || 0 };

  const balances = accounts.map((a) => {
    const sum = sums[a.code] || { d: 0, c: 0 };
    const balance = isDebitNormal(a.type) ? sum.d - sum.c : sum.c - sum.d;
    return { ...a, balance };
  });

  return (
    <div>
      <PageHeader
        title="Ledger & Journals"
        subtitle="Double-entry general ledger — chart of accounts, journal entries, balances."
        action={
          <Link href="/finance/ledger/new" className="btn">
            + New journal entry
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Chart of Accounts */}
        <div>
          <h3 className="mb-2 font-semibold text-slate-800">Chart of Accounts</h3>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Type</th>
                  <th className="th text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((a) => (
                  <tr key={a.id}>
                    <td className="td font-mono text-slate-600">{a.code}</td>
                    <td className="td">
                      <Link href={`/finance/ledger/account/${a.code}`} className="font-medium text-brand-700 hover:underline">
                        {a.name}
                      </Link>
                    </td>
                    <td className="td">
                      <Badge tone={typeTone[a.type] || "slate"}>{a.type}</Badge>
                    </td>
                    <td className="td text-right font-semibold text-slate-900">{inr(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* New account form */}
        <div>
          <h3 className="mb-2 font-semibold text-slate-800">Add Account</h3>
          <NewAccountForm />
        </div>
      </div>

      {/* Recent journal entries */}
      <h3 className="mb-2 font-semibold text-slate-800">Recent Journal Entries</h3>
      {entries.length === 0 ? (
        <Empty>No journal entries yet. Post your first manual entry.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Narration</th>
                <th className="th">Reference</th>
                <th className="th">Source</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const total = e.lines.reduce((a, l) => a + l.debit, 0);
                return (
                  <tr key={e.id}>
                    <td className="td text-slate-600">{shortDate(e.date)}</td>
                    <td className="td">
                      <Link href={`/finance/ledger/${e.id}`} className="font-medium text-brand-700 hover:underline">
                        {e.narration}
                      </Link>
                    </td>
                    <td className="td text-slate-600">{e.reference || "—"}</td>
                    <td className="td">
                      <Badge tone={sourceTone[e.source] || "slate"}>{e.source}</Badge>
                    </td>
                    <td className="td text-right font-semibold text-slate-900">{inr(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
