"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { getStudioConfig, isValidOption, defaultValue, valuesByCategory } from "@/lib/studio/config";
import { validateCustom, parseCustom, type FieldDefLite } from "@/lib/studio/validate";
import { computeSlaDueAt } from "@/lib/contracts-automation";

// Manually create a ticket — core fields + Studio custom fields (module "tickets").
export async function createTicketAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  const subject = String(formData.get("subject") || "").trim();
  if (!subject) return { error: "Subject is required." };

  const config = await getStudioConfig(s.tenantId);

  const submittedPriority = str(formData.get("priority"));
  const priority = submittedPriority ?? defaultValue(config, "ticket_priority");
  if (!priority || !isValidOption(config, "ticket_priority", priority)) {
    return { error: "Invalid priority option" };
  }

  const status = defaultValue(config, "ticket_status");
  if (!status) return { error: "No ticket status is configured." };

  const accountId = str(formData.get("accountId"));
  if (accountId) {
    const account = await db.account.findFirst({ where: { id: accountId, tenantId: s.tenantId } });
    if (!account) return { error: "Selected account not found." };
  }

  const submittedType = str(formData.get("typeKey"));
  const typeKey = submittedType ?? defaultValue(config, "ticket_type");
  if (!typeKey || !isValidOption(config, "ticket_type", typeKey)) {
    return { error: "Invalid type option" };
  }

  const contractId = str(formData.get("contractId"));
  if (contractId) {
    const contract = await db.contract.findFirst({ where: { id: contractId, tenantId: s.tenantId } });
    if (!contract) return { error: "Selected contract not found." };
  }

  const installedProductId = str(formData.get("installedProductId"));
  if (installedProductId) {
    const installed = await db.installedProduct.findFirst({ where: { id: installedProductId, tenantId: s.tenantId } });
    if (!installed) return { error: "Selected installed product not found." };
  }

  const chargesRaw = str(formData.get("charges"));
  const charges = chargesRaw ? Number(chargesRaw) : 0;
  if (!Number.isFinite(charges) || charges < 0) return { error: "Charges must be a number ≥ 0." };

  // SLA select is hours-from-now (4/8/24/48), the literal "none" (explicit
  // opt-out — no SLA at all), or omitted/empty (the form's new default,
  // "Default (by priority)") — computed to an absolute Date here rather than
  // trusting a client-submitted timestamp. str() folds "" to null, so the
  // omitted/empty case and "not submitted" are the same branch below.
  //
  // C5: the "Default (by priority)" branch is a genuine behavior change, not
  // a zero-change refactor — tickets created without an explicit SLA choice
  // used to get slaDueAt=null always; now they get the tenant's configured
  // per-priority SLA (Studio → SLA hours, ticket_priority meta) via
  // computeSlaDueAt. "No SLA" remains an explicit, always-honored opt-out.
  const slaHours = str(formData.get("slaHours"));
  let slaDueAt: Date | null;
  if (slaHours === "none") {
    slaDueAt = null;
  } else if (slaHours) {
    const hours = Number(slaHours);
    if (!Number.isFinite(hours) || hours <= 0) return { error: "Invalid SLA option." };
    slaDueAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  } else {
    slaDueAt = computeSlaDueAt(config, priority, new Date());
  }

  const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "tickets", archived: false } });
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

  const ticket = await db.ticket.create({
    data: {
      tenantId: s.tenantId,
      subject,
      priority,
      status,
      accountId,
      slaDueAt,
      typeKey,
      contractId,
      installedProductId,
      charges,
      ownerId: s.userId,
      custom: JSON.stringify(values),
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "ticket.created",
    entity: "Ticket",
    entityId: ticket.id,
    actorId: s.userId,
    payload: { note: `New ticket: ${ticket.subject}` },
  });

  revalidatePath("/tickets");
}

export async function changeTicketStatusAction(ticketId: string, status: string) {
  const s = await requireSession();
  const config = await getStudioConfig(s.tenantId);
  if (!isValidOption(config, "ticket_status", status)) return;

  const ticket = await db.ticket.findFirst({ where: { id: ticketId, tenantId: s.tenantId } });
  if (!ticket || ticket.status === status) return;

  await db.ticket.update({ where: { id: ticket.id }, data: { status } });

  await emit({
    tenantId: s.tenantId,
    type: "ticket.status.changed",
    entity: "Ticket",
    entityId: ticket.id,
    actorId: s.userId,
    payload: { note: `${ticket.subject} → ${status}`, from: ticket.status, to: status },
  });

  revalidatePath("/tickets");
}

// System (real-column) fields the Universal Record Page is allowed to
// inline-edit on a Ticket. Everything else (id/timestamps/ownerId) either
// isn't user-editable here or lives in `custom` (c_* codes, handled below).
const ALLOWED_SYSTEM_FIELDS = new Set([
  "subject",
  "priority",
  "status",
  "accountId",
  "slaDueAt",
  "typeKey",
  "contractId",
  "installedProductId",
  "charges",
]);

// Universal Record Page — inline single-field edit. formData: { id, field, value }.
// `field` is either an ALLOWED_SYSTEM_FIELDS name or a custom-field code (c_*).
export async function updateTicketAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "tickets", "write"))) return { error: "Not authorized" };

  const id = String(formData.get("id") || "");
  const field = String(formData.get("field") || "");
  const rawValue = formData.get("value");
  const value = rawValue == null ? "" : String(rawValue);
  if (!id || !field) return { error: "Missing field" };

  const ticket = await db.ticket.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!ticket) return { error: "Ticket not found" };

  const config = await getStudioConfig(s.tenantId);

  if (field.startsWith("c_")) {
    const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "tickets", archived: false } });
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
    const existingValues = parseCustom(ticket.custom);

    // Single-field submission: only `field` is present in `submitted`, every
    // other def falls back to existingValues inside validateCustom, so the
    // returned `values` is the full, merged custom object ready to persist.
    const { values, issues } = validateCustom({ [field]: value }, fieldDefs, { existingValues, picklistValues });
    if (issues.length) return { error: issues.map((i) => i.message).join("; ") };

    await db.ticket.update({ where: { id: ticket.id }, data: { custom: JSON.stringify(values), updatedById: s.userId } });
  } else {
    if (!ALLOWED_SYSTEM_FIELDS.has(field)) return { error: "Field is not editable" };

    const data: Record<string, string | number | Date | null> = {};

    if (field === "subject") {
      const trimmed = value.trim();
      if (!trimmed) return { error: "Subject is required." };
      data.subject = trimmed;
    } else if (field === "priority") {
      if (!isValidOption(config, "ticket_priority", value)) return { error: "Invalid priority option" };
      data.priority = value;
    } else if (field === "status") {
      if (!isValidOption(config, "ticket_status", value)) return { error: "Invalid status option" };
      data.status = value;
    } else if (field === "accountId") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.accountId = null;
      } else {
        const account = await db.account.findFirst({ where: { id: trimmed, tenantId: s.tenantId } });
        if (!account) return { error: "Account not found" };
        data.accountId = trimmed;
      }
    } else if (field === "slaDueAt") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.slaDueAt = null;
      } else {
        const d = new Date(trimmed);
        if (Number.isNaN(d.getTime())) return { error: "SLA due date is not a valid date" };
        data.slaDueAt = d;
      }
    } else if (field === "typeKey") {
      if (!isValidOption(config, "ticket_type", value)) return { error: "Invalid type option" };
      data.typeKey = value;
    } else if (field === "contractId") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.contractId = null;
      } else {
        const contract = await db.contract.findFirst({ where: { id: trimmed, tenantId: s.tenantId } });
        if (!contract) return { error: "Contract not found" };
        data.contractId = trimmed;
      }
    } else if (field === "installedProductId") {
      const trimmed = value.trim();
      if (!trimmed) {
        data.installedProductId = null;
      } else {
        const installed = await db.installedProduct.findFirst({ where: { id: trimmed, tenantId: s.tenantId } });
        if (!installed) return { error: "Installed product not found" };
        data.installedProductId = trimmed;
      }
    } else if (field === "charges") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) return { error: "Charges must be a number ≥ 0." };
      data.charges = n;
    }
    data.updatedById = s.userId;

    await db.ticket.update({ where: { id: ticket.id }, data });
  }

  await emit({
    tenantId: s.tenantId,
    type: "ticket.updated",
    entity: "Ticket",
    entityId: ticket.id,
    actorId: s.userId,
    payload: { field },
  });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticket.id}`);
}

// Post-resolution feedback (feedback text + 1-5 rating). Only allowed once
// the ticket has reached a "closed" category status (ticket_status picklist
// — see lib/studio/defaults.ts: Resolved/Closed) so the block only appears/
// saves after the support cycle is actually done.
export async function saveTicketFeedbackAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "tickets", "write"))) return { error: "Not authorized" };

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing ticket id" };

  const ticket = await db.ticket.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!ticket) return { error: "Ticket not found" };

  const config = await getStudioConfig(s.tenantId);
  const closedValues = valuesByCategory(config, "ticket_status", "closed");
  if (!closedValues.includes(ticket.status)) {
    return { error: "Feedback can only be recorded once the ticket is closed." };
  }

  const feedback = str(formData.get("feedback"));

  const ratingRaw = String(formData.get("rating") || "").trim();
  const rating = Number(ratingRaw);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Rating must be a whole number between 1 and 5." };
  }

  await db.ticket.update({
    where: { id: ticket.id },
    data: { feedback, feedbackRating: rating, updatedById: s.userId },
  });

  await emit({
    tenantId: s.tenantId,
    type: "ticket.feedback",
    entity: "Ticket",
    entityId: ticket.id,
    actorId: s.userId,
    payload: { note: `Feedback recorded (${rating}/5)`, rating },
  });

  revalidatePath(`/tickets/${ticket.id}`);
}

// Universal Record Page — add a freeform Note activity. Bound to `relatedTo`
// (e.g. `Ticket:<id>`) by the caller via .bind(null, relatedTo) so the client
// TimelineComposer only ever has to supply the note text.
export async function addTicketNoteAction(
  relatedTo: string,
  formData: FormData
): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "tickets", "write"))) return { error: "Not authorized" };

  const note = String(formData.get("note") || "").trim();
  if (!note) return { error: "Note cannot be empty." };

  const ticketId = relatedTo.startsWith("Ticket:") ? relatedTo.slice("Ticket:".length) : relatedTo;
  const ticket = await db.ticket.findFirst({ where: { id: ticketId, tenantId: s.tenantId } });
  if (!ticket) return { error: "Ticket not found" };

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
    entity: "Ticket",
    entityId: ticket.id,
    actorId: s.userId,
    payload: { note: note.slice(0, 120) },
  });

  revalidatePath(`/tickets/${ticket.id}`);
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
