import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { NoAccess } from "@/components/NoAccess";
import { FilterBar, Pagination, SortLink } from "@/components/ListControls";
import { ScorecardTiles, type ScorecardTile } from "@/components/ScorecardTiles";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { getStudioConfig, options, optionTone } from "@/lib/studio/config";
import { CreateActivityForm } from "./CreateActivityForm";
import { ActivityRowActions } from "./ActivityRowActions";
import { parseRelatedTo } from "./relatedTo";
import { endOfToday, isOverdueActivity } from "./myDay";

export const dynamic = "force-dynamic";

// Preserves q/sort/order/status while toggling the ?done= tab — mirrors the
// tileHref pattern in app/(app)/leads/page.tsx, just keyed on "done" instead
// of "status" (this page uses "status" for the activity-type filter instead).
function doneTileHref(searchParams: Record<string, string | string[] | undefined>, done: string): string {
  const params = new URLSearchParams();
  for (const k of ["q", "sort", "order", "status"]) {
    const v = searchParams[k];
    const sVal = Array.isArray(v) ? v[0] : v;
    if (sVal) params.set(k, sVal);
  }
  params.set("done", done);
  return `?${params.toString()}`;
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const s = await requireSession();
  if (!(await can(s, "activities", "read"))) return <NoAccess label="Activities" />;
  const t = s.tenantId;

  const get = (k: string) => {
    const v = searchParams[k];
    return (Array.isArray(v) ? v[0] : v) || "";
  };

  const p = parseListParams(searchParams);
  const doneParam = get("done") || "open"; // "open" | "done" | "all"
  const relatedTo = parseRelatedTo(get("relatedTo"));

  const config = await getStudioConfig(t);
  const activityTypeOptions = options(config, "activity_type");

  const where = {
    tenantId: t,
    ...(p.q ? { subject: { contains: p.q } } : {}),
    ...(p.status ? { type: p.status } : {}),
    ...(doneParam === "open" ? { done: false } : doneParam === "done" ? { done: true } : {}),
  };

  const now = new Date();

  const [activities, total, openCount, doneCount, users, myDay] = await Promise.all([
    db.activity.findMany({
      where,
      include: { owner: true },
      orderBy: orderByFrom(p.sort, p.order, ["createdAt", "dueDate", "subject"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
    }),
    db.activity.count({ where }),
    db.activity.count({ where: { tenantId: t, done: false } }),
    db.activity.count({ where: { tenantId: t, done: true } }),
    db.user.findMany({ where: { tenantId: t }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.activity.findMany({
      where: { tenantId: t, done: false, ownerId: s.userId, dueDate: { lte: endOfToday(now) } },
      include: { owner: true },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const overdueCount = myDay.filter((a) => isOverdueActivity(a.dueDate, now)).length;

  const doneTiles: ScorecardTile[] = [
    { value: "all", label: "All", count: openCount + doneCount, tone: "brand", active: doneParam === "all", href: doneTileHref(searchParams, "all") },
    { value: "open", label: "Open", count: openCount, tone: "blue", active: doneParam === "open", href: doneTileHref(searchParams, "open") },
    { value: "done", label: "Done", count: doneCount, tone: "green", active: doneParam === "done", href: doneTileHref(searchParams, "done") },
  ];

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle="Tasks, calls, meetings and notes — yours and the team's."
        action={<CreateActivityForm typeOptions={activityTypeOptions} ownerOptions={users} currentUserId={s.userId} relatedTo={relatedTo} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="My Day" value={String(myDay.length)} accent="brand" hint="Due today or earlier, assigned to you" />
        <StatCard label="Overdue (mine)" value={String(overdueCount)} accent={overdueCount > 0 ? "red" : "slate"} hint="Past due, still open" />
        <StatCard label="Open (team)" value={String(openCount)} accent="blue" hint="Not yet done, all owners" />
      </div>

      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">My Day</h2>
        {myDay.length === 0 ? (
          <Empty>Nothing due today — you&apos;re all caught up.</Empty>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Subject</th>
                  <th className="th">Type</th>
                  <th className="th">Due</th>
                  <th className="th">Related to</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {myDay.map((a) => {
                  const overdue = isOverdueActivity(a.dueDate, now);
                  const rel = parseRelatedTo(a.relatedTo);
                  return (
                    <tr key={a.id}>
                      <td className="td font-medium text-slate-800">{a.subject}</td>
                      <td className="td">
                        <Badge tone={optionTone(config, "activity_type", a.type) || "slate"}>{a.type}</Badge>
                      </td>
                      <td className={`td ${overdue ? "text-rose-600 font-medium" : "text-slate-600"}`}>{shortDate(a.dueDate)}</td>
                      <td className="td">
                        {rel ? (
                          <Link href={rel.href} className="text-brand-700 hover:underline">
                            {rel.label}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="td">
                        <ActivityRowActions activityId={a.id} done={a.done} ownerId={a.ownerId} ownerOptions={users} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-2">All Activities</h2>

      <ScorecardTiles tiles={doneTiles} />

      <FilterBar statuses={activityTypeOptions.map((o) => o.value)} placeholder="Search subject…" />

      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
        <span>Sort:</span>
        <SortLink field="createdAt" sort={p.sort} order={p.order} searchParams={searchParams}>
          Newest
        </SortLink>
        <SortLink field="dueDate" sort={p.sort} order={p.order} searchParams={searchParams}>
          Due date
        </SortLink>
        <SortLink field="subject" sort={p.sort} order={p.order} searchParams={searchParams}>
          Subject
        </SortLink>
      </div>

      {activities.length === 0 ? (
        <Empty>No activities match your filters.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">
                  <SortLink field="subject" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Subject
                  </SortLink>
                </th>
                <th className="th">Type</th>
                <th className="th">
                  <SortLink field="dueDate" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Due
                  </SortLink>
                </th>
                <th className="th">Related to</th>
                <th className="th">Owner</th>
                <th className="th">Status</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => {
                const overdue = !a.done && isOverdueActivity(a.dueDate, now);
                const rel = parseRelatedTo(a.relatedTo);
                return (
                  <tr key={a.id}>
                    <td className="td font-medium text-slate-800">{a.subject}</td>
                    <td className="td">
                      <Badge tone={optionTone(config, "activity_type", a.type) || "slate"}>{a.type}</Badge>
                    </td>
                    <td className={`td ${overdue ? "text-rose-600 font-medium" : "text-slate-600"}`}>{shortDate(a.dueDate)}</td>
                    <td className="td">
                      {rel ? (
                        <Link href={rel.href} className="text-brand-700 hover:underline">
                          {rel.label}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td text-slate-600">{a.owner?.name || "—"}</td>
                    <td className="td">
                      <Badge tone={a.done ? "green" : "amber"}>{a.done ? "Done" : "Open"}</Badge>
                    </td>
                    <td className="td">
                      <ActivityRowActions activityId={a.id} done={a.done} ownerId={a.ownerId} ownerOptions={users} />
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
