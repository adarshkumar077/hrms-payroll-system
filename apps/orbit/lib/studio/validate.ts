/**
 * Orbit Studio — custom-field validation (WS4).
 *
 * Pure, DB-free validation/coercion for the JSON-string `custom` column that
 * every Studio-enabled record carries. Callers (server actions) load the
 * relevant `FieldDef` rows themselves and pass them in as `FieldDefLite[]` —
 * this module never touches Prisma so it stays trivially unit-testable.
 *
 * Field codes for custom fields are always prefixed `c_`; system fields live
 * as real Prisma columns, not in `custom`, so any `FieldDefLite` with
 * `system: true` is ignored here.
 */

export type FieldDefLite = {
  code: string;
  label: string;
  type: string;
  system: boolean;
  required: boolean;
  archived: boolean;
  picklistId?: string | null;
  lookupModule?: string | null;
};

export type ValidationIssue = { code: string; message: string };

export type ValidateCustomOpts = {
  /** Currently-stored values (post-parseCustom), used for partial-update + archived-field preservation. */
  existingValues?: Record<string, unknown>;
  /** Active option values per picklistId, used to validate picklist/multipicklist membership. */
  picklistValues?: Record<string, string[]>;
};

const TEXT_MAX = 500;
const LONGTEXT_MAX = 5000;
const PHONE_RE = /^[+]?[0-9]{6,15}$/;
const EMAIL_RE = /.+@.+\..+/;
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

/** Parse a raw `custom` JSON-string column safely. Corrupt/missing input → {}. */
export function parseCustom(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

/** null/undefined/"" and empty arrays count as "no value"; 0 and false do not. */
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

function toBoolean(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === undefined || raw === null) return false;
  const s = String(raw).trim().toLowerCase();
  return s === "true" || s === "on" || s === "1" || s === "yes";
}

/** Per-type coercion + validation. Returns either a normalized value or an issue message. */
function coerceValue(
  def: FieldDefLite,
  raw: unknown,
  picklistValues: Record<string, string[]>
): { value?: unknown; issue?: string } {
  switch (def.type) {
    case "text":
    case "longtext": {
      const s = typeof raw === "string" ? raw : String(raw);
      const trimmed = s.trim();
      const max = def.type === "text" ? TEXT_MAX : LONGTEXT_MAX;
      if (trimmed.length > max) {
        return { issue: `${def.label} exceeds maximum length of ${max} characters` };
      }
      return { value: trimmed };
    }

    case "number":
    case "currency": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isNaN(n) || !Number.isFinite(n)) {
        return { issue: `${def.label} must be a valid number` };
      }
      return { value: def.type === "currency" ? Math.round(n * 100) / 100 : n };
    }

    case "date":
    case "datetime": {
      const d = new Date(raw as string | number | Date);
      if (Number.isNaN(d.getTime())) {
        return { issue: `${def.label} is not a valid date` };
      }
      return { value: def.type === "date" ? d.toISOString().slice(0, 10) : d.toISOString() };
    }

    case "picklist": {
      const s = typeof raw === "string" ? raw : String(raw);
      const allowed = def.picklistId ? picklistValues[def.picklistId] : undefined;
      if (allowed && !allowed.includes(s)) {
        return { issue: `${def.label} value is not a valid option` };
      }
      return { value: s };
    }

    case "multipicklist": {
      const arr = Array.isArray(raw) ? raw : [raw];
      const strs = arr.map((v) => (typeof v === "string" ? v : String(v)));
      const allowed = def.picklistId ? picklistValues[def.picklistId] : undefined;
      if (allowed) {
        const bad = strs.filter((v) => !allowed.includes(v));
        if (bad.length) {
          return { issue: `${def.label} has invalid option(s): ${bad.join(", ")}` };
        }
      }
      return { value: strs };
    }

    case "phone": {
      const s = String(raw).replace(/[\s-]/g, "");
      if (!PHONE_RE.test(s)) {
        return { issue: `${def.label} is not a valid phone number` };
      }
      return { value: s };
    }

    case "email": {
      const s = String(raw).trim();
      if (!EMAIL_RE.test(s)) {
        return { issue: `${def.label} is not a valid email address` };
      }
      return { value: s };
    }

    case "url": {
      let s = String(raw).trim();
      if (!SCHEME_RE.test(s)) s = `https://${s}`;
      try {
        new URL(s);
      } catch {
        return { issue: `${def.label} is not a valid URL` };
      }
      return { value: s };
    }

    case "lookup": {
      // Existence of the referenced record is the caller's job (needs db access).
      const s = String(raw).trim();
      if (!s) return { issue: `${def.label} is required` };
      return { value: s };
    }

    default:
      // Unknown/forward-compat type: pass through unchanged.
      return { value: raw };
  }
}

/**
 * Validate + normalize submitted custom values against field definitions.
 *
 * - Unknown keys (no matching, non-system def) are dropped silently.
 * - Archived fields are not writable: submitted values are dropped, but any
 *   non-empty `existingValues` entry for them is carried forward untouched.
 * - Required non-archived fields raise an issue when empty/missing, UNLESS
 *   the submission omits the key entirely AND `existingValues` already holds
 *   a non-empty value for it (partial-update semantics: omission ≠ clearing).
 * - Empty string/null/undefined submitted explicitly for a non-required
 *   field clears it (key omitted from the result, not stored).
 * - checkbox is exempt from the required/empty machinery above — it always
 *   coerces to a boolean and is only omitted when truly untouched (no
 *   submitted value and no existing value).
 */
export function validateCustom(
  submitted: Record<string, unknown>,
  defs: FieldDefLite[],
  opts: ValidateCustomOpts = {}
): { values: Record<string, unknown>; issues: ValidationIssue[] } {
  const existingValues = opts.existingValues ?? {};
  const picklistValues = opts.picklistValues ?? {};
  const values: Record<string, unknown> = {};
  const issues: ValidationIssue[] = [];

  for (const def of defs) {
    if (def.system) continue; // system fields are real columns, never in `custom`

    const { code, archived, required, label, type } = def;
    const hasSubmitted = Object.prototype.hasOwnProperty.call(submitted, code);
    const hasExisting = Object.prototype.hasOwnProperty.call(existingValues, code);
    const existingIsNonEmpty = hasExisting && !isEmptyValue(existingValues[code]);

    if (archived) {
      if (existingIsNonEmpty) values[code] = existingValues[code];
      continue;
    }

    if (type === "checkbox") {
      if (hasSubmitted) {
        values[code] = toBoolean(submitted[code]);
      } else if (existingIsNonEmpty) {
        values[code] = toBoolean(existingValues[code]);
      }
      continue;
    }

    const raw = hasSubmitted ? submitted[code] : existingIsNonEmpty ? existingValues[code] : undefined;

    if (isEmptyValue(raw)) {
      if (required) issues.push({ code, message: `${label} is required` });
      continue;
    }

    const { value, issue } = coerceValue(def, raw, picklistValues);
    if (issue) {
      issues.push({ code, message: issue });
      continue;
    }
    values[code] = value;
  }

  return { values, issues };
}

/** Is `existingCustomCount` still below the plan-tier custom-field cap (default 50)? */
export function withinFieldCap(existingCustomCount: number, cap = 50): boolean {
  return existingCustomCount < cap;
}

/**
 * Derive a new custom field's storage code from its label: `c_snake_case`,
 * restricted to [a-z0-9_], collision-suffixed against `taken` (c_foo,
 * c_foo_2, c_foo_3, ...). Labels that yield nothing usable (blank,
 * punctuation-only, non-Latin scripts) fall back to `c_field`.
 */
const DIACRITIC_RE = new RegExp("[\\u0300-\\u036f]", "g");

export function makeFieldCode(label: string, taken: Set<string>): string {
  let base = label
    .normalize("NFKD")
    .replace(DIACRITIC_RE, "") // strip diacritics (café → cafe)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!base) base = "field";

  const code = `c_${base}`;
  if (!taken.has(code)) return code;

  let n = 2;
  while (taken.has(`${code}_${n}`)) n++;
  return `${code}_${n}`;
}
