import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listPacks } from "@/lib/studio/packs";
import { PageHeader, Empty } from "@/components/ui";
import { PackCard, ExportPanel } from "./PackCard";

export const dynamic = "force-dynamic";

/**
 * Orbit Studio — Industry Templates (WS8).
 * Pick a pre-built pack (fields/picklists/renames) for your industry, preview
 * the diff against the tenant's current config, and apply — additive only,
 * nothing already configured is overwritten. Pack definitions and all
 * preview/apply/export logic live in lib/studio/packs.ts; this page is a
 * thin RSC shell around listPacks() plus PackCard client islands.
 */
export default async function StudioTemplatesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Industry Templates" subtitle="Apply a ready-made configuration pack for your industry." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  const packs = listPacks();
  const showWelcome = searchParams.welcome === "1";

  return (
    <div>
      {showWelcome && (
        <div className="card p-4 mb-6 border-l-4 border-l-emerald-500 bg-emerald-50">
          <div className="font-semibold text-emerald-800">Welcome to Orbit</div>
          <p className="mt-1 text-sm text-emerald-700">
            Fit it to your business in one click, or{" "}
            <Link href="/dashboard" className="font-medium hover:underline">
              skip to your dashboard
            </Link>
            .
          </p>
        </div>
      )}

      <PageHeader
        title="Industry Templates"
        subtitle="Fit Orbit to your industry in one click — additive only, your existing config is never overwritten."
        action={
          <Link href="/studio" className="btn-ghost text-xs py-1.5">
            ← Studio
          </Link>
        }
      />

      <Link
        href="/studio/templates/interview"
        className="card p-4 mb-6 flex items-center justify-between hover:ring-2 hover:ring-brand-100 transition"
      >
        <div>
          <div className="font-semibold text-slate-800">✨ Describe your business instead</div>
          <div className="text-xs text-slate-500 mt-1">
            Not sure which pack fits? Tell Orbit about your business in plain language and get a tailored configuration.
          </div>
        </div>
        <span className="text-slate-400 text-sm">→</span>
      </Link>

      {packs.length === 0 ? (
        <Empty>No template packs are available yet.</Empty>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {packs.map((p) => (
            <PackCard key={p.key} pack={p} />
          ))}
        </div>
      )}

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-1">Export my configuration</div>
        <p className="text-xs text-slate-500 mb-3 max-w-2xl">
          Grab your current modules, picklists &amp; fields as a portable pack — handy for backing up your setup or
          sharing it with another Orbit tenant.
        </p>
        <ExportPanel />
      </div>
    </div>
  );
}
