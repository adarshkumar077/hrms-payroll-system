import { db } from "@/lib/db";

/**
 * Orbit Studio — configurable duplicate-detection engine.
 *
 * Driven by DedupeRule (prisma/schema.prisma): tenant+module → OR-of-AND field
 * groups, a mode ("warn" surfaces matches but lets the write proceed; "block"
 * refuses it), and an enabled flag. Callers (leads/actions.ts, contacts/actions.ts,
 * import/actions.ts, marketplace.ts) call checkDuplicates() before creating a
 * record and decide what to do with the result — this module never mutates
 * the target entity.
 *
 * v1 implements real matching for "leads" and "contacts" (the only modules
 * with a lazily-created default rule — see MODULES below). Other modules have
 * no default rule and no MODULES entry, so checkDuplicates() naturally
 * returns { mode: "off" } for them until a future workstream wires up their
 * matching + UI.
 */

export type DedupeCheck = { mode: "warn" | "block" | "off"; matches: { id: string; label: string }[] };

/**
 * Parse a DedupeRule.fields JSON string into OR-of-AND field groups, e.g.
 * `[["email"],["phone"]]` = (email) OR (phone); `[["email","phone"]]` = both
 * must match. Corrupt/malformed JSON (not an array, or an inner group that
 * isn't an array of strings) → []. Empty-string fields inside a group are
 * dropped; a group left with zero fields is dropped entirely.
 */
export function parseRuleFields(raw: string): string[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const groups: string[][] = [];
  for (const g of parsed) {
    if (!Array.isArray(g)) return []; // one malformed group taints the whole rule
    const fields = g.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
    if (fields.length > 0) groups.push(fields);
  }
  return groups;
}

/**
 * Normalize a field value for comparison. Empty/nullish → null (so callers can
 * treat "no value" as "can't match").
 *  - phone: strip everything but digits, keep the last 10 (India national
 *    number length) so "+91 98200 12345" and "098200-12345" compare equal.
 *  - everything else (email included): trim + lowercase.
 */
export function normalizeValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;

  if (field === "phone") {
    const digits = str.replace(/\D/g, "");
    if (!digits) return null;
    return digits.slice(-10);
  }

  return str.toLowerCase();
}

// Default match fields seeded for every module below (email OR phone) —
// matches today's marketplace 24h dedupe fields so turning this on changes
// nothing by default.
const DEFAULT_FIELDS = JSON.stringify([["email"], ["phone"]]);

/**
 * Lazily create the default dedupe rule for a module. Only modules with a
 * MODULES entry (below) get a default — every other module intentionally has
 * none: an absent rule means checkDuplicates() returns "off", i.e. dedupe is
 * opt-in per module until Studio UI + matching land for it. Idempotent /
 * concurrency-safe (same create-catch pattern as lib/studio/defaults.ts and
 * lib/studio/numbering.ts).
 */
export async function ensureDedupeRule(tenantId: string, module: string): Promise<void> {
  if (!(module in MODULES)) return;

  const existing = await db.dedupeRule.findUnique({ where: { tenantId_module: { tenantId, module } } });
  if (existing) return;

  try {
    await db.dedupeRule.create({
      data: {
        tenantId,
        module,
        fields: DEFAULT_FIELDS,
        mode: "warn",
        enabled: true,
      },
    });
  } catch {
    // Concurrent first-use created it already (unique tenantId+module) — fine.
  }
}

// A candidate row from any matchable module — the union of columns any
// module's select can populate. Modules that don't have a column (e.g.
// contacts has no "company") simply never select/compare it.
type Candidate = { id: string; name: string; company?: string | null; email: string | null; phone: string | null };

function candidateValue(c: Candidate, field: string): unknown {
  if (field === "email") return c.email;
  if (field === "phone") return c.phone;
  if (field === "name") return c.name;
  if (field === "company") return c.company;
  return (c as Record<string, unknown>)[field];
}

/**
 * Per-module matching config: which fields are allowed in a DedupeRule for
 * this module, and how to fetch/label candidate rows. Kept as a small table
 * rather than a bigger abstraction — every v1 module (leads, contacts) is a
 * simple flat-column model, so this is all the indirection that's needed.
 */
const MODULES: Record<
  string,
  {
    allowedFields: readonly string[];
    findCandidates: (where: Record<string, unknown>) => Promise<Candidate[]>;
    label: (c: Candidate) => string;
  }
> = {
  leads: {
    allowedFields: ["name", "company", "email", "phone"],
    findCandidates: (where) =>
      db.lead.findMany({
        where,
        select: { id: true, name: true, company: true, email: true, phone: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    label: (c) => `${c.name} (${c.email || c.phone || ""})`,
  },
  contacts: {
    allowedFields: ["name", "email", "phone"],
    findCandidates: (where) =>
      db.contact.findMany({
        where,
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    label: (c) => `${c.name} (${c.email || c.phone || ""})`,
  },
};

/** Modules with a v1 dedupe implementation, in a stable declared order. */
export const DEDUPE_MODULES = Object.keys(MODULES);

/**
 * The allowed match fields for a module's DedupeRule (the source of truth
 * MODULES is built from), or undefined if `module` has no v1 implementation.
 * Callers that persist a DedupeRule (Studio's updateDedupeRuleAction) use
 * this to reject fields the matching engine above doesn't actually support,
 * instead of duplicating the per-module field list.
 */
export function allowedDedupeFields(module: string): readonly string[] | undefined {
  return MODULES[module]?.allowedFields;
}

/**
 * Check `values` (a prospective new/edited record) against existing rows for
 * tenant+module, per the tenant's DedupeRule. Pass `values.excludeId` to skip
 * a row when checking an existing record (e.g. edit forms) against itself.
 *
 * Returns { mode: "off", matches: [] } when there's nothing to check: no rule,
 * rule disabled, no usable field groups, or the module has no v1
 * implementation (anything not in MODULES above — everything except "leads"
 * and "contacts").
 */
export async function checkDuplicates(
  tenantId: string,
  module: string,
  values: Record<string, unknown>
): Promise<DedupeCheck> {
  await ensureDedupeRule(tenantId, module);

  const rule = await db.dedupeRule.findUnique({ where: { tenantId_module: { tenantId, module } } });
  if (!rule || !rule.enabled) return { mode: "off", matches: [] };

  const groups = parseRuleFields(rule.fields);
  if (groups.length === 0) return { mode: "off", matches: [] };

  const mode: "warn" | "block" = rule.mode === "block" ? "block" : "warn";

  // v1: only modules in MODULES have a real matching implementation. Other
  // modules can have a DedupeRule configured (future-proofing / Studio UI
  // ready) but pass through as off until their matching is wired up.
  const cfg = MODULES[module];
  if (!cfg) return { mode: "off", matches: [] };

  const excludeId = typeof values.excludeId === "string" ? values.excludeId : undefined;

  // Drop groups that are entirely empty in this submission — an empty
  // submission must never match everything.
  const activeGroups = groups.filter((g) => g.some((f) => normalizeValue(f, values[f]) !== null));
  if (activeGroups.length === 0) return { mode, matches: [] };

  // Build a broad OR-of-AND candidate WHERE. SQLite can't cheaply do
  // case/format-insensitive equality, so this is a pragmatic overfetch: match
  // on the normalized value OR the raw trimmed value for exact-ish fields
  // (email and friends), and just require phone to be present for phone
  // fields. The precise (normalized) comparison happens in JS below.
  const orClauses: Record<string, unknown>[] = [];
  for (const group of activeGroups) {
    const andClauses: Record<string, unknown>[] = [];
    let usable = true;
    for (const field of group) {
      const norm = normalizeValue(field, values[field]);
      if (norm === null) {
        usable = false; // this AND-group can't match without every field present
        break;
      }
      if (field === "phone") {
        andClauses.push({ phone: { not: null } });
      } else {
        const raw = String(values[field] ?? "").trim();
        const or = raw && raw !== norm ? [{ [field]: norm }, { [field]: raw }] : [{ [field]: norm }];
        andClauses.push({ OR: or });
      }
    }
    if (usable && andClauses.length > 0) orClauses.push({ AND: andClauses });
  }

  if (orClauses.length === 0) return { mode, matches: [] };

  const candidates = await cfg.findCandidates({
    tenantId,
    ...(excludeId ? { id: { not: excludeId } } : {}),
    OR: orClauses,
  });

  // Precise match: re-check every candidate against every active group using
  // normalized comparison — this is where phone loose-matching (and the exact
  // semantics of AND-within-a-group) actually get enforced.
  const matches: { id: string; label: string }[] = [];
  for (const c of candidates) {
    const isMatch = activeGroups.some((group) =>
      group.every((field) => {
        const target = normalizeValue(field, values[field]);
        if (target === null) return false;
        const cNorm = normalizeValue(field, candidateValue(c, field));
        return cNorm !== null && cNorm === target;
      })
    );
    if (isMatch) {
      matches.push({ id: c.id, label: cfg.label(c) });
      if (matches.length >= 5) break;
    }
  }

  return { mode, matches };
}
