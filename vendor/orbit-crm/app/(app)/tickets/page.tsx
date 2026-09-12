import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { FilterBar, Pagination, SortLink } from "@/components/ListControls";
import { ScorecardTiles, type ScorecardTile } from "@/components/ScorecardTiles";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { TicketStatusSelect } from "./TicketStatusSelect";
import { CreateTicketForm } from "./CreateTicketForm";
import { getStudioConfig, options, optionValues, valuesByCategory, optionTone, optionLabel, moduleLabel, defaultValue } from "@/lib/studio/config";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

// Builds a tile href that preserves q/sort/order (drops page, sets/clears
// status) — same param contract as FilterBar/SortLink so tiles and the
// existing filter controls drive the same ?status= param.
function tileHref(searchParams: Record<string, string | string[] | undefined>, status: string | null): string {
  const params = new URLSearchParams();
  for (const k of ["q", "sort", "order"]) {
    const v = searchParams[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (s) params.set(k, s);
  }
  if (status) params.set("status", status);
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export const dynamic = "force-dynamic";

// components/ui.tsx's Badge only understands a fixed tone vocabulary
// (slate/blue/amber/red/green/brand); Studio config tones use a broader
// palette (rose/emerald/violet/...). Translate the synonyms the tickets
// picklists actually use so config-driven tones render the same classes.
const BADGE_TONE_ALIAS: Record<string, string> = { rose: "red", emerald: "green" };
function badgeTone(tone: string | null, fallback = "slate"): string {
  if (!tone) return fallback;
  return BADGE_TONE_ALIAS[tone] ?? tone;
}

// Status badge tone is intentionally NOT derived from the config's `tone`
// field: the default ticket_status config (rose/amber/emerald/slate for
// Open/InProgress/Resolved/Closed) does not reproduce today's rendered
// colors (amber/blue/green/slate) for Open and InProgress. Deriving it
// via optionTone would violate zero-visual-change, so this stays a local
// map for now — see the migration report for detail. Priority tones DO
// match the config 1:1 (via the alias above), so those are config-driven.
const statusTone: Record<string, string> = {
  Open: "amber",
  InProgress: "blue",
  Resolved: "green",
  Closed: "slate",
};

export default async function TicketsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "tickets", "read"))) return <NoAccess label="Tickets" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);

  const statusValues = optionValues(config, "ticket_status");
  const statusOptions = statusValues.map((v) => ({ value: v, label: v }));
  const openStatusValues = valuesByCategory(config, "ticket_status", "open");

  // `priority` is a free-text column (Low/Medium/High/Urgent), so a plain SQL
  // orderBy sorts it alphabetically (High, Low, Medium, Urgent) — not by
  // severity. Rank is derived from the ticket_priority picklist's sortOrder
  // (config-driven replacement for the old hardcoded PRIORITY_RANK map,
  // GAPS #14b) and drives an in-memory sort instead.
  const priorityRank = new Map(options(config, "ticket_priority").map((o) => [o.value, o.sortOrder]));

  const p = parseListParams(searchParams);
  const where = {
    tenantId: t,
    ...(p.q ? { subject: { contains: p.q } } : {}),
    ...(p.status ? { status: p.status } : {}),
  };

  const sortingByPriority = p.sort === "priority";

  const [
    ticketsRaw,
    total,
    openCount,
    urgentCount,
    breachedCount,
    statusGroups,
    accountOptions,
    fieldDefs,
    contracts,
    installedProducts,
  ] = await Promise.all([
      // `priority` is free text, not a severity-ordered enum, so a DB orderBy
      // sorts it alphabetically. When sorting by priority, fetch every matching
      // row (no skip/take) and rank-sort + paginate in memory instead; every
      // other sort keeps the DB-level orderBy + skip/take as before.
      db.ticket.findMany({
        where,
        orderBy: sortingByPriority
          ? undefined
          : orderByFrom(p.sort, p.order, ["createdAt", "priority", "slaDueAt"], { createdAt: "desc" }),
        skip: sortingByPriority ? undefined : p.skip,
        take: sortingByPriority ? undefined : p.take,
        include: { account: true },
      }),
      db.ticket.count({ where }),
      db.ticket.count({ where: { tenantId: t, status: { in: openStatusValues } } }),
      db.ticket.count({ where: { tenantId: t, priority: "Urgent", status: { in: openStatusValues } } }),
      db.ticket.count({
        where: { tenantId: t, status: { in: openStatusValues }, slaDueAt: { lt: new Date() } },
      }),
      db.ticket.groupBy({ by: ["status"], where: { tenantId: t }, _count: true }),
      db.account.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      db.fieldDef.findMany({ where: { tenantId: t, module: "tickets", archived: false }, orderBy: { sortOrder: "asc" } }),
      db.contract.findMany({ where: { tenantId: t }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
      db.installedProduct.findMany({
        where: { tenantId: t },
        orderBy: { name: "asc" },
        select: { id: true, name: true, serialNo: true, accountId: true },
      }),
    ]);

  // Custom-field defs (Studio) for the create form — picklist-typed defs need
  // their tenant-configured options resolved from PicklistDef/PicklistOption.
  const picklistIds = fieldDefs.filter((d) => d.picklistId).map((d) => d.picklistId as string);
  const picklistOptionRows = picklistIds.length
    ? await db.picklistOption.findMany({
        where: { picklistDefId: { in: picklistIds }, archived: false },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const customFieldSpecs: CustomFieldSpec[] = fieldDefs.map((d) => ({
    code: d.code,
    label: d.label,
    type: d.type,
    required: d.required,
    helpText: d.helpText,
    picklistOptions: d.picklistId
      ? picklistOptionRows.filter((o) => o.picklistDefId === d.picklistId).map((o) => ({ value: o.value, label: o.label }))
      : undefined,
  }));
  const priorityOptions = options(config, "ticket_priority").map((o) => ({ value: o.value, label: o.label }));
  const typeOptions = options(config, "ticket_type").map((o) => ({ value: o.value, label: o.label }));
  const defaultTypeKey = defaultValue(config, "ticket_type");

  const statusCounts = new Map(statusGroups.map((g) => [g.status, g._count as number]));
  const ticketsLabel = moduleLabel(config, "tickets", "plural");
  const activeStatus = p.status || null;
  const allTicketsCount = statusGroups.reduce((sum, g) => sum + (g._count as number), 0);
  const tiles: ScorecardTile[] = [
    { value: null, label: "All", count: allTicketsCount, tone: "brand", active: !activeStatus, href: tileHref(searchParams, null) },
    ...options(config, "ticket_status").map((o) => ({
      value: o.value,
      label: optionLabel(config, "ticket_status", o.value),
      count: statusCounts.get(o.value) ?? 0,
      tone: o.tone,
      active: activeStatus === o.value,
      href: tileHref(searchParams, o.value),
    })),
  ];

  const tickets = sortingByPriority
    ? [...ticketsRaw]
        .sort((a, b) => {
          const diff = (priorityRank.get(a.priority) ?? -1) - (priorityRank.get(b.priority) ?? -1);
          return p.order === "asc" ? diff : -diff;
        })
        .slice(p.skip, p.skip + p.take)
    : ticketsRaw;

  const now = new Date();

  return (
    <div>
      <PageHeader
        title={ticketsLabel}
        subtitle="Support queue with SLA tracking."
        action={
          <CreateTicketForm
            accountOptions={accountOptions}
            priorityOptions={priorityOptions}
            typeOptions={typeOptions}
            defaultTypeKey={defaultTypeKey}
            contractOptions={contracts}
            installedProductOptions={installedProducts}
            customFields={customFieldSpecs}
          />
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Open Tickets" value={String(openCount)} accent="brand" hint="Open + In Progress" />
        <StatCard label="Urgent" value={String(urgentCount)} accent="amber" hint="High-priority open" />
        <StatCard label="SLA Breached" value={String(breachedCount)} accent="red" hint="Past due date" />
      </div>

      <ScorecardTiles tiles={tiles} />

      <FilterBar statuses={statusValues} placeholder="Search subject…" />

      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
        <span>Sort:</span>
        <SortLink field="createdAt" sort={p.sort} order={p.order} searchParams={searchParams}>
          Newest
        </SortLink>
        <SortLink field="priority" sort={p.sort} order={p.order} searchParams={searchParams}>
          Priority
        </SortLink>
        <SortLink field="slaDueAt" sort={p.sort} order={p.order} searchParams={searchParams}>
          SLA Due
        </SortLink>
      </div>

      {tickets.length === 0 ? (
        <Empty>No {ticketsLabel.toLowerCase()} match your filters.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Subject</th>
                <th className="th">Type</th>
                <th className="th">Account</th>
                <th className="th">
                  <SortLink field="priority" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Priority
                  </SortLink>
                </th>
                <th className="th">Status</th>
                <th className="th">
                  <SortLink field="slaDueAt" sort={p.sort} order={p.order} searchParams={searchParams}>
                    SLA Due
                  </SortLink>
                </th>
                <th className="th text-right">Change Status</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((tk) => {
                const breached =
                  openStatusValues.includes(tk.status) && tk.slaDueAt && new Date(tk.slaDueAt) < now;
                return (
                  <tr key={tk.id}>
                    <td className="td font-medium text-slate-800">
                      <Link href={`/tickets/${tk.id}`} className="hover:text-brand-700 hover:underline">
                        {tk.subject}
                      </Link>
                    </td>
                    <td className="td">
                      {tk.typeKey ? (
                        <Badge tone={badgeTone(optionTone(config, "ticket_type", tk.typeKey))}>
                          {optionLabel(config, "ticket_type", tk.typeKey)}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td text-slate-600">{tk.account?.name || "—"}</td>
                    <td className="td">
                      <Badge tone={badgeTone(optionTone(config, "ticket_priority", tk.priority))}>{tk.priority}</Badge>
                    </td>
                    <td className="td">
                      <Badge tone={statusTone[tk.status] || "slate"}>{tk.status}</Badge>
                    </td>
                    <td className={`td ${breached ? "text-rose-600 font-semibold" : "text-slate-600"}`}>
                      {shortDate(tk.slaDueAt)}
                    </td>
                    <td className="td">
                      <div className="flex justify-end">
                        <TicketStatusSelect ticketId={tk.id} status={tk.status} statusOptions={statusOptions} />
                      </div>
                    </td>
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
