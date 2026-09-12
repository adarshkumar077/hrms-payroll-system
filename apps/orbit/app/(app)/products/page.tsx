import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, StatCard, Empty } from "@/components/ui";
import { CreateProductForm } from "./CreateProductForm";
import { FilterBar, Pagination } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, moduleLabel } from "@/lib/studio/config";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "products", "read"))) return <NoAccess label="Products" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);
  const p = parseListParams(searchParams);

  const where = {
    tenantId: t,
    ...(p.q
      ? {
          OR: [{ name: { contains: p.q } }, { sku: { contains: p.q } }, { hsn: { contains: p.q } }],
        }
      : {}),
  };

  const [products, total, avgPrice, fieldDefs] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["name", "createdAt", "unitPrice"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
    }),
    db.product.count({ where }),
    db.product.aggregate({ where: { tenantId: t }, _avg: { unitPrice: true } }),
    db.fieldDef.findMany({ where: { tenantId: t, module: "products", archived: false }, orderBy: { sortOrder: "asc" } }),
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

  const productsLabel = moduleLabel(config, "products", "plural");

  return (
    <div>
      <PageHeader
        title={productsLabel}
        subtitle="Your catalog — priced, taxed, ready to quote."
        action={<CreateProductForm customFields={customFieldSpecs} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Products" value={String(total)} accent="brand" />
        <StatCard label="Avg Price" value={inr(avgPrice._avg.unitPrice || 0)} accent="green" hint="Across catalog" />
      </div>

      <FilterBar placeholder="Search by name, SKU, or HSN…" />
      {total === 0 ? (
        <Empty>No {productsLabel.toLowerCase()} yet. Create your first one.</Empty>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">SKU</th>
                  <th className="th">HSN</th>
                  <th className="th text-right">Unit Price</th>
                  <th className="th text-right">Tax %</th>
                  <th className="th">Created</th>
                </tr>
              </thead>
              <tbody>
                {products.map((prod) => (
                  <tr key={prod.id}>
                    <td className="td font-medium text-slate-800">{prod.name}</td>
                    <td className="td font-mono text-xs text-slate-600">{prod.sku || "—"}</td>
                    <td className="td font-mono text-xs text-slate-600">{prod.hsn || "—"}</td>
                    <td className="td text-right text-slate-700">{inr(prod.unitPrice)}</td>
                    <td className="td text-right text-slate-600">{prod.taxRate}%</td>
                    <td className="td text-slate-500">{shortDate(prod.createdAt)}</td>
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
