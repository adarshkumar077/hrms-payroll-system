import { db } from "@/lib/db";
import { logStudioChange } from "./changelog";

/**
 * Orbit Studio — Layout Editor (WS9 v1).
 *
 * Tenant-controlled field order/visibility for a module's record page,
 * persisted as LayoutDef (prisma/schema.prisma: tenantId+module+kind="record"
 * unique, `spec` is a versioned JSON blob). v1 only wires the Lead record
 * page (app/(app)/leads/[id]/page.tsx) to actually apply the layout — other
 * modules are editable here so Studio ahead-of-time, but their record pages
 * don't read the layout yet.
 */

export const LAYOUT_MODULES = ["leads", "opportunities", "accounts", "tickets", "contacts", "products", "quotations"] as const;
export type LayoutModule = (typeof LAYOUT_MODULES)[number];

export function isLayoutModule(v: string): v is LayoutModule {
  return (LAYOUT_MODULES as readonly string[]).includes(v);
}

/** One field's position in a saved layout. Array order = display order. */
export type LayoutFieldSpec = { code: string; hidden?: boolean };
export type RecordLayoutSpec = { fields: LayoutFieldSpec[] };

/**
 * The system field codes each module's record page renders in its details
 * panel — hardcoded here (not derived) because system fields are code-owned,
 * not FieldDef rows. Only "leads" (app/(app)/leads/[id]/page.tsx) currently
 * reads a saved layout; the rest mirror what their record pages render today
 * (or, for contacts/products, the schema columns a future record page would
 * expose) so the editor is ready before the wiring lands.
 */
export const MODULE_SYSTEM_FIELDS: Record<LayoutModule, { code: string; label: string }[]> = {
  leads: [
    { code: "name", label: "Name" },
    { code: "company", label: "Company" },
    { code: "email", label: "Email" },
    { code: "phone", label: "Phone" },
    { code: "source", label: "Source" },
    { code: "status", label: "Status" },
    { code: "followUpAt", label: "Follow-up date" },
    { code: "followUpType", label: "Follow-up type" },
    { code: "lostReason", label: "Lost reason" },
  ],
  opportunities: [
    { code: "name", label: "Name" },
    { code: "amount", label: "Amount" },
    { code: "stage", label: "Stage" },
    { code: "closeDate", label: "Close date" },
    { code: "accountId", label: "Account" },
    { code: "followUpAt", label: "Follow-up date" },
    { code: "followUpType", label: "Follow-up type" },
    { code: "lostReason", label: "Lost reason" },
  ],
  accounts: [
    { code: "name", label: "Name" },
    { code: "industry", label: "Industry" },
    { code: "phone", label: "Phone" },
    { code: "email", label: "Email" },
    { code: "gstin", label: "GSTIN" },
    { code: "address", label: "Address" },
    { code: "city", label: "City" },
    { code: "state", label: "State" },
  ],
  tickets: [
    { code: "subject", label: "Subject" },
    { code: "status", label: "Status" },
    { code: "priority", label: "Priority" },
    { code: "accountId", label: "Account" },
    { code: "slaDueAt", label: "SLA Due" },
    // Wave C additions (Ticket.typeKey/contractId/installedProductId/charges)
    // — appended, existing entries untouched.
    { code: "typeKey", label: "Type" },
    { code: "contractId", label: "Contract" },
    { code: "installedProductId", label: "Installed Product" },
    { code: "charges", label: "Charges" },
  ],
  contacts: [
    { code: "name", label: "Name" },
    { code: "email", label: "Email" },
    { code: "phone", label: "Phone" },
    { code: "title", label: "Title" },
    { code: "accountId", label: "Account" },
  ],
  products: [
    { code: "name", label: "Name" },
    { code: "sku", label: "SKU" },
    { code: "hsn", label: "HSN" },
    { code: "unitPrice", label: "Unit Price" },
    { code: "taxRate", label: "Tax Rate" },
  ],
  // Mirrors app/(app)/quotations/[id]/page.tsx's details panel: number/stage/
  // validUntil are the InlineField-style edits, the rest are display rows.
  // Not wired to orderFields() yet (WS9 v1 only applies to leads) — editable
  // here ahead of that, same as accounts/tickets/contacts/products above.
  quotations: [
    { code: "number", label: "Number" },
    { code: "account", label: "Account" },
    { code: "contact", label: "Contact" },
    { code: "stage", label: "Stage" },
    { code: "validUntil", label: "Valid Until" },
    { code: "grandTotal", label: "Grand Total" },
    { code: "chargesLabel", label: "Charges Label" },
    { code: "adjustment", label: "Adjustment" },
  ],
};

/** Corrupt-safe: anything not shaped like `{fields: [{code,hidden?}]}` → `{fields: []}`. */
export function parseLayoutSpec(raw: string | null | undefined): RecordLayoutSpec {
  if (!raw) return { fields: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { fields: [] };
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { fields?: unknown }).fields)) {
    return { fields: [] };
  }

  const fields: LayoutFieldSpec[] = [];
  for (const entry of (parsed as { fields: unknown[] }).fields) {
    if (!entry || typeof entry !== "object") continue;
    const code = typeof (entry as { code?: unknown }).code === "string" ? (entry as { code: string }).code.trim() : "";
    if (!code) continue;
    const hidden = (entry as { hidden?: unknown }).hidden === true;
    fields.push(hidden ? { code, hidden: true } : { code });
  }
  return { fields };
}

/**
 * Apply a saved layout to a list of available fields. Pure — no I/O.
 *  - Order: spec order first (skipping hidden entries and codes not present
 *    in `available`), then any `available` field NOT mentioned in the spec,
 *    in its original order — new/unconfigured fields always appear, never
 *    silently dropped.
 *  - Visibility: fields flagged `hidden` in the spec are removed entirely.
 *  - Duplicate codes in the spec: only the first occurrence counts.
 */
export function orderFields<T extends { code: string }>(available: T[], spec: RecordLayoutSpec): T[] {
  const byCode = new Map(available.map((f) => [f.code, f]));
  const seen = new Set<string>();
  const ordered: T[] = [];

  for (const entry of spec.fields) {
    if (seen.has(entry.code)) continue;
    seen.add(entry.code);
    if (entry.hidden) continue; // removed from render, but still "accounted for"
    const field = byCode.get(entry.code);
    if (!field) continue; // unknown/removed code — skip
    ordered.push(field);
  }

  for (const field of available) {
    if (!seen.has(field.code)) ordered.push(field);
  }

  return ordered;
}

/** LayoutDef kind is always "record" here — form/list/card kinds are future workstreams. */
const KIND = "record";

export async function getRecordLayout(tenantId: string, module: string): Promise<RecordLayoutSpec> {
  const row = await db.layoutDef.findUnique({
    where: { tenantId_module_kind: { tenantId, module, kind: KIND } },
  });
  return parseLayoutSpec(row?.spec);
}

export async function saveRecordLayout(
  tenantId: string,
  actorId: string | null,
  module: string,
  spec: RecordLayoutSpec
): Promise<void> {
  const specJson = JSON.stringify(spec);

  const existing = await db.layoutDef.findUnique({
    where: { tenantId_module_kind: { tenantId, module, kind: KIND } },
  });

  const updated = await db.layoutDef.upsert({
    where: { tenantId_module_kind: { tenantId, module, kind: KIND } },
    create: { tenantId, module, kind: KIND, spec: specJson, version: 1, updatedById: actorId },
    update: { spec: specJson, version: { increment: 1 }, updatedById: actorId },
  });

  await logStudioChange({
    tenantId,
    actorId,
    source: "ui",
    object: "LayoutDef",
    objectId: updated.id,
    action: existing ? "update" : "create",
    before: existing ? { spec: existing.spec, version: existing.version } : undefined,
    after: { spec: updated.spec, version: updated.version },
  });
}
