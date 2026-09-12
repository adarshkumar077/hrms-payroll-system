import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureChart, trialBalance, financialStatements } from "@/lib/gl";
import { PageHeader, MoneyStat, Badge, Empty } from "@/components/ui";
import { inr } from "@/lib/format";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, string> = {
  Asset: "brand",
  Liability: "amber",
  Equity: "blue",
  Income: "green",
  Expense: "red",
};

function formatDateRange(from?: string, to?: string): string {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00Z");
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };
  if (from && to) return `Showing ${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `Showing from ${formatDate(from)}`;
  if (to) return `Showing until ${formatDate(to)}`;
  return "";
}

export default async function FinancialReportsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;
  const t = s.tenantId;

  // Parse date range from searchParams
  const fromStr = typeof searchParams.from === "string" ? searchParams.from : undefined;
  const toStr = typeof searchParams.to === "string" ? searchParams.to : undefined;

  const range = {
    from: fromStr ? new Date(fromStr) : undefined,
    to: toStr ? new Date(toStr + "T23:59:59") : undefined,
  };

  await ensureChart(t);

  const journalCount = await db.journalEntry.count({ where: { tenantId: t } });

  if (journalCount === 0) {
    return (
      <div>
        <PageHeader title="Financial Reports" subtitle="Trial Balance, Profit & Loss, and Balance Sheet." />
        <Empty>
          No posted journal entries yet. Finalizing GST invoices, recording payments, or running payroll will post
          entries to the ledger — reports will appear here once there's activity.{" "}
          <Link href="/finance/ledger" className="text-brand-700 hover:underline">
            Go to Ledger &amp; Journals
          </Link>
          .
        </Empty>
      </div>
    );
  }

  const [tb, stmts] = await Promise.all([trialBalance(t, range), financialStatements(t, range)]);

  const totalDebit = tb.reduce((a, r) => a + r.debit, 0);
  const totalCredit = tb.reduce((a, r) => a + r.credit, 0);
  const tbBalanced = Math.abs(totalDebit - totalCredit) < 1;

  const { pnl, balanceSheet } = stmts;
  const incomeRows = pnl.rows.filter((r) => r.type === "Income");
  const expenseRows = pnl.rows.filter((r) => r.type === "Expense");
  const assetRows = balanceSheet.rows.filter((r) => r.type === "Asset");
  const liabilityRows = balanceSheet.rows.filter((r) => r.type === "Liability");
  const equityRows = balanceSheet.rows.filter((r) => r.type === "Equity");

  return (
    <div>
      <PageHeader title="Financial Reports" subtitle="Trial Balance, Profit & Loss, and Balance Sheet." />

      {/* Date Range Filter */}
      <div className="card mb-6 p-4">
        <form action="/finance/reports" method="GET" className="flex flex-col md:flex-row gap-4 items-end">
          <div className="flex-1">
            <label className="label">From</label>
            <input
              type="date"
              name="from"
              defaultValue={fromStr || ""}
              className="input w-full"
            />
          </div>
          <div className="flex-1">
            <label className="label">To</label>
            <input
              type="date"
              name="to"
              defaultValue={toStr || ""}
              className="input w-full"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn">
              Apply
            </button>
            {(fromStr || toStr) && (
              <Link href="/finance/reports" className="btn btn-ghost">
                Clear
              </Link>
            )}
          </div>
        </form>
        {(fromStr || toStr) && (
          <p className="text-xs text-slate-500 mt-3">{formatDateRange(fromStr, toStr)}</p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MoneyStat label="Total Income" amount={pnl.income} accent="green" />
        <MoneyStat label="Total Expense" amount={pnl.expense} accent="red" />
        <MoneyStat
          label="Net Profit / Loss"
          amount={pnl.netProfit}
          accent={pnl.netProfit >= 0 ? "green" : "red"}
          hint={pnl.netProfit >= 0 ? "Profit" : "Loss"}
        />
        <MoneyStat label="Total Assets" amount={balanceSheet.assets} accent="brand" />
      </div>

      {/* Trial Balance */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900">Trial Balance</h2>
          {tbBalanced ? (
            <Badge tone="green">✓ In balance</Badge>
          ) : (
            <Badge tone="red">✗ Out of balance</Badge>
          )}
        </div>
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Code</th>
                <th className="th">Account</th>
                <th className="th">Type</th>
                <th className="th text-right">Debit</th>
                <th className="th text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {tb.map((row) => (
                <tr key={row.code}>
                  <td className="td text-slate-500">{row.code}</td>
                  <td className="td font-medium text-slate-800">{row.name}</td>
                  <td className="td">
                    <Badge tone={TYPE_TONE[row.type] || "slate"}>{row.type}</Badge>
                  </td>
                  <td className="td text-right">{row.debit ? inr(row.debit) : "—"}</td>
                  <td className="td text-right">{row.credit ? inr(row.credit) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold">
                <td className="td" colSpan={3}>
                  Total
                </td>
                <td className="td text-right">{inr(totalDebit)}</td>
                <td className="td text-right">{inr(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Profit & Loss */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-900 mb-3">Profit &amp; Loss</h2>
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Code</th>
                <th className="th">Account</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide" colSpan={3}>
                  Income
                </td>
              </tr>
              {incomeRows.length === 0 ? (
                <tr>
                  <td className="td text-slate-400" colSpan={3}>
                    No income recorded.
                  </td>
                </tr>
              ) : (
                incomeRows.map((row) => (
                  <tr key={row.code}>
                    <td className="td text-slate-500">{row.code}</td>
                    <td className="td text-slate-700">{row.name}</td>
                    <td className="td text-right">{inr(row.balance)}</td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-50 font-semibold">
                <td className="td" colSpan={2}>
                  Total Income
                </td>
                <td className="td text-right">{inr(pnl.income)}</td>
              </tr>

              <tr>
                <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide pt-4" colSpan={3}>
                  Expense
                </td>
              </tr>
              {expenseRows.length === 0 ? (
                <tr>
                  <td className="td text-slate-400" colSpan={3}>
                    No expense recorded.
                  </td>
                </tr>
              ) : (
                expenseRows.map((row) => (
                  <tr key={row.code}>
                    <td className="td text-slate-500">{row.code}</td>
                    <td className="td text-slate-700">{row.name}</td>
                    <td className="td text-right">{inr(row.balance)}</td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-50 font-semibold">
                <td className="td" colSpan={2}>
                  Total Expense
                </td>
                <td className="td text-right">{inr(pnl.expense)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className={pnl.netProfit >= 0 ? "bg-emerald-50" : "bg-rose-50"}>
                <td className={`td font-bold ${pnl.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`} colSpan={2}>
                  Net {pnl.netProfit >= 0 ? "Profit" : "Loss"}
                </td>
                <td className={`td text-right font-bold ${pnl.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  {inr(Math.abs(pnl.netProfit))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Balance Sheet */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900">Balance Sheet</h2>
          {balanceSheet.balanced ? (
            <Badge tone="green">✓ Assets = Liabilities + Equity</Badge>
          ) : (
            <Badge tone="red">✗ Assets ≠ Liabilities + Equity</Badge>
          )}
        </div>
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Code</th>
                <th className="th">Account</th>
                <th className="th text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide" colSpan={3}>
                  Assets
                </td>
              </tr>
              {assetRows.length === 0 ? (
                <tr>
                  <td className="td text-slate-400" colSpan={3}>
                    No asset balances.
                  </td>
                </tr>
              ) : (
                assetRows.map((row) => (
                  <tr key={row.code}>
                    <td className="td text-slate-500">{row.code}</td>
                    <td className="td text-slate-700">{row.name}</td>
                    <td className="td text-right">{inr(row.balance)}</td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-50 font-semibold">
                <td className="td" colSpan={2}>
                  Total Assets
                </td>
                <td className="td text-right">{inr(balanceSheet.assets)}</td>
              </tr>

              <tr>
                <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide pt-4" colSpan={3}>
                  Liabilities
                </td>
              </tr>
              {liabilityRows.length === 0 ? (
                <tr>
                  <td className="td text-slate-400" colSpan={3}>
                    No liability balances.
                  </td>
                </tr>
              ) : (
                liabilityRows.map((row) => (
                  <tr key={row.code}>
                    <td className="td text-slate-500">{row.code}</td>
                    <td className="td text-slate-700">{row.name}</td>
                    <td className="td text-right">{inr(row.balance)}</td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-50 font-semibold">
                <td className="td" colSpan={2}>
                  Total Liabilities
                </td>
                <td className="td text-right">{inr(balanceSheet.liabilities)}</td>
              </tr>

              <tr>
                <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide pt-4" colSpan={3}>
                  Equity
                </td>
              </tr>
              {equityRows.length === 0 ? (
                <tr>
                  <td className="td text-slate-400" colSpan={3}>
                    No equity balances.
                  </td>
                </tr>
              ) : (
                equityRows.map((row) => (
                  <tr key={row.code}>
                    <td className="td text-slate-500">{row.code}</td>
                    <td className="td text-slate-700">{row.name}</td>
                    <td className="td text-right">{inr(row.balance)}</td>
                  </tr>
                ))
              )}
              <tr>
                <td className="td text-slate-500" colSpan={2}>
                  Net Profit (rolled into equity)
                </td>
                <td className="td text-right">{inr(pnl.netProfit)}</td>
              </tr>
              <tr className="bg-slate-50 font-semibold">
                <td className="td" colSpan={2}>
                  Total Equity
                </td>
                <td className="td text-right">{inr(balanceSheet.equity)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className={balanceSheet.balanced ? "bg-emerald-50" : "bg-rose-50"}>
                <td
                  className={`td font-bold ${balanceSheet.balanced ? "text-emerald-700" : "text-rose-700"}`}
                  colSpan={2}
                >
                  Liabilities + Equity
                </td>
                <td
                  className={`td text-right font-bold ${balanceSheet.balanced ? "text-emerald-700" : "text-rose-700"}`}
                >
                  {inr(balanceSheet.liabilities + balanceSheet.equity)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Generated from posted journal entries. See the{" "}
        <Link href="/finance/ledger" className="text-brand-700 hover:underline">
          General Ledger
        </Link>{" "}
        for the full entry-level detail.
      </p>
    </div>
  );
}
