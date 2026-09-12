import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { inr, shortDate } from "@/lib/format";
import { FilterBar, Pagination } from "@/components/ListControls";
import { parseListParams, pageInfo } from "@/lib/list";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

export default async function TallyIntegrationPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const s = await requireSession();
  if (!(await can(s, "integrations", "read"))) return <NoAccess label="Integrations" />;
  const t = s.tenantId;
  const p = parseListParams(searchParams);

  const where = {
    tenantId: t,
    ...(p.q ? { name: { contains: p.q } } : {}),
  };

  const [ledgers, total, pushedInvoices] = await Promise.all([
    db.tallyLedger.findMany({
      where,
      orderBy: { name: "asc" },
      skip: p.skip,
      take: p.take,
    }),
    db.tallyLedger.count({ where }),
    db.invoice.findMany({
      where: { tenantId: t, tallyPushedAt: { not: null } },
      include: { account: true },
      orderBy: { tallyPushedAt: "desc" },
      take: 10,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Tally Sync"
        subtitle="Ledger mirror and pushed invoices from the on-prem Tally connector."
        action={
          <Link href="/integrations" className="btn-ghost text-xs py-1.5">
            ← Back to Integrations
          </Link>
        }
      />

      <h2 className="text-sm font-semibold text-slate-700 mb-3">Ledgers ({total})</h2>
      <FilterBar placeholder="Search ledger name…" />

      {ledgers.length === 0 ? (
        <Empty>No ledgers synced yet — run the connector to pull them from Tally.</Empty>
      ) : (
        <div className="card overflow-hidden mb-3">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Group</th>
                <th className="th text-right">Closing balance</th>
                <th className="th text-right">Outstanding</th>
                <th className="th">Last synced</th>
              </tr>
            </thead>
            <tbody>
              {ledgers.map((l) => (
                <tr key={l.id}>
                  <td className="td font-medium text-slate-800">{l.name}</td>
                  <td className="td text-slate-600">{l.group || "—"}</td>
                  <td className="td text-right">{inr(l.closingBalance)}</td>
                  <td className="td text-right">{inr(l.outstanding)}</td>
                  <td className="td text-slate-600">{shortDate(l.lastSyncedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination {...pageInfo(total, p.page)} />

      <h2 className="text-sm font-semibold text-slate-700 mt-8 mb-3">Pushed invoices (last 10)</h2>
      {pushedInvoices.length === 0 ? (
        <Empty>No invoices have been pushed to Tally yet.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Number</th>
                <th className="th">Account</th>
                <th className="th text-right">Grand total</th>
                <th className="th">Pushed at</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {pushedInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td className="td font-medium">
                    <Link href={`/finance/invoices/${inv.id}`} className="text-brand-700 hover:underline">
                      {inv.number}
                    </Link>
                  </td>
                  <td className="td text-slate-600">{inv.account?.name || "—"}</td>
                  <td className="td text-right">{inr(inv.grandTotal)}</td>
                  <td className="td text-slate-600">{shortDate(inv.tallyPushedAt)}</td>
                  <td className="td">
                    <Badge tone="green">Pushed</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
