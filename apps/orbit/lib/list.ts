// Helpers for searchParams-driven list pages: search + sort + status filter + pagination.
// Prisma `where`/`orderBy` are built per-page; these just parse params and paginate consistently.

export const PAGE_SIZE = 20;

export type ParsedList = {
  q: string;
  status: string; // "" = all
  sort: string; // field name (page validates against an allow-list)
  order: "asc" | "desc";
  page: number;
  skip: number;
  take: number;
};

export function parseListParams(sp: Record<string, string | string[] | undefined>): ParsedList {
  const get = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string)) || "";
  const page = Math.max(1, parseInt(get("page") || "1", 10) || 1);
  return {
    q: get("q").trim(),
    status: get("status"),
    sort: get("sort"),
    order: get("order") === "asc" ? "asc" : "desc",
    page,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  };
}

// `size` defaults to PAGE_SIZE so every existing `pageInfo(total, page)` call
// is unaffected; pages that adopt PageSizeSelect/parsePageSize pass their
// resolved `per` as the third arg instead.
export function pageInfo(total: number, page: number, size: number = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / size));
  return { total, page, pages, from: total === 0 ? 0 : (page - 1) * size + 1, to: Math.min(total, page * size) };
}

/** Build a validated Prisma orderBy from ?sort=&order=, falling back to a default. */
export function orderByFrom(sort: string, order: "asc" | "desc", allowed: string[], fallback: Record<string, "asc" | "desc">) {
  return allowed.includes(sort) ? { [sort]: order } : fallback;
}

// ── LIST FRAMEWORK (E1) ───────────────────────────────────────────────────
// Extends the params-driven list pattern above with: per-column filters,
// a configurable page size, hide/show columns, and SavedSearch round-trip
// serialization. Pure + unit-tested (lib/list.test.ts); nothing here touches
// Prisma directly — pages compose the returned where-fragments/values
// themselves, same division of labor as parseListParams/orderByFrom.
//
// Every export here is additive: existing pages that only call
// parseListParams/pageInfo/orderByFrom are completely unaffected.

type SP = Record<string, string | string[] | undefined>;

function getParam(sp: SP, k: string): string {
  const v = sp[k];
  return ((Array.isArray(v) ? v[0] : v) || "").toString();
}

export type ColumnFilterKind = "text" | "select" | "date" | "number";

/** Per-page column-filter definition. `field` must be a real scalar the page's
 *  Prisma `where` can key on directly (parseColumnFilters returns one where
 *  fragment per active filter — the page ANDs the array in). */
export type ColumnFilterDef = { field: string; kind: ColumnFilterKind };

/**
 * Reads `f_<field>` (text/select) or `f_<field>_from`/`_to` (date) /
 * `f_<field>_min`/`_max` (number) query params for each def and returns a
 * Prisma-where fragment per ACTIVE filter (empty/invalid values are skipped,
 * not fragments). The page spreads these into `AND: [...]`.
 *
 * NOTE on `contains` (text kind): SQLite's `LIKE` (what Prisma's `contains`
 * compiles to on the sqlite provider) is case-insensitive for ASCII by
 * default — there's no `mode: "insensitive"` option on sqlite (Prisma throws
 * if you pass one), so this already behaves case-insensitive-ish without it.
 * It will NOT case-fold non-ASCII characters.
 */
export function parseColumnFilters(sp: SP, defs: ColumnFilterDef[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const def of defs) {
    if (def.kind === "text") {
      const v = getParam(sp, `f_${def.field}`).trim();
      if (v) out.push({ [def.field]: { contains: v } });
    } else if (def.kind === "select") {
      const v = getParam(sp, `f_${def.field}`).trim();
      if (v) out.push({ [def.field]: v });
    } else if (def.kind === "date") {
      const fromRaw = getParam(sp, `f_${def.field}_from`).trim();
      const toRaw = getParam(sp, `f_${def.field}_to`).trim();
      const range: { gte?: Date; lte?: Date } = {};
      if (fromRaw) {
        const d = new Date(fromRaw);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (toRaw) {
        const d = new Date(toRaw);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999); // inclusive end-of-day for a date-only input
          range.lte = d;
        }
      }
      if (Object.keys(range).length) out.push({ [def.field]: range });
    } else if (def.kind === "number") {
      const minRaw = getParam(sp, `f_${def.field}_min`).trim();
      const maxRaw = getParam(sp, `f_${def.field}_max`).trim();
      const range: { gte?: number; lte?: number } = {};
      if (minRaw !== "" && Number.isFinite(Number(minRaw))) range.gte = Number(minRaw);
      if (maxRaw !== "" && Number.isFinite(Number(maxRaw))) range.lte = Number(maxRaw);
      if (Object.keys(range).length) out.push({ [def.field]: range });
    }
  }
  return out;
}

/** The actual query-param keys a given def list reads — used both to build
 *  the `AND` where above and to know which params to clear/serialize
 *  elsewhere (ColumnFilterRow's "clear all", currentParamsToJson's allow-list). */
export function columnFilterParamKeys(defs: ColumnFilterDef[]): string[] {
  const keys: string[] = [];
  for (const def of defs) {
    if (def.kind === "date") keys.push(`f_${def.field}_from`, `f_${def.field}_to`);
    else if (def.kind === "number") keys.push(`f_${def.field}_min`, `f_${def.field}_max`);
    else keys.push(`f_${def.field}`);
  }
  return keys;
}

const ALLOWED_PAGE_SIZES = [10, 25, 50, 100];

/** `?per=` page size, restricted to {10,25,50,100}. Any other/missing value
 *  falls back to PAGE_SIZE (20, today's implicit default for every existing
 *  list page) — note 20 itself isn't one of the four selectable sizes, it's
 *  just what you get until you explicitly pick one via PageSizeSelect. */
export function parsePageSize(sp: SP): number {
  const n = parseInt(getParam(sp, "per"), 10);
  return ALLOWED_PAGE_SIZES.includes(n) ? n : PAGE_SIZE;
}

/** `?cols=a,b,c` → validated against `allColumns`, preserving allColumns'
 *  canonical order (not the URL's order) so JSX column order stays fixed and
 *  `cols` only toggles visibility. Falls back to `defaultColumns` when the
 *  param is absent or contains no valid keys. */
export function parseVisibleColumns(sp: SP, allColumns: string[], defaultColumns: string[]): string[] {
  const raw = getParam(sp, "cols");
  if (!raw) return defaultColumns;
  const requested = new Set(
    raw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
  );
  const valid = allColumns.filter((c) => requested.has(c));
  return valid.length ? valid : defaultColumns;
}

/** Serializes the subset of current searchParams named in `allowedKeys` to a
 *  JSON string — this is what gets written to SavedSearch.params. Only
 *  string-valued, truthy params are kept (array-valued params take their
 *  first element, same convention as parseListParams). */
export function currentParamsToJson(sp: SP, allowedKeys: string[]): string {
  const out: Record<string, string> = {};
  for (const k of allowedKeys) {
    const v = getParam(sp, k);
    if (v) out[k] = v;
  }
  return JSON.stringify(out);
}

/** Inverse of currentParamsToJson: SavedSearch.params JSON → a `?a=b&c=d`
 *  querystring (always starting with `?`, `?` alone when there's nothing to
 *  apply) suitable for a plain <Link href=...>. Malformed JSON degrades to
 *  `?` rather than throwing — a corrupt saved search should be a harmless
 *  no-op link, not a 500. */
export function savedParamsToQuery(paramsJson: string): string {
  let obj: unknown;
  try {
    obj = JSON.parse(paramsJson);
  } catch {
    return "?";
  }
  if (!obj || typeof obj !== "object") return "?";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === "string" && v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "?";
}
