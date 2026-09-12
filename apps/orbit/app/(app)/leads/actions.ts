"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { scoreLead } from "@/lib/ai";
import { getStudioConfig, isValidOption, nextOptionValue, options, defaultValue } from "@/lib/studio/config";
import { validateCustom, parseCustom, type FieldDefLite } from "@/lib/studio/validate";
import { convertLead, type ConvertResult } from "@/lib/studio/convert";
// Built in parallel by another workstream — contract: checkDuplicates(tenantId, module, values)
// → { mode: "warn" | "block" | "off", matches: { id, label }[] }. A transient tsc error here
// until that file lands is expected/acceptable.
import { checkDuplicates } from "@/lib/studio/dedupe";

// The lead_source option's CATEGORY (e.g. "marketplace") for a stored source
// value — falls back to null for values not present in the tenant's config
// (e.g. archived/legacy sources), matching scoreLead's back-compat ctx-less mode.
function sourceCategoryFor(config: Awaited<ReturnType<typeof getStudioConfig>>, source: string): string | null {
  return options(config, "lead_source").find((o) => o.value === source)?.category ?? null;
}

// (a) AI-score a single lead — persist score + reason, revalidate, emit.
export async function scoreLeadAction(leadId: string) {
  const s = await requireSession();
  const lead = await db.lead.findFirst({ where: { id: leadId, tenantId: s.tenantId } });
  if (!lead) return;

  const config = await getStudioConfig(s.tenantId);
  const { score, reason } = await scoreLead(
    {
      name: lead.name,
      company: lead.company,
      source: lead.source,
      email: lead.email,
      phone: lead.phone,
    },
    { sourceCategory: sourceCategoryFor(config, lead.source) }
  );

  await db.lead.update({ where: { id: lead.id }, data: { score, scoreReason: reason } });

  await emit({
    tenantId: s.tenantId,
    type: "lead.scored",
    entity: "Lead",
    entityId: lead.id,
    actorId: s.userId,
    payload: { note: `AI scored ${lead.name}: ${score}`, score, reason },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
}

// Score every lead that has no score yet.
export async function scoreAllUnscoredAction() {
  const s = await requireSession();
  const config = await getStudioConfig(s.tenantId);
  const unscored = await db.lead.findMany({ where: { tenantId: s.tenantId, score: null } });

  for (const lead of unscored) {
    const { score, reason } = await scoreLead(
      {
        name: lead.name,
        company: lead.company,
        source: lead.source,
        email: lead.email,
        phone: lead.phone,
      },
      { sourceCategory: sourceCategoryFor(config, lead.source) }
    );
    await db.lead.update({ where: { id: lead.id }, data: { score, scoreReason: reason } });
    await emit({
      tenantId: s.tenantId,
      type: "lead.scored",
      entity: "Lead",
      entityId: lead.id,
      actorId: s.userId,
      payload: { note: `AI scored ${lead.name}: ${score}`, score, reason },
    });
  }

  revalidatePath("/leads");
}

// (b) Advance a lead to a specific / next status.
export async function advanceStatusAction(leadId: string, status?: string) {
  const s = await requireSession();
  const lead = await db.lead.findFirst({ where: { id: leadId, tenantId: s.tenantId } });
  if (!lead) return;

  const config = await getStudioConfig(s.tenantId);

  let next = status;
  if (!next) {
    next = nextOptionValue(config, "lead_status", lead.status, ["open", "converted"]) ?? lead.status;
  }
  if (next === lead.status) return;
  if (!isValidOption(config, "lead_status", next)) return;

  await db.lead.update({ where: { id: lead.id }, data: { status: next } });

  await emit({
    tenantId: s.tenantId,
    type: "lead.status.changed",
    entity: "Lead",
    entityId: lead.id,
    actorId: s.userId,
    payload: { note: `${lead.name} → ${next}`, from: lead.status, to: next },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
}

// (c) Manually create a lead — core fields + Studio custom fields (module
// "leads"), then AI-score it immediately so it never sits unscored just
// because it wasn't captured via a marketplace/webhook source.
export async function createLeadAction(formData: FormData): Promise<{ error?: string; warning?: string } | void> {
  const s = await requireSession();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };

  const config = await getStudioConfig(s.tenantId);

  let source = String(formData.get("source") || "").trim();
  if (!source || !isValidOption(config, "lead_source", source)) {
    source = defaultValue(config, "lead_source") ?? "Manual";
  }
  const status = defaultValue(config, "lead_status") ?? "New";

  const defs = await db.fieldDef.findMany({
    where: { tenantId: s.tenantId, module: "leads", archived: false },
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

  const company = str(formData.get("company"));
  const email = str(formData.get("email"));
  const phone = str(formData.get("phone"));

  const dupe = await checkDuplicates(s.tenantId, "leads", { email, phone });
  if (dupe.mode === "block" && dupe.matches.length) {
    return { error: `Duplicate: matches ${dupe.matches[0].label}` };
  }
  const warning =
    dupe.mode === "warn" && dupe.matches.length ? `Possible duplicate of ${dupe.matches[0].label}` : undefined;

  const { score, reason } = await scoreLead(
    { name, company, source, email, phone },
    { sourceCategory: sourceCategoryFor(config, source) }
  );

  const lead = await db.lead.create({
    data: {
      tenantId: s.tenantId,
      name,
      company,
      email,
      phone,
      source,
      status,
      ownerId: s.userId,
      custom: JSON.stringify(values),
      score,
      scoreReason: reason,
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "lead.created",
    entity: "Lead",
    entityId: lead.id,
    actorId: s.userId,
    payload: { note: `New lead: ${lead.name}` },
  });

  revalidatePath("/leads");

  // Non-blocking: CreateLeadForm.tsx (not owned by this change) doesn't render
  // `warning` yet — surfaced here so it's a one-line wire-up when it does.
  if (warning) return { warning };
}

// (d) Convert a Lead into an Account + Contact + Opportunity (see lib/studio/convert.ts).
export async function convertLeadAction(id: string): Promise<ConvertResult> {
  const s = await requireSession();
  if (!(await can(s, "leads", "write"))) return { error: "Not authorized" };

  const result = await convertLead(s.tenantId, s.userId, id);

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
  revalidatePath("/opportunities");
  revalidatePath("/accounts");

  return result;
}

// System (real-column) fields the Universal Record Page is allowed to
// inline-edit on a Lead. Everything else either isn't user-editable
// (id/timestamps/conversion linkage/score) or lives in `custom` (c_* codes,
// handled separately below).
const ALLOWED_SYSTEM_FIELDS = new Set([
  "name",
  "company",
  "email",
  "phone",
  "source",
  "status",
  "followUpAt",
  "followUpType",
  "lostReason",
]);

// (e) Universal Record Page — inline single-field edit. formData: { id, field, value }.
// `field` is either an ALLOWED_SYSTEM_FIELDS name or a custom-field code (c_*).
// Converted leads are locked: a lead that has gone through conversion is a
// historical record from that point on, so ANY field edit is rejected —
// not just status.
export async function updateLeadAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "leads", "write"))) return { error: "Not authorized" };

  const id = String(formData.get("id") || "");
  const field = String(formData.get("field") || "");
  const rawValue = formData.get("value");
  const value = rawValue == null ? "" : String(rawValue);
  if (!id || !field) return { error: "Missing field" };

  const lead = await db.lead.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!lead) return { error: "Lead not found" };
  if (lead.convertedAt) return { error: "Converted leads are locked" };

  const config = await getStudioConfig(s.tenantId);

  if (field.startsWith("c_")) {
    const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "leads", archived: false } });
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
    const existingValues = parseCustom(lead.custom);

    // Single-field submission: only `field` is present in `submitted`, every
    // other def falls back to existingValues inside validateCustom, so the
    // returned `values` is the full, merged custom object ready to persist.
    const { values, issues } = validateCustom({ [field]: value }, fieldDefs, { existingValues, picklistValues });
    if (issues.length) return { error: issues.map((i) => i.message).join("; ") };

    await db.lead.update({ where: { id: lead.id }, data: { custom: JSON.stringify(values), updatedById: s.userId } });
  } else {
    if (!ALLOWED_SYSTEM_FIELDS.has(field)) return { error: "Field is not editable" };

    if (field === "name" && !value.trim()) return { error: "Name is required." };
    if (field === "source" && !isValidOption(config, "lead_source", value)) {
      return { error: "Invalid source option" };
    }
    if (field === "status" && !isValidOption(config, "lead_status", value)) {
      return { error: "Invalid status option" };
    }
    if (field === "followUpType" && value && !isValidOption(config, "follow_up_type", value)) {
      return { error: "Invalid follow-up type option" };
    }
    if (field === "lostReason" && value && !isValidOption(config, "lost_reason", value)) {
      return { error: "Invalid lost reason option" };
    }
    let followUpAtDate: Date | null | undefined;
    if (field === "followUpAt") {
      const trimmed = value.trim();
      if (!trimmed) {
        followUpAtDate = null;
      } else {
        const d = new Date(trimmed);
        if (Number.isNaN(d.getTime())) return { error: "Follow-up date must be a valid date." };
        followUpAtDate = d;
      }
    }

    const data: Record<string, string | Date | null> = {};
    if (field === "name") data.name = value.trim();
    else if (field === "company") data.company = value.trim() || null;
    else if (field === "email") data.email = value.trim() || null;
    else if (field === "phone") data.phone = value.trim() || null;
    else if (field === "source") data.source = value;
    else if (field === "status") data.status = value;
    else if (field === "followUpAt") data.followUpAt = followUpAtDate ?? null;
    else if (field === "followUpType") data.followUpType = value || null;
    else if (field === "lostReason") data.lostReason = value || null;
    data.updatedById = s.userId;

    await db.lead.update({ where: { id: lead.id }, data });
  }

  await emit({
    tenantId: s.tenantId,
    type: "lead.updated",
    entity: "Lead",
    entityId: lead.id,
    actorId: s.userId,
    payload: { field },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
}

// (f) Universal Record Page — add a freeform Note activity. Bound to
// `relatedTo` (e.g. `Lead:<id>`) by the caller via .bind(null, relatedTo) so
// the client TimelineComposer only ever has to supply the note text.
export async function addNoteAction(
  relatedTo: string,
  formData: FormData
): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "leads", "write"))) return { error: "Not authorized" };

  const note = String(formData.get("note") || "").trim();
  if (!note) return { error: "Note cannot be empty." };

  const leadId = relatedTo.startsWith("Lead:") ? relatedTo.slice("Lead:".length) : relatedTo;
  const lead = await db.lead.findFirst({ where: { id: leadId, tenantId: s.tenantId } });
  if (!lead) return { error: "Lead not found" };

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
    entity: "Lead",
    entityId: lead.id,
    actorId: s.userId,
    payload: { note: note.slice(0, 120) },
  });

  revalidatePath(`/leads/${lead.id}`);
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
