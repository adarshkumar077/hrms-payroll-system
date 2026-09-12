import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { Pagination, SortLink } from "@/components/ListControls";
import { CallsFilterBar } from "./CallsFilterBar";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { getStudioConfig, moduleLabel } from "@/lib/studio/config";
import type { CallDirection, CallStatus } from "@/lib/telephony";

export const dynamic = "force-dynamic";

// Call.status is a PROVIDER-domain literal set (docs/ai/design/wave-d-contracts.md
// §Sanctioned literals — same exception carved out for Invoice.status), not a
// tenant Studio picklist, so a small local tone/label map is intentional here
// instead of optionTone(config, ...).
const STATUS_META: Record<CallStatus, { label: string; tone: string }> = {
  initiated: { label: "Initiated", tone: "slate" },
  answered: { label: "Answered", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  missed: { label: "Missed", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
};
const STATUS_OPTIONS = (Object.keys(STATUS_META) as CallStatus[]).map((v) => ({ value: v, label: STATUS_META[v].label }));

const DIRECTION_META: Record<CallDirection, { label: string; icon: string; tone: string }> = {
  inbound: { label: "Inbound", icon: "📥", tone: "blue" },
  outbound: { label: "Outbound", icon: "📤", tone: "slate" },
};
const DIRECTION_OPTIONS = (Object.keys(DIRECTION_META) as CallDirection[]).map((v) => ({ value: v, label: DIRECTION_META[v].label }));

function statusMeta(status: string) {
  return STATUS_META[status as CallStatus] ?? { label: status, tone: "slate" };
}
function directionMeta(direction: string) {
  return DIRECTION_META[direction as CallDirection] ?? { label: direction, icon: "☎️", tone: "slate" };
}

function mmss(sec: number | null | undefined): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function dateTime(d: Date): string {
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function CallsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "calls", "read"))) return <NoAccess label="Calls" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);

  const p = parseListParams(searchParams);
  const directionParam = searchParams["direction"];
  const direction = (Array.isArray(directionParam) ? directionParam[0] : directionParam) || "";

  const where = {
    tenantId: t,
    ...(p.q ? { OR: [{ fromNumber: { contains: p.q } }, { toNumber: { contains: p.q } }] } : {}),
    ...(p.status ? { status: p.status } : {}),
    ...(direction ? { direction } : {}),
  };

  const todayStart = startOfToday();

  const [calls, total, todayCount, missedTodayCount, todayDurations] = await Promise.all([
    db.call.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["startedAt", "durationSec"], { startedAt: "desc" }),
      skip: p.skip,
      take: p.take,
    }),
    db.call.count({ where }),
    db.call.count({ where: { tenantId: t, startedAt: { gte: todayStart } } }),
    db.call.count({ where: { tenantId: t, startedAt: { gte: todayStart }, status: "missed" } }),
    db.call.findMany({
      where: { tenantId: t, startedAt: { gte: todayStart }, durationSec: { not: null } },
      select: { durationSec: true },
    }),
  ]);

  const avgDurationSec = todayDurations.length
    ? Math.round(todayDurations.reduce((sum, c) => sum + (c.durationSec ?? 0), 0) / todayDurations.length)
    : null;

  // Batch-load matched record names for the current page — one query per
  // module instead of N+1 per row (same pattern as leads/page.tsx's tag load).
  const leadIds = [...new Set(calls.map((c) => c.leadId).filter((v): v is string => !!v))];
  const contactIds = [...new Set(calls.map((c) => c.contactId).filter((v): v is string => !!v))];
  const accountIds = [...new Set(calls.map((c) => c.accountId).filter((v): v is string => !!v))];

  const [leadRows, contactRows, accountRows] = await Promise.all([
    leadIds.length ? db.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } }) : [],
    contactIds.length ? db.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true } }) : [],
    accountIds.length ? db.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true } }) : [],
  ]);
  const leadById = new Map(leadRows.map((r) => [r.id, r.name]));
  const contactById = new Map(contactRows.map((r) => [r.id, r.name]));
  const accountById = new Map(accountRows.map((r) => [r.id, r.name]));

  // Priority per the D4 spec: lead, then contact, then account — whichever id
  // is actually set on the row.
  function matchedLink(c: (typeof calls)[number]) {
    if (c.leadId) return { href: `/leads/${c.leadId}`, label: leadById.get(c.leadId) ?? "Lead" };
    if (c.contactId) return { href: "/contacts", label: contactById.get(c.contactId) ?? "Contact" };
    if (c.accountId) return { href: `/accounts/${c.accountId}`, label: accountById.get(c.accountId) ?? "Account" };
    return null;
  }

  const callsLabel = moduleLabel(config, "calls", "plural");

  return (
    <div>
      <PageHeader title={callsLabel} subtitle="Click-to-call and inbound/outbound call log." />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Today's Calls" value={String(todayCount)} accent="brand" />
        <StatCard label="Missed Today" value={String(missedTodayCount)} accent="amber" />
        <StatCard label="Avg Duration (today)" value={mmss(avgDurationSec)} accent="blue" hint={todayDurations.length ? undefined : "No completed calls yet"} />
      </div>

      <CallsFilterBar statuses={STATUS_OPTIONS} directions={DIRECTION_OPTIONS} />

      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
        <span>Sort:</span>
        <SortLink field="startedAt" sort={p.sort} order={p.order} searchParams={searchParams}>
          Newest
        </SortLink>
        <SortLink field="durationSec" sort={p.sort} order={p.order} searchParams={searchParams}>
          Duration
        </SortLink>
      </div>

      {calls.length === 0 ? (
        <Empty>No {callsLabel.toLowerCase()} match your filters.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Direction</th>
                <th className="th">From</th>
                <th className="th">To</th>
                <th className="th">Matched</th>
                <th className="th">Status</th>
                <th className="th">
                  <SortLink field="durationSec" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Duration
                  </SortLink>
                </th>
                <th className="th">
                  <SortLink field="startedAt" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Started
                  </SortLink>
                </th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => {
                const dir = directionMeta(c.direction);
                const st = statusMeta(c.status);
                const link = matchedLink(c);
                return (
                  <tr key={c.id}>
                    <td className="td">
                      <Badge tone={dir.tone}>
                        {dir.icon} {dir.label}
                      </Badge>
                    </td>
                    <td className="td text-slate-600 font-mono text-xs">{c.fromNumber || "—"}</td>
                    <td className="td text-slate-600 font-mono text-xs">{c.toNumber || "—"}</td>
                    <td className="td">
                      {link ? (
                        <Link href={link.href} className="text-brand-700 hover:underline">
                          {link.label}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    <td className="td text-slate-600">{mmss(c.durationSec)}</td>
                    <td className="td text-slate-500">{dateTime(c.startedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination {...pageInfo(total, p.page)} />
    </div>
  );
}
