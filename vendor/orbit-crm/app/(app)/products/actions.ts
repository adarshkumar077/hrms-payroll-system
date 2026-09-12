"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { validateCustom, type FieldDefLite } from "@/lib/studio/validate";

// Manually create a product — core fields + Studio custom fields (module "products").
export async function createProductAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };

  const sku = str(formData.get("sku"));
  const hsn = str(formData.get("hsn"));

  const unitPriceRaw = String(formData.get("unitPrice") || "").trim();
  const unitPrice = unitPriceRaw ? Number(unitPriceRaw) : 0;
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: "Unit price must be a number ≥ 0." };

  const taxRateRaw = String(formData.get("taxRate") || "").trim();
  const taxRate = taxRateRaw ? Number(taxRateRaw) : 18;
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 28) {
    return { error: "Tax rate must be between 0 and 28." };
  }

  const defs = await db.fieldDef.findMany({
    where: { tenantId: s.tenantId, module: "products", archived: false },
  });
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

  const product = await db.product.create({
    data: {
      tenantId: s.tenantId,
      name,
      sku,
      hsn,
      unitPrice,
      taxRate,
      custom: JSON.stringify(values),
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "product.created",
    entity: "Product",
    entityId: product.id,
    actorId: s.userId,
    payload: { note: `New product: ${product.name}` },
  });

  revalidatePath("/products");
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
