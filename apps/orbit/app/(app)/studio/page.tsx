import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { getStudioConfig } from "@/lib/studio/config";
import { PageHeader, Empty, Badge } from "@/components/ui";
import { ModuleRow } from "./ModuleRow";

export const dynamic = "force-dynamic";

/**
 * Orbit Studio — tenant configuration home.
 * Modules: rename + enable/nav/search toggles (this page).
 * Picklists & Fields: per-section pages (linked below).
 */
export default async function StudioPage() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Studio" subtitle="Configure Orbit for your business." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  const config = await getStudioConfig(s.tenantId);
  const modules = await db.moduleConfig.findMany({
    where: { tenantId: s.tenantId },
    orderBy: [{ navGroup: "asc" }, { navOrder: "asc" }],
  });
  const picklists = await db.picklistDef.findMany({
    where: { tenantId: s.tenantId },
    include: { options: { where: { archived: false } } },
    orderBy: { key: "asc" },
  });
  const changes = await db.studioChangeLog.findMany({
    where: { tenantId: s.tenantId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div>
      <PageHeader
        title="Studio"
        subtitle="Rename modules, edit picklists, add custom fields — Orbit reshapes itself, no code."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Link href="/studio/picklists" className="card p-4 hover:ring-2 hover:ring-brand-100 transition">
          <div className="font-semibold text-slate-800">Picklists</div>
          <div className="text-xs text-slate-500 mt-1">
            Statuses, stages & sources — {picklists.length} lists, {picklists.reduce((a, p) => a + p.options.length, 0)} options
          </div>
        </Link>
        <Link href="/studio/fields" className="card p-4 hover:ring-2 hover:ring-brand-100 transition">
          <div className="font-semibold text-slate-800">Custom Fields</div>
          <div className="text-xs text-slate-500 mt-1">Add your industry&apos;s fields to leads, tickets & more</div>
        </Link>
        <Link href="/studio/rules" className="card p-4 hover:ring-2 hover:ring-brand-100 transition">
          <div className="font-semibold text-slate-800">Convert & Duplicate Rules</div>
          <div className="text-xs text-slate-500 mt-1">Lead → Account/Contact/Opportunity field mapping &amp; duplicate detection</div>
        </Link>
        <Link href="/studio/templates" className="card p-4 hover:ring-2 hover:ring-brand-100 transition">
          <div className="font-semibold text-slate-800">Industry Templates</div>
          <div className="text-xs text-slate-500 mt-1">Apply a pre-built pack for your industry — fields, picklists &amp; renames in one click</div>
        </Link>
        <Link href="/studio/layouts" className="card p-4 hover:ring-2 hover:ring-brand-100 transition">
          <div className="font-semibold text-slate-800">Layouts</div>
          <div className="text-xs text-slate-500 mt-1">Reorder fields and toggle visibility on record pages</div>
        </Link>
        <Link href="/studio/terms" className="card p-4 hover:ring-2 hover:ring-brand-100 transition">
          <div className="font-semibold text-slate-800">Quote Terms</div>
          <div className="text-xs text-slate-500 mt-1">Manage terms & conditions and payment terms templates</div>
        </Link>
        <Link href="/studio/sla" className="card p-4 hover:ring-2 hover:ring-brand-100 transition">
          <div className="font-semibold text-slate-800">SLA Hours</div>
          <div className="text-xs text-slate-500 mt-1">Set how many hours each ticket priority has to be resolved</div>
        </Link>
      </div>

      <div className="card overflow-x-auto mb-6">
        <div className="px-4 pt-4 pb-2 font-semibold text-slate-800">Modules</div>
        <p className="px-4 pb-3 text-xs text-slate-500 max-w-2xl">
          Rename what Orbit calls things (e.g. &quot;Opportunities&quot; → &quot;Orders&quot;) and choose what appears for
          your team. Labels apply across navigation instantly; page-by-page copy adopts them progressively.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">Module</th>
              <th className="th" colSpan={5}>Singular · Plural · Visibility</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <ModuleRow
                key={m.module}
                m={{
                  module: m.module,
                  labelSingular: m.labelSingular,
                  labelPlural: m.labelPlural,
                  enabled: m.enabled,
                  inNav: m.inNav,
                  inGlobalSearch: m.inGlobalSearch,
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-2">Recent configuration changes</div>
        {changes.length === 0 ? (
          <div className="text-xs text-slate-400">No changes yet — every Studio edit is recorded here.</div>
        ) : (
          <ul className="space-y-1.5">
            {changes.map((c) => (
              <li key={c.id} className="text-xs text-slate-600 flex items-center gap-2">
                <Badge tone={c.source === "ai" ? "amber" : "slate"}>{c.source}</Badge>
                <span className="font-mono">{c.object}</span>
                <span>{c.action}</span>
                <span className="text-slate-400">{new Date(c.createdAt).toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
