import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { bankSummary, suggestMatch } from "@/lib/bank";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { inr, shortDate } from "@/lib/format";
import { ImportBankCsv } from "./ImportBankCsv";
import { ReconcileMatchButton, MarkReconciledButton, UnreconcileButton } from "./ReconcileActions";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

export default async function BankReconciliationPage() {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;
  const t = s.tenantId;

  const [summary, txns] = await Promise.all([
    bankSummary(t),
    db.bankTransaction.findMany({ where: { tenantId: t }, orderBy: { date: "desc" } }),
  ]);

  // Compute suggested matches server-side for unreconciled credit rows, so client
  // buttons only ever carry ids.
  const suggestions = new Map<string, { receiptNo: string; amount: number; id: string }>();
  for (const txn of txns) {
    if (txn.reconciled || txn.direction !== "credit") continue;
    const match = await suggestMatch(t, { amount: txn.amount, date: txn.date, direction: txn.direction });
    if (match) suggestions.set(txn.id, { id: match.id, receiptNo: match.receiptNo, amount: match.amount });
  }

  return (
    <div>
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Import your bank statement and match it against recorded payments."
        action={<ImportBankCsv />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Transactions" value={String(summary.total)} accent="brand" />
        <StatCard label="Reconciled" value={String(summary.reconciled)} accent="green" />
        <StatCard label="Unreconciled" value={String(summary.unreconciled)} accent="amber" />
      </div>

      {txns.length === 0 ? (
        <Empty>No bank transactions imported yet. Paste a statement CSV above to get started.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Date</th>
                <th className="th">Description</th>
                <th className="th text-right">Amount</th>
                <th className="th">Direction</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((txn) => {
                const suggestion = suggestions.get(txn.id);
                return (
                  <tr key={txn.id}>
                    <td className="td text-slate-600">{shortDate(txn.date)}</td>
                    <td className="td text-slate-800">{txn.description}</td>
                    <td className={`td text-right font-medium ${txn.direction === "credit" ? "text-emerald-600" : "text-rose-600"}`}>
                      {txn.direction === "credit" ? "+" : "−"}
                      {inr(txn.amount)}
                    </td>
                    <td className="td">
                      <Badge tone={txn.direction === "credit" ? "green" : "red"}>
                        {txn.direction === "credit" ? "Credit" : "Debit"}
                      </Badge>
                    </td>
                    <td className="td">
                      {txn.reconciled ? (
                        <Badge tone="green">Reconciled{txn.matchedType && txn.matchedType !== "manual" ? ` · ${txn.matchedType}` : txn.matchedType === "manual" ? " · manual" : ""}</Badge>
                      ) : (
                        <Badge tone="amber">Unreconciled</Badge>
                      )}
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-2 justify-end">
                        {!txn.reconciled && suggestion && (
                          <>
                            <span className="text-xs text-slate-500">
                              Match: {suggestion.receiptNo} · {inr(suggestion.amount)}
                            </span>
                            <ReconcileMatchButton txnId={txn.id} matchedType="payment" matchedId={suggestion.id} />
                          </>
                        )}
                        {!txn.reconciled && <MarkReconciledButton txnId={txn.id} />}
                        {txn.reconciled && <UnreconcileButton txnId={txn.id} />}
                      </div>
                    </td>
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
