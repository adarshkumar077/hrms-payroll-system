"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logStudioChange } from "@/lib/studio/changelog";
import { makeFieldCode } from "@/lib/studio/validate";
import { planLimits, getSubscription, planOf, PLANS } from "@/lib/billing";
import { SELECTABLE_MODULES, FIELD_TYPES, MAX_CUSTOM_FIELDS_PER_MODULE, type SelectableModule } from "./constants";

/**
 * Orbit Studio — Custom Fields (WS4).
 * Fields live per tenant+module (FieldDef). System fields (none seeded yet —
 * built-ins like name/email/phone are still code-owned) allow relabel only;
 * custom fields (code starts "c_") are fully tenant-owned except code/type,
 * which are immutable once created (see updateFieldAction for why).
 * Shared constants live in ./constants.ts — "use server" files may only
 * export async functions.
 */

/** Guard: Studio writes are admin-territory (CEO bypasses; roles need studio:write). */
async function requireStudioWrite() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) throw new Error("No studio access");
  return s;
}

function isSelectableModule(module: string): module is SelectableModule {
  return (SELECTABLE_MODULES as readonly string[]).includes(module);
}

function slugifyKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "list";
}

/** First unused PicklistDef.key for this tenant, starting from `base`. */
async function uniquePicklistKey(tenantId: string, base: string): Promise<string> {
  let key = base;
  let n = 1;
  // Small, bounded loop — new-picklist-from-field-form is a rare, admin-only action.
  while (await db.picklistDef.findUnique({ where: { tenantId_key: { tenantId, key } } })) {
    n += 1;
    key = `${base}_${n}`;
  }
  return key;
}

export async function createFieldAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const module = String(formData.get("module") || "");
  if (!isSelectableModule(module)) return { error: "Invalid module." };

  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "Label is required." };

  const type = String(formData.get("type") || "");
  if (!(FIELD_TYPES as readonly string[]).includes(type)) return { error: "Invalid field type." };

  const required = formData.get("required") === "on";
  const helpText = String(formData.get("helpText") || "").trim() || null;

  // Cap: max non-system fields per module, bounded by the tenant's plan (and
  // never above the absolute ceiling in ./constants). Server-side — the form
  // disables itself at cap too, but that's UX only, not enforcement.
  const [sub, limits] = await Promise.all([getSubscription(s.tenantId), planLimits(s.tenantId)]);
  const planCap = Math.min(limits.customFieldsPerModule, MAX_CUSTOM_FIELDS_PER_MODULE);
  const customCount = await db.fieldDef.count({ where: { tenantId: s.tenantId, module, system: false } });
  if (customCount >= planCap) {
    const planName = PLANS[planOf(sub.plan)].name;
    return {
      error: `This module has reached the ${planCap} custom field limit on the ${planName} plan. Upgrade in Billing to add more.`,
    };
  }

  let lookupModule: string | null = null;
  if (type === "lookup") {
    lookupModule = String(formData.get("lookupModule") || "");
    if (!isSelectableModule(lookupModule)) return { error: "Choose a lookup module." };
  }

  const wantsPicklist = type === "picklist" || type === "multipicklist";
  const picklistMode = String(formData.get("picklistMode") || "existing");
  let existingPicklistId: string | null = null;
  let newPicklistName: string | null = null;
  if (wantsPicklist) {
    if (picklistMode === "new") {
      newPicklistName = String(formData.get("newPicklistName") || "").trim();
      if (!newPicklistName) return { error: "Name the new picklist." };
    } else {
      existingPicklistId = String(formData.get("picklistId") || "") || null;
      if (!existingPicklistId) return { error: "Choose a picklist." };
      const pl = await db.picklistDef.findFirst({ where: { id: existingPicklistId, tenantId: s.tenantId } });
      if (!pl) return { error: "Picklist not found." };
    }
  }

  const takenRows = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module }, select: { code: true } });
  const taken = new Set(takenRows.map((f) => f.code));
  const code = makeFieldCode(label, taken);

  const maxSort = await db.fieldDef.aggregate({ where: { tenantId: s.tenantId, module }, _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const created = await db.$transaction(async (tx) => {
    let picklistId = existingPicklistId;
    if (wantsPicklist && picklistMode === "new" && newPicklistName) {
      const key = await uniquePicklistKey(s.tenantId, slugifyKey(newPicklistName));
      const pl = await tx.picklistDef.create({
        data: { tenantId: s.tenantId, key, label: newPicklistName, system: false },
      });
      picklistId = pl.id;
    }
    return tx.fieldDef.create({
      data: {
        tenantId: s.tenantId,
        module,
        code,
        label,
        type,
        system: false,
        required,
        helpText,
        picklistId,
        lookupModule,
        sortOrder,
        updatedById: s.userId,
      },
    });
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "FieldDef",
    objectId: created.id,
    action: "create",
    after: {
      module,
      code: created.code,
      label,
      type,
      required,
      helpText,
      picklistId: created.picklistId,
      lookupModule,
    },
  });

  revalidatePath("/studio/fields");
}

export async function updateFieldAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const id = String(formData.get("id") || "");
  const existing = await db.fieldDef.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!existing) return { error: "Field not found." };

  const label = String(formData.get("label") || "").trim();
  if (!label) return { error: "Label is required." };
  const required = formData.get("required") === "on";
  const helpText = String(formData.get("helpText") || "").trim() || null;

  // Only label/required/helpText are ever editable here — NOT code or type.
  // `code` is the storage key: every stored record value, import-header
  // mapping and future integration keys off it, so renaming it silently
  // breaks all of those. `type` changing would reinterpret already-stored
  // values (e.g. a free-text value read back as a number/date) and corrupt
  // them. Both are fixed at creation time by design.
  const updated = await db.fieldDef.update({
    where: { id: existing.id },
    data: { label, required, helpText, updatedById: s.userId },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "FieldDef",
    objectId: updated.id,
    action: "update",
    before: { label: existing.label, required: existing.required, helpText: existing.helpText },
    after: { label: updated.label, required: updated.required, helpText: updated.helpText },
  });

  revalidatePath("/studio/fields");
}

async function setArchived(id: string, archived: boolean) {
  const s = await requireStudioWrite();
  const existing = await db.fieldDef.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!existing) return { error: "Field not found." };

  const updated = await db.fieldDef.update({
    where: { id: existing.id },
    data: { archived, updatedById: s.userId },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "FieldDef",
    objectId: updated.id,
    action: archived ? "archive" : "update",
    before: { archived: existing.archived },
    after: { archived: updated.archived },
  });

  revalidatePath("/studio/fields");
}

// Archiving is the only removal in v1 — values on existing records are
// retained (not wiped), and the field simply stops appearing for new entry.
// There is deliberately no hard-delete action.
export async function archiveFieldAction(id: string) {
  return setArchived(id, true);
}

export async function restoreFieldAction(id: string) {
  return setArchived(id, false);
}
