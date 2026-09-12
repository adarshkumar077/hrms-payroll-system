import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { PageHeader } from "@/components/ui";
import { getStudioConfig, moduleLabel } from "@/lib/studio/config";
import { QuoteBuilderForm } from "./QuoteBuilderForm";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export const dynamic = "force-dynamic";

export default async function NewQuotationPage() {
  const s = await requireSession();
  if (!(await can(s, "quotations", "write"))) return <NoAccess label="New Quotation" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);

  const [accounts, contacts, products, terms, fieldDefs] = await Promise.all([
    db.account.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.contact.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, select: { id: true, name: true, accountId: true } }),
    db.product.findMany({
      where: { tenantId: t },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unitPrice: true, taxRate: true },
    }),
    db.quoteTerms.findMany({ where: { tenantId: t }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.fieldDef.findMany({ where: { tenantId: t, module: "quotations", archived: false }, orderBy: { sortOrder: "asc" } }),
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

  const termsTemplates = terms.filter((t2) => t2.kind === "terms").map((t2) => ({ id: t2.id, name: t2.name, body: t2.body, isDefault: t2.isDefault }));
  const paymentTemplates = terms.filter((t2) => t2.kind === "payment").map((t2) => ({ id: t2.id, name: t2.name, body: t2.body, isDefault: t2.isDefault }));

  return (
    <div>
      <PageHeader
        title={`New ${moduleLabel(config, "quotations", "singular")}`}
        subtitle="Build a quotation from the product master with live totals."
        action={
          <Link href="/quotations" className="btn-ghost">
            ← Back to {moduleLabel(config, "quotations", "plural").toLowerCase()}
          </Link>
        }
      />

      <QuoteBuilderForm
        accounts={accounts}
        contacts={contacts}
        products={products}
        termsTemplates={termsTemplates}
        paymentTemplates={paymentTemplates}
        customFields={customFieldSpecs}
      />
    </div>
  );
}
