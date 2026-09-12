import { useEffect, useState } from "react";
import { apiGet, ApiError, inr, inrLakh } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";

type TrialBalanceRow = {
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  debit: number;
  credit: number;
  balance: number;
};

type ProfitAndLoss = {
  income: number;
  expense: number;
  netProfit: number;
  rows: TrialBalanceRow[];
};

type BalanceSheet = {
  assets: number;
  liabilities: number;
  equity: number;
  balanced: boolean;
  rows: TrialBalanceRow[];
};

type GstSummary = {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

type ReceivablesPayables = {
  total: number;
  count: number;
};

type Reports = {
  trialBalance: TrialBalanceRow[];
  profitAndLoss: ProfitAndLoss;
  balanceSheet: BalanceSheet;
  gstSummary: GstSummary;
  receivables: ReceivablesPayables;
  payables: ReceivablesPayables;
};

export function ReportsPage() {
  const [data, setData] = useState<Reports | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet<Reports>("/finance/reports")
      .then(setData)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Failed to load reports."));
  }, []);

  if (err) {
    return (
      <div>
        <PageHeader title="Financial Reports" />
        <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div>
        <PageHeader title="Financial Reports" />
        <div className="card p-6 text-sm text-slate-400">Loading…</div>
      </div>
    );
  }

  const { trialBalance, profitAndLoss, balanceSheet, gstSummary, receivables, payables } = data;

  const tbTotals = trialBalance.reduce(
    (acc, r) => ({ debit: acc.debit + Number(r.debit || 0), credit: acc.credit + Number(r.credit || 0) }),
    { debit: 0, credit: 0 }
  );
  const tbInBalance = Math.abs(tbTotals.debit - tbTotals.credit) < 1;

  const ledgerEmpty = trialBalance.length === 0 || trialBalance.every((r) => r.debit === 0 && r.credit === 0);

  const incomeRows = profitAndLoss.rows.filter((r) => r.type === "Income");
  const expenseRows = profitAndLoss.rows.filter((r) => r.type === "Expense");
  const assetRows = balanceSheet.rows.filter((r) => r.type === "Asset");
  const liabilityRows = balanceSheet.rows.filter((r) => r.type === "Liability");
  const equityRows = balanceSheet.rows.filter((r) => r.type === "Equity");

  return (
    <div>
      <PageHeader title="Financial Reports" subtitle="Trial balance, P&L, balance sheet and GST — live from the general ledger" />

      {ledgerEmpty && (
        <div className="mb-5 rounded-lg bg-amber-50 text-amber-800 text-sm px-3 py-2">
          The general ledger has no postings yet. Finalize a GST invoice, record a payment, approve/pay a vendor
          bill, or run payroll — each of those auto-posts a journal entry, and these reports will fill in.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="Total Income" value={inrLakh(profitAndLoss.income)} accent="blue" />
        <StatCard label="Total Expense" value={inrLakh(profitAndLoss.expense)} accent="red" />
        <StatCard
          label="Net Profit"
          value={inrLakh(profitAndLoss.netProfit)}
          accent={profitAndLoss.netProfit >= 0 ? "green" : "red"}
        />
        <StatCard label="Total Assets" value={inrLakh(balanceSheet.assets)} accent="brand" />
        <StatCard label="Receivables" value={inrLakh(receivables.total)} hint={`${receivables.count} unpaid invoice${receivables.count === 1 ? "" : "s"}`} accent="amber" />
        <StatCard label="Payables" value={inrLakh(payables.total)} hint={`${payables.count} unpaid bill${payables.count === 1 ? "" : "s"}`} accent="slate" />
      </div>

      {/* Trial Balance */}
      <div className="card overflow-x-auto mb-6">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-slate-800">Trial Balance</h2>
          <span className={`badge ${tbInBalance ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
            {tbInBalance ? "In balance ✓" : "Out of balance ✗"}
          </span>
        </div>
        <table className="w-full mt-2">
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
            {trialBalance.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={5}>
                  No ledger accounts yet.
                </td>
              </tr>
            )}
            {trialBalance.map((r) => (
              <tr key={r.code}>
                <td className="td font-mono text-xs">{r.code}</td>
                <td className="td font-medium text-slate-800">{r.name}</td>
                <td className="td">
                  <span className="badge">{r.type}</span>
                </td>
                <td className="td text-right">{r.debit ? inr(r.debit) : "—"}</td>
                <td className="td text-right">{r.credit ? inr(r.credit) : "—"}</td>
              </tr>
            ))}
          </tbody>
          {trialBalance.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200">
                <td className="td font-semibold" colSpan={3}>
                  Total
                </td>
                <td className="td text-right font-semibold">{inr(tbTotals.debit)}</td>
                <td className="td text-right font-semibold">{inr(tbTotals.credit)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Profit & Loss */}
        <div className="card overflow-x-auto">
          <div className="px-4 pt-4">
            <h2 className="text-sm font-semibold text-slate-800">Profit &amp; Loss</h2>
          </div>
          <table className="w-full mt-2">
            <thead>
              <tr>
                <th className="th">Account</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {incomeRows.length === 0 && expenseRows.length === 0 && (
                <tr>
                  <td className="td text-slate-400" colSpan={2}>
                    No income or expense postings yet.
                  </td>
                </tr>
              )}
              {incomeRows.length > 0 && (
                <tr>
                  <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide" colSpan={2}>
                    Income
                  </td>
                </tr>
              )}
              {incomeRows.map((r) => (
                <tr key={r.code}>
                  <td className="td">{r.name}</td>
                  <td className="td text-right text-emerald-700">{inr(r.balance)}</td>
                </tr>
              ))}
              {expenseRows.length > 0 && (
                <tr>
                  <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide" colSpan={2}>
                    Expense
                  </td>
                </tr>
              )}
              {expenseRows.map((r) => (
                <tr key={r.code}>
                  <td className="td">{r.name}</td>
                  <td className="td text-right text-rose-700">{inr(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div
            className={`mx-4 mb-4 mt-2 rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-between ${
              profitAndLoss.netProfit >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            <span>Net Profit</span>
            <span>{inr(profitAndLoss.netProfit)}</span>
          </div>
        </div>

        {/* Balance Sheet */}
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-sm font-semibold text-slate-800">Balance Sheet</h2>
            <span className={`badge ${balanceSheet.balanced ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
              {balanceSheet.balanced ? "Balanced ✓" : "Unbalanced ✗"}
            </span>
          </div>
          <table className="w-full mt-2">
            <thead>
              <tr>
                <th className="th">Account</th>
                <th className="th text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {assetRows.length === 0 && liabilityRows.length === 0 && equityRows.length === 0 && (
                <tr>
                  <td className="td text-slate-400" colSpan={2}>
                    No balance sheet postings yet.
                  </td>
                </tr>
              )}
              {assetRows.length > 0 && (
                <tr>
                  <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide" colSpan={2}>
                    Assets
                  </td>
                </tr>
              )}
              {assetRows.map((r) => (
                <tr key={r.code}>
                  <td className="td">{r.name}</td>
                  <td className="td text-right">{inr(r.balance)}</td>
                </tr>
              ))}
              {liabilityRows.length > 0 && (
                <tr>
                  <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide" colSpan={2}>
                    Liabilities
                  </td>
                </tr>
              )}
              {liabilityRows.map((r) => (
                <tr key={r.code}>
                  <td className="td">{r.name}</td>
                  <td className="td text-right">{inr(r.balance)}</td>
                </tr>
              ))}
              {equityRows.length > 0 && (
                <tr>
                  <td className="td font-semibold text-slate-500 uppercase text-xs tracking-wide" colSpan={2}>
                    Equity
                  </td>
                </tr>
              )}
              {equityRows.map((r) => (
                <tr key={r.code}>
                  <td className="td">{r.name}</td>
                  <td className="td text-right">{inr(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-2 mx-4 mb-4 mt-2 text-sm">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-400">Assets</div>
              <div className="font-semibold text-slate-800">{inr(balanceSheet.assets)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-400">Liabilities</div>
              <div className="font-semibold text-slate-800">{inr(balanceSheet.liabilities)}</div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="text-xs text-slate-400">Equity</div>
              <div className="font-semibold text-slate-800">{inr(balanceSheet.equity)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* GST Summary */}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">GST Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="CGST" value={inr(gstSummary.cgst)} accent="blue" />
          <StatCard label="SGST" value={inr(gstSummary.sgst)} accent="blue" />
          <StatCard label="IGST" value={inr(gstSummary.igst)} accent="blue" />
          <StatCard label="Total Collected" value={inrLakh(gstSummary.total)} accent="brand" />
        </div>
        <p className="text-xs text-slate-400 mt-3">GST collected on Finalized and Paid sales invoices.</p>
      </div>
    </div>
  );
}
