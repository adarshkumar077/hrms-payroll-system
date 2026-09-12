import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader, Empty } from "@/components/ui";
import { LAYOUT_MODULES, MODULE_SYSTEM_FIELDS, getRecordLayout, isLayoutModule, type LayoutModule } from "@/lib/studio/layouts";
import { LayoutEditor, type LayoutRow } from "./LayoutEditor";

export const dynamic = "force-dynamic";

// Record pages that currently read the saved layout (WS9 v1: leads only).
// Other modules stay editable here ahead of their record pages adopting it.
const WIRED_MODULES: readonly LayoutModule[] = ["leads"];

/**
 * Orbit Studio — Layouts (WS9 v1). Tenant-controlled field order/visibility
 * for a module's record-page details panel. Persisted via LayoutDef
 * (lib/studio/layouts.ts); only the Lead record page applies it so far.
 */
export default async function StudioLayoutsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Layouts" subtitle="Field order & visibility for record pages." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  const rawModule = String(searchParams.module || "leads");
  const module: LayoutModule = isLayoutModule(rawModule) ? rawModule : "leads";

  const [spec, customDefs] = await Promise.all([
    getRecordLayout(s.tenantId, module),
    db.fieldDef.findMany({
      where: { tenantId: s.tenantId, module, archived: false, system: false },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const available = [...MODULE_SYSTEM_FIELDS[module], ...customDefs.map((d) => ({ code: d.code, label: d.label }))];

  // Build the editor's row list: spec order first (hidden ones flagged, not
  // removed — the editor needs to show them so they can be un-hidden), then
  // any available field not yet in the spec. Mirrors orderFields() but keeps
  // hidden rows visible-in-the-editor instead of dropping them.
  const byCode = new Map(available.map((f) => [f.code, f]));
  const seen = new Set<string>();
  const editorRows: LayoutRow[] = [];
  for (const entry of spec.fields) {
    if (seen.has(entry.code)) continue;
    seen.add(entry.code);
    const field = byCode.get(entry.code);
    if (!field) continue;
    editorRows.push({ code: field.code, label: field.label, hidden: !!entry.hidden });
  }
  for (const field of available) {
    if (!seen.has(field.code)) editorRows.push({ code: field.code, label: field.label, hidden: false });
  }

  return (
    <div>
      <PageHeader
        title="Layouts"
        subtitle="Reorder fields and toggle visibility on a record page's details panel — no code."
        action={
          <Link href="/studio" className="btn-ghost text-xs py-1.5">
            ← Studio
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-2">
        {LAYOUT_MODULES.map((m) => (
          <Link
            key={m}
            href={`/studio/layouts?module=${m}`}
            className={`btn-ghost text-xs py-1 ${m === module ? "!bg-brand-50 !text-brand-700 !border-brand-200" : ""}`}
          >
            {m}
          </Link>
        ))}
      </div>
      <p className="text-xs text-slate-400 mb-6">
        {WIRED_MODULES.includes(module)
          ? "Applied live to the Lead record page's details panel."
          : `Applies once ${module}'s record page adopts layouts — editable now so it's ready.`}
      </p>

      <LayoutEditor key={JSON.stringify(editorRows)} module={module} initialRows={editorRows} />
    </div>
  );
}
