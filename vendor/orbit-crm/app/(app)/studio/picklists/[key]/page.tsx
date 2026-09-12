import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader, Empty, Badge } from "@/components/ui";
import { AddOptionForm, OptionRow } from "./OptionEditor";

export const dynamic = "force-dynamic";

/**
 * Orbit Studio — single picklist editor. Reorder/rename/re-tone options,
 * pick the default, archive or restore, and add new ones (system lists get
 * category-less additions since category anchors business logic).
 */
export default async function PicklistEditorPage({ params }: { params: { key: string } }) {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Picklist" subtitle="Configure options." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  const def = await db.picklistDef.findUnique({
    where: { tenantId_key: { tenantId: s.tenantId, key: params.key } },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });

  if (!def) {
    return (
      <div>
        <PageHeader
          title="Picklist not found"
          action={
            <Link href="/studio/picklists" className="btn-ghost text-sm">
              Back to Picklists
            </Link>
          }
        />
        <Empty>No picklist with key &quot;{params.key}&quot; exists for this tenant.</Empty>
      </div>
    );
  }

  const active = def.options.filter((o) => !o.archived);
  const archived = def.options.filter((o) => o.archived);

  return (
    <div>
      <PageHeader
        title={def.label}
        subtitle={`${def.system ? "System" : "Custom"} picklist — key: ${def.key}`}
        action={
          <Link href="/studio/picklists" className="btn-ghost text-sm">
            Back to Picklists
          </Link>
        }
      />

      <div className="card overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">Order</th>
              <th className="th">Value</th>
              <th className="th">Label</th>
              <th className="th">Tone</th>
              <th className="th">Category</th>
              <th className="th">Default</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {active.length === 0 ? (
              <tr>
                <td className="td text-slate-400" colSpan={7}>
                  No active options — add one below.
                </td>
              </tr>
            ) : (
              active.map((o, i) => (
                <OptionRow
                  key={o.id}
                  option={o}
                  canMoveUp={i > 0}
                  canMoveDown={i < active.length - 1}
                  canArchive={!o.isDefault && !(def.system && active.length <= 1)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-4 mb-4">
        <div className="font-semibold text-slate-800 mb-3 text-sm">Add option</div>
        <AddOptionForm pklKey={def.key} isSystem={def.system} />
      </div>

      {archived.length > 0 && (
        <div className="card overflow-x-auto opacity-80">
          <div className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Archived ({archived.length})
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Value</th>
                <th className="th">Label</th>
                <th className="th">Tone</th>
                <th className="th">Category</th>
                <th className="th">Actions</th>
              </tr>
            </thead>
            <tbody>
              {archived.map((o) => (
                <OptionRow key={o.id} option={o} archivedView />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
