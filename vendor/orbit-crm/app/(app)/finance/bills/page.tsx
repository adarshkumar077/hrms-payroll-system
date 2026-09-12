import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, MoneyStat, Badge, Empty } from "@/components/ui";
import { FilterBar, Pagination } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { NewBillForm } from "./NewBillForm";
import { BillActions } from "./BillActions";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const statusTone: Record<string, string> = {
  Draft: "slate",
  Approved: "amber",
  Paid: "green",
};

const sourceTone: Record<string, string> = {
  manual: "slate",
  ocr: "blue",
};

export default async function VendorBillsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;
  const t = s.tenantId;
  const p = parseListParams(searchParams);

  const where = {
    tenantId: t,
    ...(p.status ? { status: p.status } : {}),
    ...(p.q
      ? {
          OR: [
            { vendor: { contains: p.q } },
            { billNumber: { contains: p.q } },
          ],
        }
      : {}),
  };

  const [bills, total] = await Promise.all([
    db.vendorBill.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["createdAt", "total", "dueDate"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
    }),
    db.vendorBill.count({ where }),
  ]);

  // ── Stat aggregates (over full tenant table, not the paged/filtered rows) ──
  const allBills = await db.vendorBill.findMany({
    where: { tenantId: t },
    select: { total: true, status: true, dueDate: true, createdAt: true },
  });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalPayables = allBills
    .filter((b) => b.status === "Draft" || b.status === "Approved")
    .reduce((a, b) => a + b.total, 0);

  const overdue = allBills
    .filter((b) => b.status !== "Paid" && b.dueDate && new Date(b.dueDate) < now)
    .reduce((a, b) => a + b.total, 0);

  const paidThisMonth = allBills
    .filter((b) => b.status === "Paid" && new Date(b.createdAt) >= monthStart)
    .reduce((a, b) => a + b.total, 0);

  return (
    <div>
      <PageHeader
        title="Vendor Bills"
        subtitle="Accounts payable — track, approve, and pay vendor bills."
        action={<NewBillForm />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MoneyStat label="Total Payables" amount={totalPayables} accent="brand" hint="Draft + Approved" />
        <MoneyStat label="Overdue" amount={overdue} accent="red" hint="Past due date, unpaid" />
        <MoneyStat label="Paid This Month" amount={paidThisMonth} accent="green" hint="Settled bills" />
      </div>

      <FilterBar statuses={["Draft", "Approved", "Paid"]} placeholder="Search vendor or bill number…" />

      {total === 0 ? (
        <Empty>No vendor bills yet. Create your first bill.</Empty>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Bill #</th>
                  <th className="th">Vendor</th>
                  <th className="th">Date</th>
                  <th className="th">Due date</th>
                  <th className="th text-right">Total</th>
                  <th className="th">Status</th>
                  <th className="th">Source</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const isOverdue = b.status !== "Paid" && b.dueDate && new Date(b.dueDate) < now;
                  return (
                    <tr key={b.id}>
                      <td className="td font-medium text-slate-800">{b.billNumber}</td>
                      <td className="td text-slate-600">{b.vendor}</td>
                      <td className="td text-slate-600">{shortDate(b.date)}</td>
                      <td className={`td ${isOverdue ? "text-rose-600 font-medium" : "text-slate-600"}`}>
                        {shortDate(b.dueDate)}
                      </td>
                      <td className="td text-right font-semibold text-slate-900">{inr(b.total)}</td>
                      <td className="td">
                        <Badge tone={statusTone[b.status] || "slate"}>{b.status}</Badge>
                      </td>
                      <td className="td">
                        <Badge tone={sourceTone[b.source] || "slate"}>{b.source}</Badge>
                      </td>
                      <td className="td">
                        <BillActions billId={b.id} status={b.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...pageInfo(total, p.page)} />
        </>
      )}
    </div>
  );
}
