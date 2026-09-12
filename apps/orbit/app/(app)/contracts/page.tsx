import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { FilterBar, Pagination, SortLink } from "@/components/ListControls";
import { ScorecardTiles, type ScorecardTile } from "@/components/ScorecardTiles";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { CreateContractForm } from "./CreateContractForm";
import { getStudioConfig, options, optionValues, valuesByCategory, optionTone, optionLabel, moduleLabel } from "@/lib/studio/config";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

// Builds a tile href that preserves q/sort/order (drops page, sets/clears
// status) — same param contract as FilterBar/SortLink, mirrors
// app/(app)/tickets/page.tsx's tileHref.
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
// palette (rose/emerald/violet/...). Same alias tickets/page.tsx uses so
// config-driven tones render the same classes here.
const BADGE_TONE_ALIAS: Record<string, string> = { rose: "red", emerald: "green" };
function badgeTone(tone: string | null, fallback = "slate"): string {
  if (!tone) return fallback;
  return BADGE_TONE_ALIAS[tone] ?? tone;
}

export default async function ContractsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "contracts", "read"))) return <NoAccess label="Contracts" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);

  const statusValues = optionValues(config, "contract_status");
  const activeStatusValues = valuesByCategory(config, "contract_status", "active");
  const typeOptions = options(config, "contract_type").map((o) => ({ value: o.value, label: o.label }));
  const statusOptions = options(config, "contract_status").map((o) => ({ value: o.value, label: o.label }));

  const p = parseListParams(searchParams);
  const where = {
    tenantId: t,
    ...(p.q ? { OR: [{ name: { contains: p.q } }, { number: { contains: p.q } }] } : {}),
    ...(p.status ? { status: p.status } : {}),
  };

  const [contractsRaw, total, statusGroups, accountOptions, fieldDefs, renewalCandidates] = await Promise.all([
    db.contract.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["createdAt", "endDate", "value"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
      include: { account: true },
    }),
    db.contract.count({ where }),
    db.contract.groupBy({ by: ["status"], where: { tenantId: t }, _count: true }),
    db.account.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.fieldDef.findMany({ where: { tenantId: t, module: "contracts", archived: false }, orderBy: { sortOrder: "asc" } }),
    // Renewal attention strip: everything still in an "active"-category status
    // (Active + ExpiringSoon by default) — the per-row threshold below can't
    // be expressed as a Prisma `where` (it compares two columns), so it's
    // filtered in memory. Demo-scale dataset; same unbounded-fetch tradeoff
    // tickets/page.tsx makes for its priority sort.
    db.contract.findMany({
      where: { tenantId: t, status: { in: activeStatusValues } },
      orderBy: { endDate: "asc" },
      select: { id: true, number: true, name: true, endDate: true, renewalNoticeDays: true },
    }),
  ]);

  // Custom-field defs (Studio) for the create form.
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

  const now = new Date();
  const attention = renewalCandidates.filter(
    (c) => new Date(c.endDate).getTime() - c.renewalNoticeDays * 86400000 <= now.getTime()
  );

  const statusCounts = new Map(statusGroups.map((g) => [g.status, g._count as number]));
  const contractsLabel = moduleLabel(config, "contracts", "plural");
  const activeStatus = p.status || null;
  const allContractsCount = statusGroups.reduce((sum, g) => sum + (g._count as number), 0);
  const tiles: ScorecardTile[] = [
    { value: null, label: "All", count: allContractsCount, tone: "brand", active: !activeStatus, href: tileHref(searchParams, null) },
    ...options(config, "contract_status").map((o) => ({
      value: o.value,
      label: optionLabel(config, "contract_status", o.value),
      count: statusCounts.get(o.value) ?? 0,
      tone: o.tone,
      active: activeStatus === o.value,
      href: tileHref(searchParams, o.value),
    })),
  ];

  return (
    <div>
      <PageHeader
        title={contractsLabel}
        subtitle="AMC / service contracts with renewal tracking."
        action={
          <CreateContractForm
            accountOptions={accountOptions}
            typeOptions={typeOptions}
            statusOptions={statusOptions}
            customFields={customFieldSpecs}
          />
        }
      />

      {attention.length > 0 && (
        <div className="card p-4 mb-4 border-l-4 border-l-amber-500">
          <div className="font-semibold text-slate-800 mb-2">
            {attention.length} contract{attention.length === 1 ? "" : "s"} need renewal attention
          </div>
          <ul className="space-y-1">
            {attention.slice(0, 5).map((c) => (
              <li key={c.id} className="text-sm flex items-center justify-between">
                <Link href={`/contracts/${c.id}`} className="text-brand-700 hover:underline font-medium">
                  {c.number} — {c.name}
                </Link>
                <span className="text-slate-500 text-xs">ends {shortDate(c.endDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScorecardTiles tiles={tiles} />

      <FilterBar statuses={statusValues} placeholder="Search name or number…" />

      <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
        <span>Sort:</span>
        <SortLink field="createdAt" sort={p.sort} order={p.order} searchParams={searchParams}>
          Newest
        </SortLink>
        <SortLink field="endDate" sort={p.sort} order={p.order} searchParams={searchParams}>
          End Date
        </SortLink>
        <SortLink field="value" sort={p.sort} order={p.order} searchParams={searchParams}>
          Value
        </SortLink>
      </div>

      {contractsRaw.length === 0 ? (
        <Empty>No {contractsLabel.toLowerCase()} match your filters.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Number</th>
                <th className="th">Name</th>
                <th className="th">Account</th>
                <th className="th">Type</th>
                <th className="th">Status</th>
                <th className="th">
                  <SortLink field="endDate" sort={p.sort} order={p.order} searchParams={searchParams}>
                    End Date
                  </SortLink>
                </th>
                <th className="th text-right">
                  <SortLink field="value" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Value
                  </SortLink>
                </th>
              </tr>
            </thead>
            <tbody>
              {contractsRaw.map((c) => {
                const overdue = activeStatusValues.includes(c.status) && new Date(c.endDate) < now;
                return (
                  <tr key={c.id}>
                    <td className="td font-medium text-slate-800">
                      <Link href={`/contracts/${c.id}`} className="hover:text-brand-700 hover:underline">
                        {c.number}
                      </Link>
                    </td>
                    <td className="td text-slate-600">{c.name}</td>
                    <td className="td text-slate-600">{c.account?.name || "—"}</td>
                    <td className="td">
                      <Badge tone={badgeTone(optionTone(config, "contract_type", c.type))}>
                        {optionLabel(config, "contract_type", c.type)}
                      </Badge>
                    </td>
                    <td className="td">
                      <Badge tone={badgeTone(optionTone(config, "contract_status", c.status))}>
                        {optionLabel(config, "contract_status", c.status)}
                      </Badge>
                    </td>
                    <td className={`td ${overdue ? "text-rose-600 font-semibold" : "text-slate-600"}`}>{shortDate(c.endDate)}</td>
                    <td className="td text-right text-slate-800">{inr(c.value)}</td>
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
