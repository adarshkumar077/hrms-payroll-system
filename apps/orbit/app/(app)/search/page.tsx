import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { globalSearch, type SearchHit } from "@/lib/search";
import { PageHeader, Badge, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const moduleTone: Record<string, string> = {
  Lead: "brand",
  Opportunity: "amber",
  Account: "blue",
  Contact: "green",
  Invoice: "slate",
  Employee: "blue",
  Ticket: "red",
  Item: "slate",
};

const MODULE_ORDER = ["Lead", "Opportunity", "Account", "Contact", "Invoice", "Employee", "Ticket", "Item"];

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const s = await requireSession();
  const q = (searchParams.q || "").trim();

  if (q.length < 2) {
    return (
      <div>
        <PageHeader title="Search" subtitle="Type a query to search across Orbit." />
        <Empty>Type at least 2 characters to search.</Empty>
      </div>
    );
  }

  const hits = await globalSearch(s.tenantId, q);

  const groups = new Map<string, SearchHit[]>();
  for (const hit of hits) {
    if (!groups.has(hit.module)) groups.set(hit.module, []);
    groups.get(hit.module)!.push(hit);
  }
  const orderedModules = [...groups.keys()].sort((a, b) => {
    const ai = MODULE_ORDER.indexOf(a);
    const bi = MODULE_ORDER.indexOf(b);
    return (ai === -1 ? MODULE_ORDER.length : ai) - (bi === -1 ? MODULE_ORDER.length : bi);
  });

  return (
    <div>
      <PageHeader
        title="Search"
        subtitle={`${hits.length} result${hits.length === 1 ? "" : "s"} for "${q}"`}
      />

      {hits.length === 0 ? (
        <Empty>No results for &quot;{q}&quot;.</Empty>
      ) : (
        <div className="space-y-6">
          {orderedModules.map((mod) => {
            const modHits = groups.get(mod)!;
            return (
              <div key={mod}>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-sm font-semibold text-slate-700">{mod}</h2>
                  <span className="text-xs text-slate-400">{modHits.length}</span>
                </div>
                <div className="card overflow-hidden">
                  {modHits.map((hit, idx) => (
                    <Link
                      key={`${hit.href}-${idx}`}
                      href={hit.href}
                      className="td flex items-center justify-between gap-4 hover:bg-slate-50 transition"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 truncate">{hit.label}</div>
                        {hit.sub && <div className="text-xs text-slate-500 truncate">{hit.sub}</div>}
                      </div>
                      <Badge tone={moduleTone[hit.module] || "slate"}>{hit.module}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
