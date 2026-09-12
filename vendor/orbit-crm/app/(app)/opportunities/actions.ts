"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { getStudioConfig, nextOptionValue, optionMeta, isValidOption, defaultValue } from "@/lib/studio/config";
import { validateCustom, parseCustom, type FieldDefLite } from "@/lib/studio/validate";

// Move an opportunity to the next stage in the flow.
export async function moveStageAction(oppId: string) {
  const s = await requireSession();
  const opp = await db.opportunity.findFirst({ where: { id: oppId, tenantId: s.tenantId } });
  if (!opp) return;

  const config = await getStudioConfig(s.tenantId);
  const next = nextOptionValue(config, "opportunity_stage", opp.stage, ["open", "won"]);
  if (!next || !isValidOption(config, "opportunity_stage", next)) return; // already won/lost or unknown

  const probability = Number(optionMeta(config, "opportunity_stage", next).probability ?? 0);

  await db.opportunity.update({
    where: { id: opp.id },
    data: { stage: next, probability },
  });

  await emit({
    tenantId: s.tenantId,
    type: "opportunity.stage.changed",
    entity: "Opportunity",
    entityId: opp.id,
    actorId: s.userId,
    payload: { note: `${opp.name} → ${next}`, from: opp.stage, to: next },
  });

  revalidatePath("/opportunities");
}

// Manually create an opportunity — core fields + Studio custom fields
// (module "opportunities"). Stage/probability come from the tenant's
// configured default stage, same as a fresh lead lands on the default status.
export async function createOpportunityAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireSession();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };

  const amountRaw = String(formData.get("amount") || "").trim();
  const amount = amountRaw ? Number(amountRaw) : 0;
  if (!Number.isFinite(amount) || amount < 0) return { error: "Amount must be a number ≥ 0." };

  const accountId = str(formData.get("accountId"));
  if (accountId) {
    const account = await db.account.findFirst({ where: { id: accountId, tenantId: s.tenantId } });
    if (!account) return { error: "Selected account not found." };
  }

  const config = await getStudioConfig(s.tenantId);
  const stage = defaultValue(config, "opportunity_stage") ?? "Qualification";
  const probability = Number(optionMeta(config, "opportunity_stage", stage).probability ?? 0);

  const closeDateRaw = str(formData.get("closeDate"));
  const closeDateParsed = closeDateRaw ? new Date(closeDateRaw) : null;
  const closeDate = closeDateParsed && !Number.isNaN(closeDateParsed.getTime()) ? closeDateParsed : null;

  const defs = await db.fieldDef.findMany({
    where: { tenantId: s.tenantId, module: "opportunities", archived: false },
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

  const opp = await db.opportunity.create({
    data: {
      tenantId: s.tenantId,
      name,
      amount,
      accountId,
      stage,
      probability,
      closeDate,
      ownerId: s.userId,
      custom: JSON.stringify(values),
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "opportunity.created",
    entity: "Opportunity",
    entityId: opp.id,
    actorId: s.userId,
    payload: { note: `New deal: ${opp.name}` },
  });

  revalidatePath("/opportunities");
}

// System (real-column) fields the Universal Record Page is allowed to
// inline-edit on an Opportunity. Everything else is either not user-editable
// (id/timestamps/probability-derived-from-stage) or lives in `custom` (c_*
// codes, handled separately below).
const ALLOWED_SYSTEM_FIELDS = new Set([
  "name",
  "amount",
  "closeDate",
  "accountId",
  "stage",
  "followUpAt",
  "followUpType",
  "lostReason",
]);

// Universal Record Page — inline single-field edit. formData: { id, field, value }.
// `field` is either an ALLOWED_SYSTEM_FIELDS name or a custom-field code (c_*).
// Unlike leads (locked after conversion), deals stay editable after they're
// won/lost in v1 — there's no lock semantics here on purpose.
export async function updateOpportunityAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "opportunities", "write"))) return { error: "Not authorized" };

  const id = String(formData.get("id") || "");
  const field = String(formData.get("field") || "");
  const rawValue = formData.get("value");
  const value = rawValue == null ? "" : String(rawValue);
  if (!id || !field) return { error: "Missing field" };

  const opp = await db.opportunity.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!opp) return { error: "Opportunity not found" };

  const config = await getStudioConfig(s.tenantId);

  if (field.startsWith("c_")) {
    const defs = await db.fieldDef.findMany({
      where: { tenantId: s.tenantId, module: "opportunities", archived: false },
    });
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
    const existingValues = parseCustom(opp.custom);

    // Single-field submission: only `field` is present in `submitted`, every
    // other def falls back to existingValues inside validateCustom, so the
    // returned `values` is the full, merged custom object ready to persist.
    const { values, issues } = validateCustom({ [field]: value }, fieldDefs, { existingValues, picklistValues });
    if (issues.length) return { error: issues.map((i) => i.message).join("; ") };

    await db.opportunity.update({
      where: { id: opp.id },
      data: { custom: JSON.stringify(values), updatedById: s.userId },
    });
  } else {
    if (!ALLOWED_SYSTEM_FIELDS.has(field)) return { error: "Field is not editable" };

    const data: {
      name?: string;
      amount?: number;
      closeDate?: Date | null;
      accountId?: string | null;
      stage?: string;
      probability?: number;
      followUpAt?: Date | null;
      followUpType?: string | null;
      lostReason?: string | null;
      updatedById?: string;
    } = {};

    if (field === "name") {
      const trimmed = value.trim();
      if (!trimmed) return { error: "Name is required." };
      data.name = trimmed;
    } else if (field === "amount") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return { error: "Amount must be a number ≥ 0." };
      data.amount = n;
    } else if (field === "closeDate") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.closeDate = null;
      } else {
        const d = new Date(trimmed);
        if (Number.isNaN(d.getTime())) return { error: "Close date must be a valid date (YYYY-MM-DD)." };
        data.closeDate = d;
      }
    } else if (field === "accountId") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.accountId = null;
      } else {
        const account = await db.account.findFirst({ where: { id: trimmed, tenantId: s.tenantId } });
        if (!account) return { error: "Selected account not found." };
        data.accountId = trimmed;
      }
    } else if (field === "stage") {
      if (!isValidOption(config, "opportunity_stage", value)) return { error: "Invalid stage option" };
      data.stage = value;
      // Stage changes always re-derive probability from the tenant's Studio
      // config — keeps the two in sync the same way moveStageAction does.
      data.probability = Number(optionMeta(config, "opportunity_stage", value).probability ?? 0);
    } else if (field === "followUpAt") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.followUpAt = null;
      } else {
        const d = new Date(trimmed);
        if (Number.isNaN(d.getTime())) return { error: "Follow-up date must be a valid date." };
        data.followUpAt = d;
      }
    } else if (field === "followUpType") {
      if (value && !isValidOption(config, "follow_up_type", value)) return { error: "Invalid follow-up type option" };
      data.followUpType = value || null;
    } else if (field === "lostReason") {
      if (value && !isValidOption(config, "lost_reason", value)) return { error: "Invalid lost reason option" };
      data.lostReason = value || null;
    }

    data.updatedById = s.userId;
    await db.opportunity.update({ where: { id: opp.id }, data });
  }

  await emit({
    tenantId: s.tenantId,
    type: "opportunity.updated",
    entity: "Opportunity",
    entityId: opp.id,
    actorId: s.userId,
    payload: { field },
  });

  revalidatePath("/opportunities");
  revalidatePath(`/opportunities/${opp.id}`);
}

// Universal Record Page — add a freeform Note activity. Bound to `relatedTo`
// (e.g. `Opportunity:<id>`) by the caller via .bind(null, relatedTo) so the
// client TimelineComposer only ever has to supply the note text. Mirrors
// leads' addNoteAction (app/(app)/leads/actions.ts).
export async function addOpportunityNoteAction(
  relatedTo: string,
  formData: FormData
): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "opportunities", "write"))) return { error: "Not authorized" };

  const note = String(formData.get("note") || "").trim();
  if (!note) return { error: "Note cannot be empty." };

  const oppId = relatedTo.startsWith("Opportunity:") ? relatedTo.slice("Opportunity:".length) : relatedTo;
  const opp = await db.opportunity.findFirst({ where: { id: oppId, tenantId: s.tenantId } });
  if (!opp) return { error: "Opportunity not found" };

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
    entity: "Opportunity",
    entityId: opp.id,
    actorId: s.userId,
    payload: { note: note.slice(0, 120) },
  });

  revalidatePath(`/opportunities/${opp.id}`);
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
