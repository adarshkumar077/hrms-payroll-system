import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui";
import { inr, shortDate } from "@/lib/format";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const sourceTone: Record<string, string> = {
  manual: "slate",
  invoice: "blue",
  payment: "green",
  payroll: "amber",
};

export default async function JournalEntryDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;

  const entry = await db.journalEntry.findFirst({
    where: { id: params.id, tenantId: s.tenantId },
    include: { lines: true },
  });
  if (!entry) notFound();

  const accounts = await db.ledgerAccount.findMany({
    where: { tenantId: s.tenantId, code: { in: entry.lines.map((l) => l.accountCode) } },
  });
  const byCode: Record<string, (typeof accounts)[number]> = {};
  for (const a of accounts) byCode[a.code] = a;

  const totalDr = entry.lines.reduce((a, l) => a + l.debit, 0);
  const totalCr = entry.lines.reduce((a, l) => a + l.credit, 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <Link href="/finance/ledger" className="text-sm text-brand-700 hover:underline">
          ← All ledger entries
        </Link>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-start justify-between border-b border-slate-200 p-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Journal Entry</div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{entry.narration}</div>
            <div className="mt-1 text-sm text-slate-500">
              {shortDate(entry.date)} · Reference: {entry.reference || "—"}
            </div>
          </div>
          <Badge tone={sourceTone[entry.source] || "slate"}>{entry.source}</Badge>
        </div>

        <div className="overflow-x-auto p-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2 font-medium">Account</th>
                <th className="pb-2 text-right font-medium">Debit</th>
                <th className="pb-2 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((l) => {
                const acc = byCode[l.accountCode];
                return (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-2.5 text-slate-800">
                      <span className="font-mono text-slate-500">{l.accountCode}</span>{" "}
                      <span className="font-medium">{acc?.name || "—"}</span>
                    </td>
                    <td className="py-2.5 text-right text-slate-700">{l.debit ? inr(l.debit) : "—"}</td>
                    <td className="py-2.5 text-right text-slate-700">{l.credit ? inr(l.credit) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold text-slate-900">
                <td className="pt-2">Total</td>
                <td className="pt-2 text-right">{inr(totalDr)}</td>
                <td className="pt-2 text-right">{inr(totalCr)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
