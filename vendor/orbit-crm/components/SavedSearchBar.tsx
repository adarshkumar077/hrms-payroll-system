import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { savedParamsToQuery } from "@/lib/list";
import { SaveViewForm, SavedSearchChip } from "./SavedSearchControls";

// LIST FRAMEWORK (E1): async Server Component (NOT "use client" — it reads
// `db` directly like a page does) so a list page can drop in a single
// `<SavedSearchBar module="leads" currentParamsJson={currentParamsJson} />`
// without fetching/passing saved-search data itself. Interactive bits (save
// form, star, delete) are split into components/SavedSearchControls.tsx
// ("use client") — same split as PageHeader (server) vs LeadRowActions
// (client) on the leads page.
//
// `currentParamsJson` is produced by the page via lib/list.ts'
// currentParamsToJson(searchParams, allowedKeys) — pass the exact same
// allow-list the page used to build its `where`/orderBy/cols, so "Save view"
// captures the full current list state.
export async function SavedSearchBar({ module, currentParamsJson }: { module: string; currentParamsJson: string }) {
  const s = await requireSession();

  const searches = await db.savedSearch.findMany({
    where: { tenantId: s.tenantId, module, OR: [{ ownerId: null }, { ownerId: s.userId }] },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  // "Bare" = landing on the list with none of the framework's own params
  // set (currentParamsToJson only serializes truthy values, so "{}" means
  // nothing's active). Per the spec: never auto-redirect a bare URL to the
  // default view — only surface a chip to opt in.
  const isBare = currentParamsJson === "{}";
  const defaultSearch = searches.find((sv) => sv.isDefault) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
      {searches.length > 0 && <span className="text-slate-500">Views:</span>}
      {searches.map((sv) => (
        <SavedSearchChip
          key={sv.id}
          id={sv.id}
          name={sv.name}
          href={savedParamsToQuery(sv.params)}
          isDefault={sv.isDefault}
          shared={sv.ownerId === null}
          canManage={sv.ownerId === s.userId || s.isCeo}
        />
      ))}
      {isBare && defaultSearch && (
        <Link href={savedParamsToQuery(defaultSearch.params)} className="badge bg-brand-50 text-brand-700 hover:underline">
          Apply default view: {defaultSearch.name}
        </Link>
      )}
      <SaveViewForm module={module} currentParamsJson={currentParamsJson} canShare={s.isCeo} />
    </div>
  );
}
