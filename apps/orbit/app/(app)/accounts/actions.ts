"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { validateCustom, parseCustom, type FieldDefLite } from "@/lib/studio/validate";

// Manually create an account — core fields + Studio custom fields (module "accounts").
export async function createAccountAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };

  const defs = await db.fieldDef.findMany({
    where: { tenantId: s.tenantId, module: "accounts", archived: false },
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

  const account = await db.account.create({
    data: {
      tenantId: s.tenantId,
      name,
      industry: str(formData.get("industry")),
      city: str(formData.get("city")),
      state: str(formData.get("state")),
      gstin: str(formData.get("gstin")),
      email: str(formData.get("email")),
      phone: str(formData.get("phone")),
      custom: JSON.stringify(values),
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "account.created",
    entity: "Account",
    entityId: account.id,
    actorId: s.userId,
    payload: { note: `New account: ${account.name}` },
  });

  revalidatePath("/accounts");
}

function str(v: FormDataEntryValue | null): string | null {
  const t = String(v || "").trim();
  return t || null;
}

// System (real-column) fields the Universal Record Page is allowed to
// inline-edit on an Account. Everything else either isn't user-editable
// (id/timestamps) or lives in `custom` (c_* codes, handled separately below).
const ALLOWED_SYSTEM_FIELDS = new Set(["name", "industry", "phone", "email", "gstin", "address", "city", "state"]);

const GSTIN_RE = /^[0-9]{2}[A-Z0-9]{13}$/;

// Universal Record Page — inline single-field edit. formData: { id, field, value }.
// `field` is either an ALLOWED_SYSTEM_FIELDS name or a custom-field code (c_*).
export async function updateAccountAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "accounts", "write"))) return { error: "Not authorized" };

  const id = String(formData.get("id") || "");
  const field = String(formData.get("field") || "");
  const rawValue = formData.get("value");
  const value = rawValue == null ? "" : String(rawValue);
  if (!id || !field) return { error: "Missing field" };

  const account = await db.account.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!account) return { error: "Account not found" };

  if (field.startsWith("c_")) {
    const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "accounts", archived: false } });
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
    const existingValues = parseCustom(account.custom);

    // Single-field submission: only `field` is present in `submitted`, every
    // other def falls back to existingValues inside validateCustom, so the
    // returned `values` is the full, merged custom object ready to persist.
    const { values, issues } = validateCustom({ [field]: value }, fieldDefs, { existingValues, picklistValues });
    if (issues.length) return { error: issues.map((i) => i.message).join("; ") };

    await db.account.update({ where: { id: account.id }, data: { custom: JSON.stringify(values), updatedById: s.userId } });
  } else {
    if (!ALLOWED_SYSTEM_FIELDS.has(field)) return { error: "Field is not editable" };

    if (field === "name" && !value.trim()) return { error: "Name is required." };

    const data: Record<string, string | null> = {};
    if (field === "name") data.name = value.trim();
    else if (field === "industry") data.industry = value.trim() || null;
    else if (field === "phone") data.phone = value.trim() || null;
    else if (field === "email") data.email = value.trim() || null;
    else if (field === "address") data.address = value.trim() || null;
    else if (field === "city") data.city = value.trim() || null;
    else if (field === "state") data.state = value.trim() || null;
    else if (field === "gstin") {
      const gstin = value.trim().toUpperCase();
      if (gstin && !GSTIN_RE.test(gstin)) return { error: "GSTIN must be 15 characters" };
      data.gstin = gstin || null;
    }
    data.updatedById = s.userId;

    await db.account.update({ where: { id: account.id }, data });
  }

  await emit({
    tenantId: s.tenantId,
    type: "account.updated",
    entity: "Account",
    entityId: account.id,
    actorId: s.userId,
    payload: { field },
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${account.id}`);
}

// Universal Record Page — add a freeform Note activity. Bound to `relatedTo`
// (e.g. `Account:<id>`) by the caller via .bind(null, relatedTo) so the
// client TimelineComposer only ever has to supply the note text.
export async function addAccountNoteAction(relatedTo: string, formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "accounts", "write"))) return { error: "Not authorized" };

  const note = String(formData.get("note") || "").trim();
  if (!note) return { error: "Note cannot be empty." };

  const accountId = relatedTo.startsWith("Account:") ? relatedTo.slice("Account:".length) : relatedTo;
  const account = await db.account.findFirst({ where: { id: accountId, tenantId: s.tenantId } });
  if (!account) return { error: "Account not found" };

  await db.activity.create({
    data: {
      tenantId: s.tenantId,
      type: "Note",
      subject: note.slice(0, 120),
      relatedTo,
      ownerId: s.userId,
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "activity.created",
    entity: "Account",
    entityId: account.id,
    actorId: s.userId,
    payload: { note: note.slice(0, 120) },
  });

  revalidatePath(`/accounts/${account.id}`);
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
