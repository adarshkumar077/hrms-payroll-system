import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { ensureStudioDefaults } from "@/lib/studio/defaults";
import { PageHeader, Empty, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Orbit Studio — Picklists index. Lists every PicklistDef for the tenant;
 * each row links to its editor at /studio/picklists/[key].
 */
export default async function PicklistsPage() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Picklists" subtitle="Statuses, stages & sources — tenant-editable." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  await ensureStudioDefaults(s.tenantId);

  const picklists = await db.picklistDef.findMany({
    where: { tenantId: s.tenantId },
    include: { options: true },
    orderBy: { key: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Picklists"
        subtitle="Statuses, stages & sources — rename, reorder, add or archive options. Orbit's business logic keys on category, never on label, so renaming is always safe."
      />

      {picklists.length === 0 ? (
        <Empty>No picklists configured yet.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Key</th>
                <th className="th">Label</th>
                <th className="th">Options</th>
                <th className="th">Type</th>
              </tr>
            </thead>
            <tbody>
              {picklists.map((p) => {
                const active = p.options.filter((o) => !o.archived).length;
                const archived = p.options.length - active;
                return (
                  <tr key={p.id}>
                    <td className="td font-mono text-xs text-slate-500">{p.key}</td>
                    <td className="td">
                      <Link href={`/studio/picklists/${p.key}`} className="font-medium text-brand-700 hover:underline">
                        {p.label}
                      </Link>
                    </td>
                    <td className="td text-slate-600">
                      {active} option{active === 1 ? "" : "s"}
                      {archived > 0 && <span className="text-slate-400"> ({archived} archived)</span>}
                    </td>
                    <td className="td">
                      {p.system ? <Badge tone="brand">system</Badge> : <Badge tone="slate">custom</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
