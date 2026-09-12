import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { PageHeader, StatCard, MoneyStat, Badge, Empty } from "@/components/ui";
import { FilterBar, Pagination, SortLink } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, moduleLabel, optionValues, optionTone, valuesByCategory, defaultValue } from "@/lib/studio/config";

export const dynamic = "force-dynamic";

// Studio "quotation_stage" tone key -> components/ui.tsx Badge tone prop —
// same map as app/(app)/quotations/[id]/page.tsx (kept local since Badge's
// tone vocabulary is fixed and small; not worth a shared import for one map).
const STAGE_TONE_TO_BADGE: Record<string, string> = {
  slate: "slate",
  amber: "amber",
  blue: "blue",
  violet: "brand",
  emerald: "green",
  rose: "red",
};

export default async function QuotationsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "quotations", "read"))) return <NoAccess label="Quotations" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);

  const p = parseListParams(searchParams);
  const where = {
    tenantId: t,
    ...(p.q ? { OR: [{ number: { contains: p.q } }] } : {}),
    ...(p.status ? { status: p.status } : {}),
  };

  const [quotes, total, groups, valueAgg] = await Promise.all([
    db.quotation.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["createdAt", "grandTotal", "number"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
      include: { account: true },
    }),
    db.quotation.count({ where }),
    db.quotation.groupBy({ by: ["status"], where: { tenantId: t }, _count: true }),
    db.quotation.aggregate({ where: { tenantId: t }, _sum: { grandTotal: true } }),
  ]);

  const count = (st: string) => groups.find((g) => g.status === st)?._count || 0;
  // "Draft" here means the config's default stage value, not a literal —
  // tenants can rename/reorder quotation_stage options freely.
  const draftStage = defaultValue(config, "quotation_stage") ?? "Draft";
  const sentStatuses = valuesByCategory(config, "quotation_stage", "open").filter((v) => v !== draftStage);
  const sentCount = groups.filter((g) => sentStatuses.includes(g.status)).reduce((a, g) => a + g._count, 0);
  const wonStatuses = valuesByCategory(config, "quotation_stage", "won");
  const acceptedCount = groups.filter((g) => wonStatuses.includes(g.status)).reduce((a, g) => a + g._count, 0);
  const totalValue = valueAgg._sum.grandTotal || 0;
  const acceptedValue = await db.quotation.aggregate({
    where: { tenantId: t, status: { in: wonStatuses } },
    _sum: { grandTotal: true },
  });

  const quotationsLabel = moduleLabel(config, "quotations", "plural");

  return (
    <div>
      <PageHeader
        title={quotationsLabel}
        subtitle="Proposals sent to prospects and customers."
        action={
          <Link href="/quotations/new" className="btn">
            + New Quotation
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Quotes" value={String(total)} accent="brand" />
        <StatCard label="Sent / Pending" value={String(sentCount)} accent="amber" hint={`${count(draftStage)} draft`} />
        <StatCard label="Accepted" value={String(acceptedCount)} accent="green" />
        <MoneyStat label="Total Value" amount={totalValue} accent="slate" hint={`${inr(acceptedValue._sum.grandTotal || 0)} accepted`} />
      </div>

      <FilterBar statuses={optionValues(config, "quotation_stage")} placeholder="Search number…" />

      {quotes.length === 0 ? (
        <Empty>No {quotationsLabel.toLowerCase()} match your filters.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">
                  <SortLink field="number" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Number
                  </SortLink>
                </th>
                <th className="th">Account</th>
                <th className="th">Stage</th>
                <th className="th text-right">Subtotal</th>
                <th className="th text-right">Tax</th>
                <th className="th text-right">
                  <SortLink field="grandTotal" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Grand Total
                  </SortLink>
                </th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td className="td font-medium text-brand-700">
                    <Link href={`/quotations/${q.id}`} className="hover:underline">
                      {q.number}
                    </Link>
                  </td>
                  <td className="td text-slate-600">{q.account?.name || "—"}</td>
                  <td className="td">
                    <Badge tone={STAGE_TONE_TO_BADGE[optionTone(config, "quotation_stage", q.status) || ""] || "slate"}>
                      {q.status}
                    </Badge>
                  </td>
                  <td className="td text-right text-slate-600">{inr(q.subtotal)}</td>
                  <td className="td text-right text-slate-600">{inr(q.taxTotal)}</td>
                  <td className="td text-right font-semibold text-slate-800">{inr(q.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination {...pageInfo(total, p.page)} />
    </div>
  );
}
