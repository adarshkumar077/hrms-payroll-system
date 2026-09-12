"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { emit } from "@/lib/events";
import { computeQuote, type LineInput } from "@/lib/quote";
import { allocateNumber } from "@/lib/studio/numbering";
import { getStudioConfig, isValidOption, defaultValue, valuesByCategory } from "@/lib/studio/config";
import { validateCustom, type FieldDefLite } from "@/lib/studio/validate";

/**
 * Orbit Studio — quotation builder actions (Wave B / B3).
 *
 * Lock rule (applies to updateQuotationAction + updateQuotationLinesAction +
 * newRevisionAction): a quotation with `convertedInvoiceId` set is a
 * historical record from that point on — ALL edits are rejected, including
 * stage changes and new revisions. Short of that, once the quotation's
 * current stage is in the "won" or "lost" category (quotation_stage
 * picklist), line edits and every header field EXCEPT `status` are locked —
 * the one escape hatch is reverting the stage back to an "open" category
 * value (e.g. un-rejecting a quote to keep negotiating). This keeps a
 * won/lost quote from silently drifting after the fact while still letting
 * a mis-clicked stage change be undone.
 */

type SubmittedLine = {
  productId: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
  uom: string | null;
  optional: boolean;
};

function str(v: FormDataEntryValue | null): string | null {
  const t = String(v ?? "").trim();
  return t || null;
}

function num(v: FormDataEntryValue | null): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Parse+coerce the `linesJson` hidden field. Never trust client shape/values beyond this. */
function parseLines(raw: string): SubmittedLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: SubmittedLine[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const description = typeof e.description === "string" ? e.description.trim() : "";
    if (!description) continue; // blank rows are dropped, not errors
    out.push({
      productId: typeof e.productId === "string" && e.productId ? e.productId : null,
      description,
      qty: Number.isFinite(Number(e.qty)) ? Number(e.qty) : 0,
      unitPrice: Number.isFinite(Number(e.unitPrice)) ? Number(e.unitPrice) : 0,
      discountPct: Number.isFinite(Number(e.discountPct)) ? Number(e.discountPct) : 0,
      taxRate: Number.isFinite(Number(e.taxRate)) ? Number(e.taxRate) : 0,
      uom: typeof e.uom === "string" && e.uom.trim() ? e.uom.trim() : null,
      optional: e.optional === true,
    });
  }
  return out;
}

function toLineInput(l: SubmittedLine): LineInput {
  return { qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, taxRate: l.taxRate, optional: l.optional };
}

// Active option values keyed by picklistId — same helper as leads/actions.ts.
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

function collectCustomSubmission(formData: FormData, defs: { code: string; type: string }[]): Record<string, unknown> {
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

// ── Create ───────────────────────────────────────────────────────────────

export async function createQuotationAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "quotations", "write"))) return { error: "Not authorized" };

  const accountId = str(formData.get("accountId"));
  if (!accountId) return { error: "Account is required." };
  const account = await db.account.findFirst({ where: { id: accountId, tenantId: s.tenantId } });
  if (!account) return { error: "Invalid account." };

  const contactId = str(formData.get("contactId"));
  if (contactId) {
    const contact = await db.contact.findFirst({ where: { id: contactId, tenantId: s.tenantId } });
    if (!contact) return { error: "Invalid contact." };
  }

  const linesRaw = String(formData.get("linesJson") || "[]");
  const submittedLines = parseLines(linesRaw);
  if (submittedLines.length === 0) return { error: "Add at least one line item." };

  const headerDiscount = num(formData.get("headerDiscount"));
  const charges = num(formData.get("charges"));
  const chargesTaxRate = num(formData.get("chargesTaxRate"));
  const adjustment = num(formData.get("adjustment"));
  const chargesLabel = str(formData.get("chargesLabel"));
  const termsText = str(formData.get("termsText"));
  const paymentTermsText = str(formData.get("paymentTermsText"));
  const billingAddress = str(formData.get("billingAddress"));
  const shippingAddress = str(formData.get("shippingAddress"));

  const validUntilRaw = str(formData.get("validUntil"));
  let validUntil: Date | null = null;
  if (validUntilRaw) {
    const d = new Date(validUntilRaw);
    if (Number.isNaN(d.getTime())) return { error: "Valid-until must be a valid date." };
    validUntil = d;
  }

  const config = await getStudioConfig(s.tenantId);
  // Defensive: the create form never exposes a stage picker (new quotes
  // always start at the config default), but validate any submitted value
  // anyway so future callers can't slip in a stale/renamed stage string.
  const submittedStage = str(formData.get("stage"));
  const stage =
    submittedStage && isValidOption(config, "quotation_stage", submittedStage)
      ? submittedStage
      : defaultValue(config, "quotation_stage") ?? "Draft";

  const result = computeQuote({ lines: submittedLines.map(toLineInput), headerDiscount, charges, chargesTaxRate, adjustment });

  const defs = await db.fieldDef.findMany({ where: { tenantId: s.tenantId, module: "quotations", archived: false } });
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

  // Atomic tenant-scoped quotation number — seeded above any legacy QT-* numbers.
  const number = await allocateNumber(s.tenantId, "quotation");

  const quotation = await db.$transaction(async (tx) => {
    return tx.quotation.create({
      data: {
        tenantId: s.tenantId,
        number,
        accountId: account.id,
        contactId,
        status: stage,
        subtotal: result.subtotal,
        taxTotal: result.taxTotal,
        discount: result.headerDiscount,
        grandTotal: result.grandTotal,
        validUntil,
        charges: result.chargesTotal,
        chargesLabel,
        chargesTaxRate,
        adjustment: result.adjustment,
        termsText,
        paymentTermsText,
        billingAddress,
        shippingAddress,
        custom: JSON.stringify(values),
        updatedById: s.userId,
        lines: {
          create: submittedLines.map((l, i) => ({
            productId: l.productId,
            description: l.description,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            lineTotal: result.lines[i]?.total ?? 0,
            discountPct: l.discountPct,
            uom: l.uom,
            optional: l.optional,
            sortOrder: i,
          })),
        },
      },
    });
  });

  await emit({
    tenantId: s.tenantId,
    type: "quotation.created",
    entity: "Quotation",
    entityId: quotation.id,
    actorId: s.userId,
    payload: { note: `${number} → ${account.name}`, grandTotal: result.grandTotal },
  });

  revalidatePath("/quotations");
  redirect(`/quotations/${quotation.id}`);
}

// ── Header field edit (Universal Record Page inline edit) ─────────────────
// Only `status` and `validUntil` are wired to InlineField on the detail page
// (see app/(app)/quotations/[id]/page.tsx) — the other header fields
// (billing/shipping/terms/charges) are set at creation and via "Edit lines".
const ALLOWED_SYSTEM_FIELDS = new Set(["status", "validUntil"]);

export async function updateQuotationAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "quotations", "write"))) return { error: "Not authorized" };

  const id = String(formData.get("id") || "");
  const field = String(formData.get("field") || "");
  const rawValue = formData.get("value");
  const value = rawValue == null ? "" : String(rawValue);
  if (!id || !field) return { error: "Missing field" };
  if (!ALLOWED_SYSTEM_FIELDS.has(field)) return { error: "Field is not editable" };

  const q = await db.quotation.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!q) return { error: "Quotation not found" };

  const config = await getStudioConfig(s.tenantId);
  const fullyLocked = !!q.convertedInvoiceId;
  const wonLostStages = valuesByCategory(config, "quotation_stage", "won", "lost");
  const linesLocked = !fullyLocked && wonLostStages.includes(q.status);

  if (fullyLocked) return { error: "Converted quotations are locked." };
  if (linesLocked && field !== "status") return { error: "Quotation is locked — only the stage can change." };

  const data: Record<string, string | Date | null> = {};

  if (field === "status") {
    if (!isValidOption(config, "quotation_stage", value)) return { error: "Invalid stage option" };
    if (linesLocked) {
      const openStages = valuesByCategory(config, "quotation_stage", "open");
      if (!openStages.includes(value)) return { error: "Can only revert to an open stage from here." };
    }
    data.status = value;
  } else if (field === "validUntil") {
    const trimmed = value.trim();
    if (!trimmed) {
      data.validUntil = null;
    } else {
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) return { error: "Valid-until must be a valid date." };
      data.validUntil = d;
    }
  }
  data.updatedById = s.userId;

  await db.quotation.update({ where: { id: q.id }, data });

  await emit({
    tenantId: s.tenantId,
    type: field === "status" ? "quotation.status.changed" : "quotation.updated",
    entity: "Quotation",
    entityId: q.id,
    actorId: s.userId,
    payload:
      field === "status"
        ? { note: `${q.number} → ${value}`, from: q.status, to: value }
        : { note: `Updated ${field}`, field },
  });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${q.id}`);
}

// ── Line editing v1: replace-all ───────────────────────────────────────────
// Recomputes totals from the NEW lines against the quotation's EXISTING
// header numbers (headerDiscount/charges/chargesTaxRate/adjustment) — this
// action only ever touches lines + the derived totals, nothing else ("bump
// nothing else" per the task brief). Adjusting charges/adjustment themselves
// is out of scope for v1.
export async function updateQuotationLinesAction(quotationId: string, formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "quotations", "write"))) return { error: "Not authorized" };

  const q = await db.quotation.findFirst({ where: { id: quotationId, tenantId: s.tenantId } });
  if (!q) return { error: "Quotation not found" };

  const config = await getStudioConfig(s.tenantId);
  const fullyLocked = !!q.convertedInvoiceId;
  const wonLostStages = valuesByCategory(config, "quotation_stage", "won", "lost");
  const linesLocked = !fullyLocked && wonLostStages.includes(q.status);
  if (fullyLocked || linesLocked) return { error: "Quotation is locked — lines cannot be edited." };

  const linesRaw = String(formData.get("linesJson") || "[]");
  const submittedLines = parseLines(linesRaw);
  if (submittedLines.length === 0) return { error: "Add at least one line item." };

  const result = computeQuote({
    lines: submittedLines.map(toLineInput),
    headerDiscount: q.discount,
    charges: q.charges,
    chargesTaxRate: q.chargesTaxRate,
    adjustment: q.adjustment,
  });

  await db.$transaction(async (tx) => {
    await tx.quotationLine.deleteMany({ where: { quotationId: q.id } });
    await tx.quotation.update({
      where: { id: q.id },
      data: {
        subtotal: result.subtotal,
        taxTotal: result.taxTotal,
        discount: result.headerDiscount,
        grandTotal: result.grandTotal,
        updatedById: s.userId,
        lines: {
          create: submittedLines.map((l, i) => ({
            productId: l.productId,
            description: l.description,
            qty: l.qty,
            unitPrice: l.unitPrice,
            taxRate: l.taxRate,
            lineTotal: result.lines[i]?.total ?? 0,
            discountPct: l.discountPct,
            uom: l.uom,
            optional: l.optional,
            sortOrder: i,
          })),
        },
      },
    });
  });

  await emit({
    tenantId: s.tenantId,
    type: "quotation.lines.updated",
    entity: "Quotation",
    entityId: q.id,
    actorId: s.userId,
    payload: { note: `${q.number} lines updated`, grandTotal: result.grandTotal },
  });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${q.id}`);
}

// ── New revision ────────────────────────────────────────────────────────
// Only blocked once converted — a won/lost quote can still be revised to
// re-open negotiation (that's a normal quoting workflow), unlike line/header
// edits which are locked at that stage.
export async function newRevisionAction(quotationId: string): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "quotations", "write"))) return { error: "Not authorized" };

  const q = await db.quotation.findFirst({ where: { id: quotationId, tenantId: s.tenantId } });
  if (!q) return { error: "Quotation not found" };
  if (q.convertedInvoiceId) return { error: "Converted quotations are locked." };

  const next = q.revisionNo + 1;
  await db.quotation.update({ where: { id: q.id }, data: { revisionNo: next, updatedById: s.userId } });

  await emit({
    tenantId: s.tenantId,
    type: "quotation.revision",
    entity: "Quotation",
    entityId: q.id,
    actorId: s.userId,
    payload: { note: `${q.number} → revision ${next}`, revisionNo: next },
  });

  revalidatePath(`/quotations/${q.id}`);
}
