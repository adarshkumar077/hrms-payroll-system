// Activity.relatedTo is a freeform "Module:id" string (e.g. "Lead:cabc123") —
// see prisma/schema.prisma Activity model comment. This maps the module name
// to that module's own record-detail route so the Activities list/create form
// can render a human link instead of the raw string. Deliberately a static
// map, not a DB lookup — keeps the activities list page to one query per
// section instead of N+1'ing into every other module.
const RELATED_MODULE_ROUTES: Record<string, string> = {
  Lead: "/leads",
  Opportunity: "/opportunities",
  Account: "/accounts",
  Contact: "/contacts",
  Ticket: "/tickets",
  Quotation: "/quotations",
};

export type ParsedRelatedTo = { module: string; id: string; href: string; label: string };

/** Parses "Module:id" → a link the UI can render, or null if unrecognized/malformed. */
export function parseRelatedTo(relatedTo: string | null | undefined): ParsedRelatedTo | null {
  if (!relatedTo) return null;
  const idx = relatedTo.indexOf(":");
  if (idx <= 0) return null;
  const module = relatedTo.slice(0, idx);
  const id = relatedTo.slice(idx + 1);
  if (!id) return null;
  const base = RELATED_MODULE_ROUTES[module];
  if (!base) return null;
  return { module, id, href: `${base}/${id}`, label: `${module} #${id.slice(0, 6)}` };
}

/** Loose shape check used server-side before persisting a caller-supplied relatedTo. */
export function isWellFormedRelatedTo(relatedTo: string): boolean {
  return /^[A-Za-z]+:[A-Za-z0-9_-]+$/.test(relatedTo);
}
