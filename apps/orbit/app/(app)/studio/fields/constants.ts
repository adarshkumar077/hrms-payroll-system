/**
 * Orbit Studio — Custom Fields shared constants.
 * Lives outside actions.ts because "use server" files may only export async
 * functions (Next.js rule) — value exports there break the build at runtime.
 */

export const SELECTABLE_MODULES = ["leads", "accounts", "contacts", "opportunities", "tickets", "products", "contracts"] as const;
export type SelectableModule = (typeof SELECTABLE_MODULES)[number];

export const FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "currency",
  "date",
  "datetime",
  "checkbox",
  "picklist",
  "multipicklist",
  "phone",
  "email",
  "url",
  "lookup",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const MAX_CUSTOM_FIELDS_PER_MODULE = 50;
