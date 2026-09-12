// Path map for SavedSearch.module → its list-page route, used to
// revalidatePath() after a save/delete/set-default mutation. Broader than
// tags' TAG_MODULE_PATHS (app/(app)/tags/constants.ts) on purpose — Tags only
// wires the ~7 modules with cross-module tagging, but any list page can grow
// a SavedSearchBar, so this needs an entry per list page, not per tag module.
// Kept as a plain (non "use server") module so app/(app)/saved-searches/actions.ts
// can import it — a "use server" file may only export async functions.
export const MODULE_LIST_PATHS: Record<string, string> = {
  leads: "/leads",
  opportunities: "/opportunities",
  accounts: "/accounts",
  contacts: "/contacts",
  quotations: "/quotations",
  tickets: "/tickets",
  contracts: "/contracts",
  installed: "/installed",
  calls: "/calls",
  messages: "/messages",
  products: "/products",
  activities: "/activities",
  documents: "/documents",
};

/** Falls back to `/${module}` for any list-page module not (yet) listed
 *  above — every module key used so far matches its top-level route, so this
 *  is a safe default rather than a real guess. */
export function listPathForModule(module: string): string {
  return MODULE_LIST_PATHS[module] ?? `/${module}`;
}
