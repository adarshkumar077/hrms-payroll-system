import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { PageHeader, StatCard, Empty } from "@/components/ui";
import { CreateContactForm } from "./CreateContactForm";
import { FilterBar, Pagination } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, moduleLabel } from "@/lib/studio/config";
import { CallButton } from "@/components/CallButton";
import { telephonyConfigured } from "@/lib/telephony";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "contacts", "read"))) return <NoAccess label="Contacts" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);
  const p = parseListParams(searchParams);

  const where = {
    tenantId: t,
    ...(p.q
      ? {
          OR: [{ name: { contains: p.q } }, { email: { contains: p.q } }, { phone: { contains: p.q } }],
        }
      : {}),
  };

  const [contacts, total, withAccount, accountOptions, fieldDefs] = await Promise.all([
    db.contact.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["name", "createdAt"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
      include: { account: { select: { id: true, name: true } } },
    }),
    db.contact.count({ where }),
    db.contact.count({ where: { tenantId: t, accountId: { not: null } } }),
    db.account.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.fieldDef.findMany({ where: { tenantId: t, module: "contacts", archived: false }, orderBy: { sortOrder: "asc" } }),
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

  const contactsLabel = moduleLabel(config, "contacts", "plural");

  return (
    <div>
      <PageHeader
        title={contactsLabel}
        subtitle="People at your accounts."
        action={<CreateContactForm accountOptions={accountOptions} customFields={customFieldSpecs} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Contacts" value={String(total)} accent="brand" />
        <StatCard label="With Account" value={String(withAccount)} accent="green" hint="Linked to a company" />
      </div>

      <FilterBar placeholder="Search by name, email, or phone…" />
      {total === 0 ? (
        <Empty>No {contactsLabel.toLowerCase()} yet. Create your first one.</Empty>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Account</th>
                  <th className="th">Email</th>
                  <th className="th">Phone</th>
                  <th className="th">Title</th>
                  <th className="th">Created</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="td font-medium text-slate-800">{c.name}</td>
                    <td className="td text-slate-600">
                      {c.account ? (
                        <Link href={`/accounts/${c.account.id}`} className="hover:text-brand-700 hover:underline">
                          {c.account.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="td text-slate-600">{c.email || "—"}</td>
                    <td className="td text-slate-600">
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1.5">
                          {c.phone}
                          <CallButton phone={c.phone} live={telephonyConfigured} />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="td text-slate-600">{c.title || "—"}</td>
                    <td className="td text-slate-500">{shortDate(c.createdAt)}</td>
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
