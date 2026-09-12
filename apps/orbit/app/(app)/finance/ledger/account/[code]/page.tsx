import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui";
import { inr, shortDate } from "@/lib/format";
import { isDebitNormal } from "@/lib/gl";
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

export default async function AccountLedgerPage({ params }: { params: { code: string } }) {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;

  const account = await db.ledgerAccount.findFirst({ where: { tenantId: s.tenantId, code: params.code } });
  if (!account) notFound();

  const lines = await db.journalLine.findMany({
    where: { tenantId: s.tenantId, accountCode: params.code },
    include: { entry: true },
    orderBy: { entry: { date: "asc" } },
  });

  const debitNormal = isDebitNormal(account.type);
  let running = 0;
  const rows = lines.map((l) => {
    running += debitNormal ? l.debit - l.credit : l.credit - l.debit;
    return { ...l, running };
  });

  const totalDebit = lines.reduce((a, l) => a + l.debit, 0);
  const totalCredit = lines.reduce((a, l) => a + l.credit, 0);

  return (
    <div className="max-w-4xl">
      <div className="mb-4">
        <Link href="/finance/ledger" className="text-sm text-brand-700 hover:underline">
          ← Chart of Accounts
        </Link>
      </div>

      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-500">{account.code}</span>
            <h1 className="text-xl font-bold text-slate-900">{account.name}</h1>
            <Badge tone={typeTone[account.type] || "slate"}>{account.type}</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">General ledger — all postings, running balance.</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Current Balance</div>
          <div className="text-2xl font-bold text-slate-900">{inr(rows.length ? rows[rows.length - 1].running : 0)}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-400">No journal lines posted to this account yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Narration</th>
                <th className="th text-right">Debit</th>
                <th className="th text-right">Credit</th>
                <th className="th text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td className="td text-slate-600">{shortDate(l.entry.date)}</td>
                  <td className="td">
                    <Link href={`/finance/ledger/${l.entry.id}`} className="font-medium text-brand-700 hover:underline">
                      {l.entry.narration}
                    </Link>
                  </td>
                  <td className="td text-right text-slate-700">{l.debit ? inr(l.debit) : "—"}</td>
                  <td className="td text-right text-slate-700">{l.credit ? inr(l.credit) : "—"}</td>
                  <td className="td text-right font-semibold text-slate-900">{inr(l.running)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold text-slate-900">
                <td className="td" colSpan={2}>
                  Total
                </td>
                <td className="td text-right">{inr(totalDebit)}</td>
                <td className="td text-right">{inr(totalCredit)}</td>
                <td className="td"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
