import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { shortDate } from "@/lib/format";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { FilterBar, Pagination, SortLink } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { CreateInstalledProductForm } from "./CreateInstalledProductForm";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export const dynamic = "force-dynamic";

const WARRANTY_WINDOW_DAYS = 60;

export default async function InstalledProductsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const s = await requireSession();
  if (!(await can(s, "installed", "read"))) return <NoAccess label="Installed Base" />;
  const t = s.tenantId;

  const p = parseListParams(searchParams);

  const where = {
    tenantId: t,
    ...(p.q ? { OR: [{ name: { contains: p.q } }, { serialNo: { contains: p.q } }] } : {}),
  };

  const now = new Date();
  const warrantyHorizon = new Date(now.getTime() + WARRANTY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const expiringWhere = { tenantId: t, warrantyUntil: { gte: now, lte: warrantyHorizon } };

  const [installedProducts, total, expiringSoon, expiringSoonCount, accounts, products, fieldDefs] = await Promise.all([
    db.installedProduct.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["name", "installedAt", "warrantyUntil", "createdAt"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
      include: {
        account: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
      },
    }),
    db.installedProduct.count({ where }),
    db.installedProduct.findMany({
      where: expiringWhere,
      orderBy: { warrantyUntil: "asc" },
      take: 5,
      select: { id: true, name: true, serialNo: true, warrantyUntil: true },
    }),
    db.installedProduct.count({ where: expiringWhere }),
    db.account.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.product.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.fieldDef.findMany({ where: { tenantId: t, module: "installed", archived: false }, orderBy: { sortOrder: "asc" } }),
  ]);

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
        title="Installed Base"
        subtitle="Serialized products deployed at each account, with warranty tracking."
        action={
          <CreateInstalledProductForm
            accountOptions={accounts}
            productOptions={products}
            customFields={customFieldSpecs}
          />
        }
      />

      <div className="card p-4 mb-6 border-l-4 border-l-amber-500">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800">Warranty expiring in ≤ {WARRANTY_WINDOW_DAYS} days</div>
          <span className="text-2xl font-bold text-slate-900">{expiringSoonCount}</span>
        </div>
        {expiringSoon.length === 0 ? (
          <div className="text-sm text-slate-400">Nothing expiring soon.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {expiringSoon.map((ip) => (
              <li key={ip.id} className="flex items-center justify-between gap-2">
                <Link href={`/installed/${ip.id}`} className="text-brand-700 hover:underline truncate">
                  {ip.name}
                  {ip.serialNo ? ` (${ip.serialNo})` : ""}
                </Link>
                <Badge tone="amber">{shortDate(ip.warrantyUntil)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <FilterBar placeholder="Search name, serial no…" />

      {installedProducts.length === 0 ? (
        <Empty>No installed products match your filters.</Empty>
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
                <th className="th">Serial No</th>
                <th className="th">Account</th>
                <th className="th">Product</th>
                <th className="th">
                  <SortLink field="installedAt" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Installed
                  </SortLink>
                </th>
                <th className="th">
                  <SortLink field="warrantyUntil" sort={p.sort} order={p.order} searchParams={searchParams}>
                    Warranty
                  </SortLink>
                </th>
                <th className="th">Location</th>
              </tr>
            </thead>
            <tbody>
              {installedProducts.map((ip) => {
                const expired = !!ip.warrantyUntil && new Date(ip.warrantyUntil) < now;
                return (
                  <tr key={ip.id}>
                    <td className="td">
                      <Link href={`/installed/${ip.id}`} className="font-medium text-brand-700 hover:underline">
                        {ip.name}
                      </Link>
                    </td>
                    <td className="td text-slate-600">{ip.serialNo || "—"}</td>
                    <td className="td">
                      {ip.account ? (
                        <Link href={`/accounts/${ip.account.id}`} className="text-brand-700 hover:underline">
                          {ip.account.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="td">
                      {ip.product ? (
                        // Products module has no per-record detail page yet — link to the list.
                        <Link href="/products" className="text-brand-700 hover:underline">
                          {ip.product.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td text-slate-600">{shortDate(ip.installedAt)}</td>
                    <td className="td">
                      {ip.warrantyUntil ? (
                        expired ? (
                          <span className="text-rose-600 font-medium">{shortDate(ip.warrantyUntil)} · expired</span>
                        ) : (
                          <span className="text-slate-600">{shortDate(ip.warrantyUntil)}</span>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="td text-slate-600">{ip.location || "—"}</td>
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
