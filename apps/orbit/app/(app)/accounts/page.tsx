import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Empty, Badge } from "@/components/ui";
import { CreateAccountForm } from "./CreateAccountForm";
import { FilterBar, Pagination } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, moduleLabel } from "@/lib/studio/config";
import { recordIdsWithTag, badgeToneForTagColor } from "@/lib/tags";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

// href that drops ?tag= (and ?page=) while preserving every other param —
// used by the active tag-filter chip's "Clear" link. Mirrors leads/page.tsx.
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

export default async function AccountsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "accounts", "read"))) return <NoAccess label="Accounts" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);
  const p = parseListParams(searchParams);
  const tagParam = searchParams["tag"];
  const activeTag = (Array.isArray(tagParam) ? tagParam[0] : tagParam) || "";
  const tagFilteredIds = activeTag ? await recordIdsWithTag(t, "accounts", activeTag) : null;

  const where = {
    tenantId: t,
    ...(p.q ? { OR: [{ name: { contains: p.q } }, { gstin: { contains: p.q } }, { city: { contains: p.q } }] } : {}),
    ...(tagFilteredIds ? { id: { in: tagFilteredIds } } : {}),
  };

  const [accounts, total, allAccounts, withGstin, fieldDefs] = await Promise.all([
    db.account.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["name", "createdAt"], { name: "asc" }),
      skip: p.skip,
      take: p.take,
      include: { _count: { select: { contacts: true } } },
    }),
    db.account.count({ where }),
    db.account.findMany({
      where: { tenantId: t },
      select: { city: true },
    }),
    db.account.count({ where: { tenantId: t, gstin: { not: null } } }),
    db.fieldDef.findMany({ where: { tenantId: t, module: "accounts", archived: false }, orderBy: { sortOrder: "asc" } }),
  ]);

  const cities = new Set(allAccounts.map((a) => a.city).filter(Boolean)).size;

  // Batch-load tags for the current page of rows — one query for links, one
  // for the tags themselves, rather than N+1 per-row getTagsFor() calls.
  const accountIds = accounts.map((a) => a.id);
  const accountTagLinks = accountIds.length
    ? await db.tagLink.findMany({
        where: { tenantId: t, module: "accounts", recordId: { in: accountIds } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const accountTagRows = accountTagLinks.length
    ? await db.tag.findMany({ where: { tenantId: t, id: { in: [...new Set(accountTagLinks.map((l) => l.tagId))] } } })
    : [];
  const accountTagById = new Map(accountTagRows.map((tg) => [tg.id, tg]));
  const tagsByAccountId = new Map<string, { name: string; color: string }[]>();
  for (const link of accountTagLinks) {
    const tag = accountTagById.get(link.tagId);
    if (!tag) continue;
    const arr = tagsByAccountId.get(link.recordId) ?? [];
    arr.push({ name: tag.name, color: tag.color });
    tagsByAccountId.set(link.recordId, arr);
  }

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
        title={moduleLabel(config, "accounts", "plural")}
        subtitle="Your customer companies."
        action={<CreateAccountForm customFields={customFieldSpecs} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Accounts" value={String(total)} accent="brand" />
        <StatCard label="GST Registered" value={String(withGstin)} accent="green" hint="Have GSTIN on file" />
        <StatCard label="Cities" value={String(cities)} accent="amber" hint="Geographic spread" />
      </div>

      <FilterBar placeholder="Search by name, GSTIN, or city…" />

      {activeTag && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <Badge tone="brand">Tag: {activeTag}</Badge>
          <Link href={clearTagHref(searchParams)} className="text-xs text-slate-500 hover:underline">
            Clear
          </Link>
        </div>
      )}

      {total === 0 ? (
        <Empty>No accounts yet. Create your first one.</Empty>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Industry</th>
                  <th className="th">Location</th>
                  <th className="th">GSTIN</th>
                  <th className="th text-right">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="td font-medium text-slate-800">
                      <Link href={`/accounts/${a.id}`} className="hover:text-brand-700 hover:underline">
                        {a.name}
                      </Link>
                      {(() => {
                        const rowTags = tagsByAccountId.get(a.id) ?? [];
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
                    <td className="td text-slate-600">{a.industry || "—"}</td>
                    <td className="td text-slate-600">
                      {[a.city, a.state].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="td font-mono text-xs text-slate-600">{a.gstin || "—"}</td>
                    <td className="td text-right">{a._count.contacts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pageInfo(total, p.page)} />
        </>
      )}
    </div>
  );
}
