"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { validateCustom, parseCustom, type FieldDefLite } from "@/lib/studio/validate";

// Manually create an installed-base record — account required, product
// optional (client autofills `name` from the picked product, but the server
// only trusts whatever `name` actually arrives; falls back to the product's
// own name if the field was left blank). Module "installed" custom fields.
export async function createInstalledProductAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "installed", "write"))) return { error: "Not authorized" };

  const accountId = str(formData.get("accountId"));
  if (!accountId) return { error: "Account is required." };
  const account = await db.account.findFirst({ where: { id: accountId, tenantId: s.tenantId } });
  if (!account) return { error: "Selected account not found." };

  const productId = str(formData.get("productId"));
  let product: { id: string; name: string } | null = null;
  if (productId) {
    product = await db.product.findFirst({
      where: { id: productId, tenantId: s.tenantId },
      select: { id: true, name: true },
    });
    if (!product) return { error: "Selected product not found." };
  }

  let name = str(formData.get("name")) || "";
  if (!name && product) name = product.name;
  if (!name) return { error: "Name is required." };

  const serialNo = str(formData.get("serialNo"));
  const location = str(formData.get("location"));

  const installedAtRaw = str(formData.get("installedAt"));
  let installedAt: Date | null = null;
  if (installedAtRaw) {
    const d = new Date(installedAtRaw);
    if (Number.isNaN(d.getTime())) return { error: "Installed date is not a valid date." };
    installedAt = d;
  }

  const warrantyUntilRaw = str(formData.get("warrantyUntil"));
  let warrantyUntil: Date | null = null;
  if (warrantyUntilRaw) {
    const d = new Date(warrantyUntilRaw);
    if (Number.isNaN(d.getTime())) return { error: "Warranty-until is not a valid date." };
    warrantyUntil = d;
  }

  const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "installed", archived: false } });
  const fieldDefs: FieldDefLite[] = defs.map((d) => ({
    code: d.code,
    label: d.label,
    type: d.type,
    system: d.system,
    required: d.required,
    archived: d.archived,
    picklistId: d.picklistId,
    lookupModule: d.lookupModule,
  }));
  const picklistValues = await picklistValuesFor(defs);
  const submitted = collectCustomSubmission(formData, defs);

  const { values, issues } = validateCustom(submitted, fieldDefs, { picklistValues });
  if (issues.length) return { error: issues.map((i) => i.message).join("; ") };

  const installedProduct = await db.installedProduct.create({
    data: {
      tenantId: s.tenantId,
      accountId,
      productId,
      name,
      serialNo,
      installedAt,
      warrantyUntil,
      location,
      custom: JSON.stringify(values),
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "installed.created",
    entity: "InstalledProduct",
    entityId: installedProduct.id,
    actorId: s.userId,
    payload: { note: `New installed product: ${installedProduct.name} → ${account.name}` },
  });

  revalidatePath("/installed");
  revalidatePath(`/accounts/${accountId}`);
  redirect("/installed");
}

// System (real-column) fields the record detail page is allowed to
// inline-edit. accountId/productId/contractId are deliberately excluded —
// they render as read-only link panels on the detail page, not inline fields.
const ALLOWED_SYSTEM_FIELDS = new Set(["name", "serialNo", "installedAt", "warrantyUntil", "location"]);

// Universal Record Page — inline single-field edit. formData: { id, field, value }.
// `field` is either an ALLOWED_SYSTEM_FIELDS name or a custom-field code (c_*).
export async function updateInstalledProductAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "installed", "write"))) return { error: "Not authorized" };

  const id = String(formData.get("id") || "");
  const field = String(formData.get("field") || "");
  const rawValue = formData.get("value");
  const value = rawValue == null ? "" : String(rawValue);
  if (!id || !field) return { error: "Missing field" };

  const installedProduct = await db.installedProduct.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!installedProduct) return { error: "Installed product not found" };

  if (field.startsWith("c_")) {
    const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "installed", archived: false } });
    if (!defs.some((d) => d.code === field && !d.system)) return { error: "Unknown field" };

    const fieldDefs: FieldDefLite[] = defs.map((d) => ({
      code: d.code,
      label: d.label,
      type: d.type,
      system: d.system,
      required: d.required,
      archived: d.archived,
      picklistId: d.picklistId,
      lookupModule: d.lookupModule,
    }));
    const picklistValues = await picklistValuesFor(defs);
    const existingValues = parseCustom(installedProduct.custom);

    // Single-field submission: only `field` is present in `submitted`, every
    // other def falls back to existingValues inside validateCustom, so the
    // returned `values` is the full, merged custom object ready to persist.
    const { values, issues } = validateCustom({ [field]: value }, fieldDefs, { existingValues, picklistValues });
    if (issues.length) return { error: issues.map((i) => i.message).join("; ") };

    await db.installedProduct.update({
      where: { id: installedProduct.id },
      data: { custom: JSON.stringify(values), updatedById: s.userId },
    });
  } else {
    if (!ALLOWED_SYSTEM_FIELDS.has(field)) return { error: "Field is not editable" };

    const data: {
      name?: string;
      serialNo?: string | null;
      installedAt?: Date | null;
      warrantyUntil?: Date | null;
      location?: string | null;
      updatedById?: string;
    } = {};

    if (field === "name") {
      const trimmed = value.trim();
      if (!trimmed) return { error: "Name is required." };
      data.name = trimmed;
    } else if (field === "serialNo") {
      data.serialNo = value.trim() || null;
    } else if (field === "location") {
      data.location = value.trim() || null;
    } else if (field === "installedAt") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.installedAt = null;
      } else {
        const d = new Date(trimmed);
        if (Number.isNaN(d.getTime())) return { error: "Installed date must be a valid date." };
        data.installedAt = d;
      }
    } else if (field === "warrantyUntil") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.warrantyUntil = null;
      } else {
        const d = new Date(trimmed);
        if (Number.isNaN(d.getTime())) return { error: "Warranty-until must be a valid date." };
        data.warrantyUntil = d;
      }
    }
    data.updatedById = s.userId;

    await db.installedProduct.update({ where: { id: installedProduct.id }, data });
  }

  await emit({
    tenantId: s.tenantId,
    type: "installed.updated",
    entity: "InstalledProduct",
    entityId: installedProduct.id,
    actorId: s.userId,
    payload: { field },
  });

  revalidatePath("/installed");
  revalidatePath(`/installed/${installedProduct.id}`);
  revalidatePath(`/accounts/${installedProduct.accountId}`);
}

function str(v: FormDataEntryValue | null): string | null {
  const t = String(v || "").trim();
  return t || null;
}

// Pull `custom_<code>` entries off FormData per FieldDef.type (multipicklist
// needs getAll, checkbox needs a presence check) into a plain submission
// object ready for lib/studio/validate.ts's validateCustom().
function collectCustomSubmission(
  formData: FormData,
  defs: { code: string; type: string }[]
): Record<string, unknown> {
  const submitted: Record<string, unknown> = {};
  for (const d of defs) {
    const key = `custom_${d.code}`;
    if (d.type === "multipicklist") {
      const vals = formData.getAll(key).map(String).filter(Boolean);
      if (vals.length) submitted[d.code] = vals;
    } else if (d.type === "checkbox") {
      submitted[d.code] = formData.get(key) === "on";
    } else {
      const v = String(formData.get(key) ?? "").trim();
      if (v) submitted[d.code] = v;
    }
  }
  return submitted;
}

// Active option values keyed by picklistId — the shape validateCustom()'s
// `opts.picklistValues` expects (it looks values up via `def.picklistId`).
async function picklistValuesFor(defs: { picklistId: string | null }[]): Promise<Record<string, string[]>> {
  const ids = defs.filter((d) => d.picklistId).map((d) => d.picklistId as string);
  if (ids.length === 0) return {};
  const opts = await db.picklistOption.findMany({ where: { picklistDefId: { in: ids }, archived: false } });
  const out: Record<string, string[]> = {};
  for (const o of opts) {
    (out[o.picklistDefId] ??= []).push(o.value);
  }
  return out;
}
