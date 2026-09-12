/**
 * Orbit Studio — Convert & Duplicate Rules shared constants.
 * Lives outside actions.ts because "use server" files may only export async
 * functions (Next.js rule) — value exports there break the build at runtime.
 * Same split as ../fields/constants.ts.
 */

export const CONVERT_TARGETS = ["account", "contact", "opportunity"] as const;
export type ConvertTarget = (typeof CONVERT_TARGETS)[number];

export const CONVERT_TARGET_LABELS: Record<ConvertTarget, string> = {
  account: "Account",
  contact: "Contact",
  opportunity: "Opportunity",
};

// Lead columns that exist today (prisma/schema.prisma model Lead) — the
// tenant's custom c_* FieldDefs on module "leads" are appended at render time.
export const STANDARD_LEAD_SOURCE_FIELDS = [
  { value: "name", label: "Name" },
  { value: "company", label: "Company" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "source", label: "Source" },
  { value: "status", label: "Status" },
] as const;

// Allowed target fields per conversion target. Opportunity is intentionally
// name-only in v1: amount/stage/probability are computed at convert time
// (see convertLead in lib/studio/convert.ts), and mapping an arbitrary lead
// string field into `amount` (a float) with no validation here would silently
// produce 0/NaN — safer to leave that computed until v2 adds real validation.
export const CONVERT_TARGET_FIELDS: Record<ConvertTarget, { value: string; label: string }[]> = {
  account: [
    { value: "name", label: "Name" },
    { value: "industry", label: "Industry" },
    { value: "phone", label: "Phone" },
    { value: "email", label: "Email" },
    { value: "gstin", label: "GSTIN" },
    { value: "address", label: "Address" },
    { value: "city", label: "City" },
    { value: "state", label: "State" },
  ],
  contact: [
    { value: "name", label: "Name" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "title", label: "Title" },
  ],
  opportunity: [{ value: "name", label: "Name" }],
};

// Fields the v1 dedupe engine (lib/studio/dedupe.ts) can match on for leads.
export const DEDUPE_FIELDS = ["name", "company", "email", "phone"] as const;
export type DedupeField = (typeof DEDUPE_FIELDS)[number];

export const DEDUPE_FIELD_LABELS: Record<DedupeField, string> = {
  name: "Name",
  company: "Company",
  email: "Email",
  phone: "Phone",
};
