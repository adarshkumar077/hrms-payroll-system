"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { validateCustom, type FieldDefLite } from "@/lib/studio/validate";
// Built in parallel by another workstream — contract: checkDuplicates(tenantId, module, values)
// → { mode: "warn" | "block" | "off", matches: { id, label }[] }. Today it returns "off" for
// every module except "leads" (see lib/studio/dedupe.ts), but calling it here future-proofs
// contacts for when v1 matching lands — zero-cost until then.
import { checkDuplicates } from "@/lib/studio/dedupe";

// Manually create a contact — core fields + Studio custom fields (module "contacts").
export async function createContactAction(formData: FormData): Promise<{ error?: string; warning?: string } | void> {
  const s = await requireSession();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };

  const accountId = str(formData.get("accountId"));
  if (accountId) {
    const account = await db.account.findFirst({ where: { id: accountId, tenantId: s.tenantId } });
    if (!account) return { error: "Selected account not found." };
  }

  const email = str(formData.get("email"));
  const phone = str(formData.get("phone"));
  const title = str(formData.get("title"));

  const defs = await db.fieldDef.findMany({
    where: { tenantId: s.tenantId, module: "contacts", archived: false },
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

  const dupe = await checkDuplicates(s.tenantId, "contacts", { email, phone });
  if (dupe.mode === "block" && dupe.matches.length) {
    return { error: `Duplicate: matches ${dupe.matches[0].label}` };
  }
  const warning =
    dupe.mode === "warn" && dupe.matches.length ? `Possible duplicate of ${dupe.matches[0].label}` : undefined;

  const contact = await db.contact.create({
    data: {
      tenantId: s.tenantId,
      name,
      accountId,
      email,
      phone,
      title,
      custom: JSON.stringify(values),
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "contact.created",
    entity: "Contact",
    entityId: contact.id,
    actorId: s.userId,
    payload: { note: `New contact: ${contact.name}` },
  });

  revalidatePath("/contacts");

  // Non-blocking: CreateContactForm.tsx renders `warning` the same way
  // CreateLeadForm.tsx does — the record is already created either way.
  if (warning) return { warning };
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
