"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logStudioChange } from "@/lib/studio/changelog";

/**
 * Orbit Studio — SLA hours (C5). Editable per-priority SLA on ticket_priority
 * picklist options, stored as meta.slaHours (config-as-data, no new table —
 * same pattern as opportunity_stage's meta.probability). Read at ticket
 * creation / contract-automation ticket creation via
 * lib/contracts-automation.ts's ticketSlaHours()/computeSlaDueAt().
 */

/** Guard: Studio writes are admin-territory (CEO bypasses; roles need studio:write). */
async function requireStudioWrite() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) throw new Error("No studio access");
  return s;
}

/** Load a ticket_priority option scoped to the caller's tenant, or null. */
async function findTenantPriorityOption(tenantId: string, optionId: string) {
  const option = await db.picklistOption.findUnique({
    where: { id: optionId },
    include: { picklist: true },
  });
  if (!option || option.picklist.tenantId !== tenantId || option.picklist.key !== "ticket_priority") return null;
  return option;
}

function parseMeta(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function updateSlaHoursAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireStudioWrite();

  const optionId = String(formData.get("optionId") || "");
  const existing = await findTenantPriorityOption(s.tenantId, optionId);
  if (!existing) return { error: "Priority option not found." };

  const raw = String(formData.get("slaHours") || "").trim();
  const hours = Number(raw);
  if (!raw || !Number.isFinite(hours) || hours <= 0) {
    return { error: "SLA hours must be a number greater than 0." };
  }

  // Merge into existing meta rather than clobbering other keys a tenant (or
  // a future feature) may have set on this option.
  const beforeMeta = parseMeta(existing.meta);
  const afterMeta = { ...beforeMeta, slaHours: hours };

  const updated = await db.picklistOption.update({
    where: { id: optionId },
    data: { meta: JSON.stringify(afterMeta) },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "PicklistOption",
    objectId: updated.id,
    action: "update",
    before: { meta: existing.meta },
    after: { meta: updated.meta },
  });

  revalidatePath("/studio/sla");
  revalidatePath("/tickets");
}
