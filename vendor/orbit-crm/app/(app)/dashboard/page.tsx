import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { recentEvents } from "@/lib/events";
import { inrLakh, shortDate } from "@/lib/format";
import { formatElapsed } from "@/lib/tat";
import { PageHeader, StatCard, MoneyStat, Badge, Empty } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { can } from "@/lib/rbac";
import { getStudioConfig, optionValues, valuesByCategory, type StudioConfig } from "@/lib/studio/config";

export const dynamic = "force-dynamic";

export default async function Cockpit() {
  const s = await requireSession();
  const t = s.tenantId;

  if (!(await can(s, "dashboard", "read"))) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Your whole company on one screen — updated live." />
        <Empty>You don&apos;t have access to the company dashboard — ask an admin to grant the dashboard module.</Empty>
      </div>
    );
  }

  const config = await getStudioConfig(t);
  const now = new Date();
  // Overdue = has a follow-up in the past AND isn't in a terminal state yet —
  // categories, never literal status/stage strings (leads: not converted/dead;
  // opportunities: not won/lost), matching the gating used everywhere else on
  // this page (see openStageValues/wonValues/lostValues below).
  const overdueLeadWhere = {
    tenantId: t,
    followUpAt: { lt: now },
    status: { notIn: valuesByCategory(config, "lead_status", "converted", "dead") },
  } as const;
  const overdueOppWhere = {
    tenantId: t,
    followUpAt: { lt: now },
    stage: { notIn: valuesByCategory(config, "opportunity_stage", "won", "lost") },
  } as const;

  const [
    opps,
    wonAgg,
    openInvoices,
    paidInvoices,
    leadCount,
    ticketOpen,
    headcount,
    lastRun,
    lowStock,
    events,
    overdueLeads,
    overdueLeadCount,
    overdueOpps,
    overdueOppCount,
  ] = await Promise.all([
    db.opportunity.findMany({ where: { tenantId: t, stage: { in: valuesByCategory(config, "opportunity_stage", "open") } } }),
    db.opportunity.aggregate({ where: { tenantId: t, stage: { in: valuesByCategory(config, "opportunity_stage", "won") } }, _sum: { amount: true } }),
    db.invoice.aggregate({ where: { tenantId: t, status: { in: ["Draft", "Finalized"] } }, _sum: { grandTotal: true } }),
    db.invoice.aggregate({ where: { tenantId: t, status: "Paid" }, _sum: { grandTotal: true } }),
    db.lead.count({ where: { tenantId: t, status: { notIn: valuesByCategory(config, "lead_status", "converted", "dead") } } }),
    db.ticket.count({ where: { tenantId: t, status: { in: ["Open", "InProgress"] } } }),
    db.employee.count({ where: { tenantId: t, active: true } }),
    db.payrollRun.findFirst({ where: { tenantId: t }, orderBy: { createdAt: "desc" } }),
    db.item.findMany({ where: { tenantId: t } }),
    recentEvents(t, 8),
    db.lead.findMany({ where: overdueLeadWhere, orderBy: { followUpAt: "asc" }, take: 5, select: { id: true, name: true, followUpAt: true } }),
    db.lead.count({ where: overdueLeadWhere }),
    db.opportunity.findMany({ where: overdueOppWhere, orderBy: { followUpAt: "asc" }, take: 5, select: { id: true, name: true, followUpAt: true } }),
    db.opportunity.count({ where: overdueOppWhere }),
  ]);

  type OverdueItem = { id: string; module: "leads" | "opportunities"; name: string; followUpAt: Date };
  const overdueItems: OverdueItem[] = [
    ...overdueLeads.map((l) => ({ id: l.id, module: "leads" as const, name: l.name, followUpAt: l.followUpAt as Date })),
    ...overdueOpps.map((o) => ({ id: o.id, module: "opportunities" as const, name: o.name, followUpAt: o.followUpAt as Date })),
  ]
    .sort((a, b) => a.followUpAt.getTime() - b.followUpAt.getTime())
    .slice(0, 5);
  const overdueTotal = overdueLeadCount + overdueOppCount;

  const pipeline = opps.reduce((a, o) => a + o.amount, 0);
  const weighted = opps.reduce((a, o) => a + (o.amount * o.probability) / 100, 0);
  const revenue = wonAgg._sum.amount || 0;
  const outstanding = openInvoices._sum.grandTotal || 0;
  const cash = paidInvoices._sum.grandTotal || 0;
  const payrollLiability = lastRun ? lastRun.netTotal + lastRun.pfTotal + lastRun.esiTotal : 0;
  const stockValue = lowStock.reduce((a, i) => a + i.onHand * i.costPrice, 0);
  const belowReorder = lowStock.filter((i) => i.onHand <= i.reorderLevel);

  // Compliance attention feed
  const alerts: { text: string; tone: string }[] = [];
  if (cash < payrollLiability) alerts.push({ text: `Cash collected (${inrLakh(cash)}) is below payroll liability (${inrLakh(payrollLiability)})`, tone: "red" });
  if (belowReorder.length) alerts.push({ text: `${belowReorder.length} item(s) below reorder level`, tone: "amber" });
  if (outstanding > 0) alerts.push({ text: `${inrLakh(outstanding)} in receivables outstanding`, tone: "amber" });
  alerts.push({ text: "GSTR-1 filing due on 11th — draft auto-prepared from finalized invoices", tone: "blue" });

  return (
    <div>
      <PageHeader
        title={`Good day, ${s.name.split(" ")[0]} 👋`}
        subtitle="Your whole company on one screen — updated live."
        action={<Badge tone={aiEnabled ? "green" : "slate"}>✨ AI {aiEnabled ? "Live" : "Local"}</Badge>}
      />

      {/* Top row — the money line */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <MoneyStat label="Revenue (Won)" amount={revenue} accent="green" hint="Closed-won opportunities" href="/opportunities" />
        <MoneyStat label="Cash Collected" amount={cash} accent="brand" hint="Paid invoices" href="/finance/invoices" />
        <MoneyStat label="Receivables" amount={outstanding} accent="amber" hint="Unpaid invoices" href="/finance/invoices" />
        <MoneyStat label="Weighted Pipeline" amount={weighted} accent="slate" hint={`${inrLakh(pipeline)} gross`} href="/opportunities" />
      </div>

      {/* Second row — operations */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open Leads" value={String(leadCount)} accent="brand" hint="Not yet converted" href="/leads" />
        <StatCard label="Open Tickets" value={String(ticketOpen)} accent="amber" hint="Needs attention" href="/tickets" />
        <StatCard label="Headcount" value={String(headcount)} accent="slate" hint={lastRun ? `Payroll: ${inrLakh(payrollLiability)}/mo` : "No payroll yet"} href="/hr/employees" />
        <StatCard label="Stock Value" value={inrLakh(stockValue)} accent="green" hint={`${belowReorder.length} below reorder`} href="/inventory" />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* Attention feed */}
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3 flex items-center gap-2">🔔 Needs your attention</div>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${a.tone === "red" ? "bg-rose-500" : a.tone === "amber" ? "bg-amber-500" : "bg-blue-500"}`} />
                <span className="text-slate-600">{a.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline by stage */}
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3">📊 Pipeline by stage</div>
          <StageBar tenantId={t} config={config} />
        </div>

        {/* Live activity from event bus */}
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3">⚡ Live activity</div>
          <div className="space-y-2">
            {events.map((e) => {
              let note = "";
              try { note = JSON.parse(e.payload).note || ""; } catch {}
              return (
                <div key={e.id} className="text-sm flex items-center justify-between">
                  <span className="text-slate-600">{note || e.type}</span>
                  <span className="text-xs text-slate-400">{shortDate(e.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Overdue follow-ups */}
      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3 flex items-center gap-2">⏰ Overdue follow-ups</div>
          {overdueTotal === 0 ? (
            <div className="text-sm text-slate-400">Nothing overdue — you&apos;re all caught up.</div>
          ) : (
            <>
              <div className="text-2xl font-bold text-slate-900 mb-2">{overdueTotal}</div>
              <div className="space-y-2">
                {overdueItems.map((item) => (
                  <Link
                    key={`${item.module}-${item.id}`}
                    href={`/${item.module}/${item.id}`}
                    className="flex items-center justify-between gap-2 text-sm hover:underline"
                  >
                    <span className="text-slate-600 truncate">{item.name}</span>
                    <span className="text-xs text-rose-600 shrink-0">{formatElapsed(item.followUpAt, now)} overdue</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Orbit unifies CRM, HR, Payroll, Inventory & GST Finance. This one screen is the differentiator SangamCRM never built.
      </p>
    </div>
  );
}

async function StageBar({ tenantId, config }: { tenantId: string; config: StudioConfig }) {
  const rows = await db.opportunity.groupBy({ by: ["stage"], where: { tenantId }, _sum: { amount: true }, _count: true });
  const order = optionValues(config, "opportunity_stage");
  const wonValues = new Set(valuesByCategory(config, "opportunity_stage", "won"));
  const lostValues = new Set(valuesByCategory(config, "opportunity_stage", "lost"));
  const max = Math.max(1, ...rows.map((r) => r._sum.amount || 0));
  return (
    <div className="space-y-2">
      {order.map((st) => {
        const r = rows.find((x) => x.stage === st);
        const amt = r?._sum.amount || 0;
        const pct = Math.round((amt / max) * 100);
        return (
          <div key={st}>
            <div className="flex justify-between text-xs text-slate-500 mb-0.5">
              <span>{st}</span>
              <span>{inrLakh(amt)} · {r?._count || 0}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full ${wonValues.has(st) ? "bg-emerald-500" : lostValues.has(st) ? "bg-rose-400" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
