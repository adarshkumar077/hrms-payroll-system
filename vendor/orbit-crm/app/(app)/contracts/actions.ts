"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { getStudioConfig, isValidOption, defaultValue } from "@/lib/studio/config";
import { validateCustom, parseCustom, type FieldDefLite } from "@/lib/studio/validate";
import { allocateNumber } from "@/lib/studio/numbering";

// Manually create a contract — core fields + Studio custom fields (module
// "contracts"). Numbered via lib/studio/numbering.ts (AMC-{FY}-{seq:4}).
export async function createContractAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "contracts", "write"))) return { error: "Not authorized" };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };

  const accountId = str(formData.get("accountId"));
  if (!accountId) return { error: "Account is required." };
  const account = await db.account.findFirst({ where: { id: accountId, tenantId: s.tenantId } });
  if (!account) return { error: "Selected account not found." };

  const config = await getStudioConfig(s.tenantId);

  const submittedType = str(formData.get("type"));
  const type = submittedType ?? defaultValue(config, "contract_type");
  if (!type || !isValidOption(config, "contract_type", type)) return { error: "Invalid contract type." };

  const submittedStatus = str(formData.get("status"));
  const status = submittedStatus ?? defaultValue(config, "contract_status");
  if (!status || !isValidOption(config, "contract_status", status)) return { error: "Invalid contract status." };

  const startRaw = str(formData.get("startDate"));
  const endRaw = str(formData.get("endDate"));
  if (!startRaw || !endRaw) return { error: "Start and end date are required." };
  const startDate = new Date(startRaw);
  const endDate = new Date(endRaw);
  if (Number.isNaN(startDate.getTime())) return { error: "Start date is not a valid date." };
  if (Number.isNaN(endDate.getTime())) return { error: "End date is not a valid date." };
  if (startDate >= endDate) return { error: "Start date must be before end date." };

  const value = numberField(formData.get("value"), 0);
  if (value === null || value < 0) return { error: "Value must be a number ≥ 0." };

  const visitQuota = intField(formData.get("visitQuota"), 0);
  if (visitQuota === null || visitQuota < 0) return { error: "Visit quota must be a whole number ≥ 0." };

  const renewalNoticeDays = intField(formData.get("renewalNoticeDays"), 30);
  if (renewalNoticeDays === null || renewalNoticeDays < 0) return { error: "Renewal notice days must be a whole number ≥ 0." };

  const notes = str(formData.get("notes"));

  const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "contracts", archived: false } });
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

  // Atomic tenant-scoped contract number (AMC-{FY}-{seq:4}).
  const number = await allocateNumber(s.tenantId, "contract");

  const contract = await db.contract.create({
    data: {
      tenantId: s.tenantId,
      number,
      name,
      accountId,
      type,
      status,
      startDate,
      endDate,
      value,
      visitQuota,
      renewalNoticeDays,
      notes,
      custom: JSON.stringify(values),
      updatedById: s.userId,
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "contract.created",
    entity: "Contract",
    entityId: contract.id,
    actorId: s.userId,
    payload: { note: `New contract: ${number} — ${name}` },
  });

  revalidatePath("/contracts");
  redirect(`/contracts/${contract.id}`);
}

// System (real-column) fields the Universal Record Page is allowed to
// inline-edit on a Contract. `number`/`accountId` are set at creation only
// (not inline-editable here), same convention as Ticket.accountId being the
// exception, not the rule — see ALLOWED_SYSTEM_FIELDS in ../tickets/actions.ts.
const ALLOWED_SYSTEM_FIELDS = new Set([
  "name",
  "type",
  "status",
  "startDate",
  "endDate",
  "value",
  "visitQuota",
  "renewalNoticeDays",
  "notes",
]);

// Universal Record Page — inline single-field edit. formData: { id, field, value }.
// `field` is either an ALLOWED_SYSTEM_FIELDS name or a custom-field code (c_*).
export async function updateContractAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "contracts", "write"))) return { error: "Not authorized" };

  const id = String(formData.get("id") || "");
  const field = String(formData.get("field") || "");
  const rawValue = formData.get("value");
  const value = rawValue == null ? "" : String(rawValue);
  if (!id || !field) return { error: "Missing field" };

  const contract = await db.contract.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!contract) return { error: "Contract not found" };

  const config = await getStudioConfig(s.tenantId);

  if (field.startsWith("c_")) {
    const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "contracts", archived: false } });
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
    const existingValues = parseCustom(contract.custom);

    const { values, issues } = validateCustom({ [field]: value }, fieldDefs, { existingValues, picklistValues });
    if (issues.length) return { error: issues.map((i) => i.message).join("; ") };

    await db.contract.update({ where: { id: contract.id }, data: { custom: JSON.stringify(values), updatedById: s.userId } });
  } else {
    if (!ALLOWED_SYSTEM_FIELDS.has(field)) return { error: "Field is not editable" };

    const data: Record<string, string | Date | number | null> = {};

    if (field === "name") {
      const trimmed = value.trim();
      if (!trimmed) return { error: "Name is required." };
      data.name = trimmed;
    } else if (field === "type") {
      if (!isValidOption(config, "contract_type", value)) return { error: "Invalid contract type." };
      data.type = value;
    } else if (field === "status") {
      if (!isValidOption(config, "contract_status", value)) return { error: "Invalid contract status." };
      data.status = value;
    } else if (field === "startDate" || field === "endDate") {
      const trimmed = value.trim();
      if (!trimmed) return { error: `${field === "startDate" ? "Start" : "End"} date is required.` };
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) return { error: "Not a valid date." };
      const otherStart = field === "endDate" ? contract.startDate : d;
      const otherEnd = field === "startDate" ? contract.endDate : d;
      if (new Date(otherStart) >= new Date(otherEnd)) return { error: "Start date must be before end date." };
      data[field] = d;
    } else if (field === "value") {
      const n = numberField(value, null);
      if (n === null || n < 0) return { error: "Value must be a number ≥ 0." };
      data.value = n;
    } else if (field === "visitQuota") {
      const n = intField(value, null);
      if (n === null || n < 0) return { error: "Visit quota must be a whole number ≥ 0." };
      data.visitQuota = n;
    } else if (field === "renewalNoticeDays") {
      const n = intField(value, null);
      if (n === null || n < 0) return { error: "Renewal notice days must be a whole number ≥ 0." };
      data.renewalNoticeDays = n;
    } else if (field === "notes") {
      data.notes = value.trim() || null;
    }
    data.updatedById = s.userId;

    await db.contract.update({ where: { id: contract.id }, data });
  }

  await emit({
    tenantId: s.tenantId,
    type: "contract.updated",
    entity: "Contract",
    entityId: contract.id,
    actorId: s.userId,
    payload: { field },
  });

  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contract.id}`);
}

// Universal Record Page — add a freeform Note activity. Bound to `relatedTo`
// (e.g. `Contract:<id>`) by the caller via .bind(null, relatedTo), same
// pattern as addTicketNoteAction (../tickets/actions.ts).
export async function addContractNoteAction(
  relatedTo: string,
  formData: FormData
): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "contracts", "write"))) return { error: "Not authorized" };

  const note = String(formData.get("note") || "").trim();
  if (!note) return { error: "Note cannot be empty." };

  const contractId = relatedTo.startsWith("Contract:") ? relatedTo.slice("Contract:".length) : relatedTo;
  const contract = await db.contract.findFirst({ where: { id: contractId, tenantId: s.tenantId } });
  if (!contract) return { error: "Contract not found" };

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
    entity: "Contract",
    entityId: contract.id,
    actorId: s.userId,
    payload: { note: note.slice(0, 120) },
  });

  revalidatePath(`/contracts/${contract.id}`);
}

function str(v: FormDataEntryValue | null): string | null {
  const t = String(v || "").trim();
  return t || null;
}

// Parses a numeric field; empty input falls back to `fallback` (which may be
// null to signal "required"), anything non-finite returns null (invalid).
function numberField(v: FormDataEntryValue | string | null, fallback: number | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function intField(v: FormDataEntryValue | string | null, fallback: number | null): number | null {
  const n = numberField(v, fallback);
  return n === null ? null : Math.trunc(n);
}

// Pull `custom_<code>` entries off FormData per FieldDef.type — same helper as
// ../tickets/actions.ts's collectCustomSubmission.
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

// Active option values keyed by picklistId — same helper as
// ../tickets/actions.ts's picklistValuesFor.
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
