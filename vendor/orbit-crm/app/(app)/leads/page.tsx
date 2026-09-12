import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { FilterBar, Pagination, SortLink, ColumnFilterRow, ColumnChooser, PageSizeSelect, type ColumnFilterUIDef } from "@/components/ListControls";
import { SavedSearchBar } from "@/components/SavedSearchBar";
import { ScorecardTiles, type ScorecardTile } from "@/components/ScorecardTiles";
import {
  parseListParams,
  pageInfo,
  orderByFrom,
  parseColumnFilters,
  columnFilterParamKeys,
  parsePageSize,
  parseVisibleColumns,
  currentParamsToJson,
  type ColumnFilterDef,
} from "@/lib/list";
import { getStudioConfig, options, optionValues, valuesByCategory, optionTone, optionLabel, moduleLabel } from "@/lib/studio/config";
import { recordIdsWithTag, badgeToneForTagColor } from "@/lib/tags";
import { shortDate } from "@/lib/format";
import { LeadRowActions } from "./LeadRowActions";
import { ScoreAllButton } from "./ScoreAllButton";
import { CreateLeadForm } from "./CreateLeadForm";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

// LIST FRAMEWORK (E1): this page is the pattern to copy onto every other
// list page (a later Haiku sweep replicates it mechanically — keep every
// wiring point commented so it reads as a recipe, not just working code).
//
// 1. Toggle-able columns. `name` is pinned (always rendered, first — it's
//    the row's link into the detail page) so it's deliberately NOT in this
//    list; everything else the table can render is here.
const LEAD_ALL_COLUMNS: { key: string; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "score", label: "Score" },
  { key: "owner", label: "Owner" },
  { key: "followUpAt", label: "Follow-up" },
  { key: "createdAt", label: "Created" },
];
const LEAD_DEFAULT_COLUMNS = ["company", "source", "status", "score"];

// 2. Column filters — a per-page def list read against Prisma scalars only
//    (parseColumnFilters returns where-fragments the page ANDs in below).
//    Not every visible column needs a filter: `owner` is a relation
//    (Lead.owner → User.name), out of scope for the v1 text/select/date/number
//    kinds, so it's toggleable but not filterable here.
//    Note `status` is filterable both here (f_status, a column-header dropdown)
//    AND via the existing FilterBar/ScorecardTiles status facet (?status=) —
//    that's intentional: they compose (Prisma ANDs both), demonstrating the
//    new column filters coexist with a page's pre-existing filter UI rather
//    than replacing it.
const LEAD_COLUMN_FILTER_DEFS: ColumnFilterDef[] = [
  { field: "company", kind: "text" },
  { field: "source", kind: "select" },
  { field: "status", kind: "select" },
  { field: "score", kind: "number" },
  { field: "followUpAt", kind: "date" },
  { field: "createdAt", kind: "date" },
];

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

// href that drops ?tag= (and ?page=) while preserving every other param —
// used by the active tag-filter chip's "Clear" link.
function clearTagHref(searchParams: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "tag" || k === "page") continue;
    const s = Array.isArray(v) ? v[0] : v;
    if (s) params.set(k, s);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}

export const dynamic = "force-dynamic";

// Studio option `tone` keys (lib/studio/defaults.ts) → components/ui.tsx Badge
// tone props ("slate"|"green"|"red"|"amber"|"blue"|"brand"). Badge doesn't know
// "emerald"/"violet"/"rose" so every config tone needs a translation; these two
// maps are tuned so the DEFAULT config renders pixel-identical to the old
// hardcoded statusTone/sourceTone maps (see report note on the two source
// values that can't be reproduced exactly — the default config collapses all
// 3 marketplace sources to one tone, so they can't retain 3 distinct colors).
const STATUS_TONE_TO_BADGE: Record<string, string> = {
  blue: "slate", // New
  amber: "blue", // Contacted
  violet: "amber", // Qualified
  emerald: "green", // Converted
  slate: "red", // Dead
};

const SOURCE_TONE_TO_BADGE: Record<string, string> = {
  slate: "slate", // Manual
  blue: "green", // Website
  emerald: "green", // WhatsApp
  amber: "amber", // IndiaMART / JustDial / TradeIndia (all "marketplace", was brand/amber/blue)
};

export default async function LeadsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  const t = s.tenantId;
  const config = await getStudioConfig(t);

  const p = parseListParams(searchParams);
  const tagParam = searchParams["tag"];
  const activeTag = (Array.isArray(tagParam) ? tagParam[0] : tagParam) || "";
  const tagFilteredIds = activeTag ? await recordIdsWithTag(t, "leads", activeTag) : null;

  // LIST FRAMEWORK (E1): per-column filters (?f_company=, ?f_status=, ...)
  // ANDed in alongside the existing q/status/tag filters — composes with
  // them rather than replacing anything above.
  const columnFilters = parseColumnFilters(searchParams, LEAD_COLUMN_FILTER_DEFS);

  // LIST FRAMEWORK (E1): configurable page size (?per=) — overrides
  // parseListParams' fixed PAGE_SIZE-based skip/take; pageInfo() below takes
  // the resolved `per` as its 3rd arg so pagination math stays correct.
  const per = parsePageSize(searchParams);
  const skip = (p.page - 1) * per;

  const where = {
    tenantId: t,
    ...(p.q
      ? {
          OR: [
            { name: { contains: p.q } },
            { company: { contains: p.q } },
            { email: { contains: p.q } },
            { phone: { contains: p.q } },
          ],
        }
      : {}),
    ...(p.status ? { status: p.status } : {}),
    ...(tagFilteredIds ? { id: { in: tagFilteredIds } } : {}),
    ...(columnFilters.length ? { AND: columnFilters } : {}),
  };

  const [leads, total, openCount, convertedCount, sourceGroups, statusGroups, unscoredCount, fieldDefs] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["createdAt", "score", "name"], { createdAt: "desc" }),
      skip,
      take: per,
      include: { owner: { select: { name: true } } },
    }),
    db.lead.count({ where }),
    db.lead.count({
      where: { tenantId: t, status: { notIn: valuesByCategory(config, "lead_status", "converted", "dead") } },
    }),
    db.lead.count({ where: { tenantId: t, status: { in: valuesByCategory(config, "lead_status", "converted") } } }),
    db.lead.groupBy({ by: ["source"], where: { tenantId: t }, _count: true }),
    db.lead.groupBy({ by: ["status"], where: { tenantId: t }, _count: true }),
    db.lead.count({ where: { tenantId: t, score: null } }),
    db.fieldDef.findMany({ where: { tenantId: t, module: "leads", archived: false }, orderBy: { sortOrder: "asc" } }),
  ]);

  // Batch-load tags for the current page of rows (one query for links, one
  // for the tags themselves) rather than N+1 per-row getTagsFor() calls.
  const leadIds = leads.map((l) => l.id);
  const leadTagLinks = leadIds.length
    ? await db.tagLink.findMany({
        where: { tenantId: t, module: "leads", recordId: { in: leadIds } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const leadTagRows = leadTagLinks.length
    ? await db.tag.findMany({ where: { tenantId: t, id: { in: [...new Set(leadTagLinks.map((l) => l.tagId))] } } })
    : [];
  const leadTagById = new Map(leadTagRows.map((tg) => [tg.id, tg]));
  const tagsByLeadId = new Map<string, { name: string; color: string }[]>();
  for (const link of leadTagLinks) {
    const tag = leadTagById.get(link.tagId);
    if (!tag) continue;
    const arr = tagsByLeadId.get(link.recordId) ?? [];
    arr.push({ name: tag.name, color: tag.color });
    tagsByLeadId.set(link.recordId, arr);
  }

  const topSource = [...sourceGroups].sort((a, b) => b._count - a._count)[0];
  const statusOptions = options(config, "lead_status").map((o) => ({ value: o.value, label: o.label }));
  const sourceOptions = options(config, "lead_source").map((o) => ({ value: o.value, label: o.label }));

  // LIST FRAMEWORK (E1): resolve which of LEAD_ALL_COLUMNS are visible
  // (?cols=), build the ColumnFilterRow's UI-level defs (adds labels + the
  // Studio-config-driven option lists parseColumnFilters' pure defs can't
  // carry), and serialize the current list state for SavedSearchBar's
  // "Save view". The allow-list here is every param this page reads:
  // q/status/tag from parseListParams + tag, cols/per from this framework,
  // and every f_* key the column filter defs above can produce.
  const visibleColumns = parseVisibleColumns(
    searchParams,
    LEAD_ALL_COLUMNS.map((c) => c.key),
    LEAD_DEFAULT_COLUMNS
  );
  const allLeadColumnFilterUIDefs: ColumnFilterUIDef[] = [
    { field: "company", kind: "text", label: "Company" },
    { field: "source", kind: "select", label: "All sources", options: sourceOptions },
    { field: "status", kind: "select", label: "All statuses", options: statusOptions },
    { field: "score", kind: "number", label: "Score" },
    { field: "followUpAt", kind: "date", label: "Follow-up" },
    { field: "createdAt", kind: "date", label: "Created" },
  ];
  const leadColumnFilterUIDefs = allLeadColumnFilterUIDefs.filter((def) => visibleColumns.includes(def.field));
  const savedSearchAllowedKeys = ["q", "status", "tag", "sort", "order", "cols", "per", ...columnFilterParamKeys(LEAD_COLUMN_FILTER_DEFS)];
  const currentParamsJson = currentParamsToJson(searchParams, savedSearchAllowedKeys);

  const statusCounts = new Map(statusGroups.map((g) => [g.status, g._count as number]));
  const leadsLabel = moduleLabel(config, "leads", "plural");
  const activeStatus = p.status || null;
  const allLeadsCount = statusGroups.reduce((sum, g) => sum + (g._count as number), 0);
  const tiles: ScorecardTile[] = [
    { value: null, label: "All", count: allLeadsCount, tone: "brand", active: !activeStatus, href: tileHref(searchParams, null) },
    ...options(config, "lead_status").map((o) => ({
      value: o.value,
      label: optionLabel(config, "lead_status", o.value),
      count: statusCounts.get(o.value) ?? 0,
      tone: o.tone,
      active: activeStatus === o.value,
      href: tileHref(searchParams, o.value),
    })),
  ];

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

  return (
    <div>
      <PageHeader
        title={leadsLabel}
        subtitle="Inbound pipeline — score, qualify and convert."
        action={
          <div className="flex items-start gap-2">
            <ScoreAllButton count={unscoredCount} />
            <CreateLeadForm sourceOptions={sourceOptions} customFields={customFieldSpecs} />
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Open Leads" value={String(openCount)} accent="brand" hint="Not converted / dead" />
        <StatCard
          label="Top Source"
          value={topSource ? topSource.source : "—"}
          accent="amber"
          hint={topSource ? `${topSource._count} leads` : "No leads yet"}
        />
        <StatCard label="Converted" value={String(convertedCount)} accent="green" hint="Closed to customer" />
      </div>

      <ScorecardTiles tiles={tiles} />

      {/* LIST FRAMEWORK (E1): saved views — a single drop-in reading its own
          data (async server component); pass the module key + the current
          list state serialized via currentParamsToJson above. */}
      <SavedSearchBar module="leads" currentParamsJson={currentParamsJson} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilterBar statuses={optionValues(config, "lead_status")} placeholder="Search name, company, email, phone…" />
        {/* LIST FRAMEWORK (E1): column visibility + page size — both are
            plain client components driving ?cols=/?per= via router.replace. */}
        <div className="flex items-center gap-2 mb-3">
          <ColumnChooser allColumns={LEAD_ALL_COLUMNS} visibleColumns={visibleColumns} />
          <PageSizeSelect value={per} />
        </div>
      </div>

      {activeTag && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Badge tone="brand">Tag: {activeTag}</Badge>
          <Link href={clearTagHref(searchParams)} className="text-xs text-slate-500 hover:underline">
            Clear
          </Link>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
        <span>Sort:</span>
        <SortLink field="createdAt" sort={p.sort} order={p.order} searchParams={searchParams}>
          Newest
        </SortLink>
        <SortLink field="name" sort={p.sort} order={p.order} searchParams={searchParams}>
          Name
        </SortLink>
        <SortLink field="score" sort={p.sort} order={p.order} searchParams={searchParams}>
          Score
        </SortLink>
      </div>

      {leads.length === 0 ? (
        <Empty>No {leadsLabel.toLowerCase()} match your filters.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">
                  <SortLink field="name" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Name
                  </SortLink>
                </th>
                {/* LIST FRAMEWORK (E1): every other <th> is gated on
                    visibleColumns (parseVisibleColumns) — mirror this
                    `visibleColumns.includes("<key>") && <th>...` shape per
                    LEAD_ALL_COLUMNS entry when copying this page. */}
                {visibleColumns.includes("company") && <th className="th">Company</th>}
                {visibleColumns.includes("source") && <th className="th">Source</th>}
                {visibleColumns.includes("status") && <th className="th">Status</th>}
                {visibleColumns.includes("score") && (
                  <th className="th">
                    <SortLink field="score" sort={p.sort} order={p.order} searchParams={searchParams}>
                      Score
                    </SortLink>
                  </th>
                )}
                {visibleColumns.includes("owner") && <th className="th">Owner</th>}
                {visibleColumns.includes("followUpAt") && <th className="th">Follow-up</th>}
                {visibleColumns.includes("createdAt") && <th className="th">Created</th>}
                <th className="th text-right">Actions</th>
              </tr>
              {/* LIST FRAMEWORK (E1): second header row — one filter input per
                  visible+filterable column (leadColumnFilterUIDefs is already
                  intersected with visibleColumns above). The leading <th> for
                  the pinned Name column has no filter (search box covers it),
                  so it's an empty cell here to keep the grid aligned. */}
              <tr className="bg-slate-50/60">
                <th className="th !py-1.5" />
              </tr>
              <ColumnFilterRow defs={leadColumnFilterUIDefs} trailingColSpan={1} />
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id}>
                  <td className="td">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline">
                      {lead.name}
                    </Link>
                    {(() => {
                      const rowTags = tagsByLeadId.get(lead.id) ?? [];
                      if (rowTags.length === 0) return null;
                      return (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {rowTags.slice(0, 2).map((tg) => (
                            <Badge key={tg.name} tone={badgeToneForTagColor(tg.color)}>
                              {tg.name}
                            </Badge>
                          ))}
                          {rowTags.length > 2 && <Badge tone="slate">+{rowTags.length - 2}</Badge>}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="td text-slate-600">{lead.company || "—"}</td>
                  <td className="td">
                    <Badge tone={SOURCE_TONE_TO_BADGE[optionTone(config, "lead_source", lead.source) || ""] || "slate"}>
                      {lead.source}
                    </Badge>
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_TONE_TO_BADGE[optionTone(config, "lead_status", lead.status) || ""] || "slate"}>
                      {lead.status}
                    </Badge>
                  </td>
                  <td className="td">
                    {lead.score == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-semibold text-slate-800" title={lead.scoreReason || ""}>
                        {lead.score}
                      </span>
                    )}
                  </td>
                  <td className="td">
                    <LeadRowActions
                      leadId={lead.id}
                      status={lead.status}
                      statusOptions={statusOptions}
                      converted={!!lead.convertedAt}
                    />
                  </td>
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
