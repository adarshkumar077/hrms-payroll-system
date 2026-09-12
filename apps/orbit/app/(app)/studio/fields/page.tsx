import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { planLimits, getSubscription, planOf, PLANS } from "@/lib/billing";
import { PageHeader, Empty, Badge } from "@/components/ui";
import { SELECTABLE_MODULES, MAX_CUSTOM_FIELDS_PER_MODULE, type SelectableModule } from "./constants";
import { FieldForm } from "./FieldForm";
import { FieldRowActions } from "./FieldRowActions";

export const dynamic = "force-dynamic";

const TYPE_TONE: Record<string, string> = {
  text: "slate",
  longtext: "slate",
  number: "blue",
  currency: "blue",
  date: "amber",
  datetime: "amber",
  checkbox: "green",
  picklist: "brand",
  multipicklist: "brand",
  phone: "slate",
  email: "slate",
  url: "slate",
  lookup: "red",
};

function isSelectableModule(m: string): m is SelectableModule {
  return (SELECTABLE_MODULES as readonly string[]).includes(m);
}

export default async function StudioFieldsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Custom Fields" subtitle="Add your industry's fields to any module." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  const rawModule = String(searchParams.module || "leads");
  const module: SelectableModule = isSelectableModule(rawModule) ? rawModule : "leads";

  const [fields, picklists, sub, limits] = await Promise.all([
    db.fieldDef.findMany({ where: { tenantId: s.tenantId, module }, orderBy: { sortOrder: "asc" } }),
    db.picklistDef.findMany({ where: { tenantId: s.tenantId }, orderBy: { key: "asc" } }),
    getSubscription(s.tenantId),
    planLimits(s.tenantId),
  ]);

  const planName = PLANS[planOf(sub.plan)].name;
  // Plan cap, bounded by the absolute ceiling in ./constants.
  const planCap = Math.min(limits.customFieldsPerModule, MAX_CUSTOM_FIELDS_PER_MODULE);

  const picklistById = new Map(picklists.map((p) => [p.id, p]));
  const customCount = fields.filter((f) => !f.system).length;
  const atCap = customCount >= planCap;

  return (
    <div>
      <PageHeader
        title="Custom Fields"
        subtitle="Add your industry's fields to leads, tickets & more — no code, no deploy."
        action={
          <Link href="/studio" className="btn-ghost text-xs py-1.5">
            ← Studio
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        {SELECTABLE_MODULES.map((m) => (
          <Link
            key={m}
            href={`/studio/fields?module=${m}`}
            className={`btn-ghost text-xs py-1 ${m === module ? "!bg-brand-50 !text-brand-700 !border-brand-200" : ""}`}
          >
            {m}
          </Link>
        ))}
      </div>
      <p className="text-xs text-slate-400 mb-6">
        Finance and HR fields are code-owned in v1 and aren&apos;t configurable here yet.
      </p>

      <div className="card overflow-x-auto mb-6">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <div className="font-semibold text-slate-800">
            Fields on <span className="font-mono">{module}</span>
          </div>
          <div className="text-xs text-slate-500">
            {customCount} / {planCap} custom fields ({planName} plan)
          </div>
        </div>
        <p className="px-4 pb-3 text-xs text-slate-500 max-w-2xl">
          No built-in fields are listed here yet — name, email, phone, status and the other standard columns are
          still configured in code. This table holds only the custom fields you add below.
        </p>

        {fields.length === 0 ? (
          <div className="px-4 pb-4">
            <Empty>No custom fields on {module} yet — add one below.</Empty>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Label</th>
                <th className="th">Code</th>
                <th className="th">Type</th>
                <th className="th">Required</th>
                <th className="th">Picklist</th>
                <th className="th">State</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => {
                const picklist = f.picklistId ? picklistById.get(f.picklistId) : undefined;
                return (
                  <tr key={f.id} className={f.archived ? "opacity-50" : ""}>
                    <FieldRowActions
                      field={{
                        id: f.id,
                        label: f.label,
                        code: f.code,
                        type: f.type,
                        system: f.system,
                        required: f.required,
                        helpText: f.helpText,
                        archived: f.archived,
                      }}
                      typeBadge={<Badge tone={TYPE_TONE[f.type] || "slate"}>{f.type}</Badge>}
                      picklistCell={
                        picklist ? (
                          <Link href={`/studio/picklists/${picklist.key}`} className="text-brand-700 hover:underline font-mono text-xs">
                            {picklist.key}
                          </Link>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )
                      }
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <FieldForm
        module={module}
        picklists={picklists.map((p) => ({ id: p.id, key: p.key, label: p.label }))}
        atCap={atCap}
        planCap={planCap}
        planName={planName}
      />
    </div>
  );
}
