"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { getStudioConfig, isValidOption, defaultValue } from "@/lib/studio/config";
import { parseRelatedTo, isWellFormedRelatedTo } from "./relatedTo";

function str(v: FormDataEntryValue | null): string | null {
  const t = String(v || "").trim();
  return t || null;
}

// Create an activity (Task/Call/Meeting/Note). Owner defaults to the creator
// when left unset; relatedTo is an optional "Module:id" string carried in
// from ?relatedTo= on the list page (or typed via a hidden field on the form).
export async function createActivityAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "activities", "write"))) return { error: "Not authorized" };

  const subject = str(formData.get("subject"));
  if (!subject) return { error: "Subject is required." };

  const config = await getStudioConfig(s.tenantId);
  const typeRaw = str(formData.get("type"));
  const type = (typeRaw && isValidOption(config, "activity_type", typeRaw)) ? typeRaw : (defaultValue(config, "activity_type") ?? "Task");

  const dueDateRaw = str(formData.get("dueDate"));
  const dueDateParsed = dueDateRaw ? new Date(dueDateRaw) : null;
  if (dueDateRaw && (!dueDateParsed || Number.isNaN(dueDateParsed.getTime()))) {
    return { error: "Due date must be a valid date." };
  }

  let ownerId: string | null = str(formData.get("ownerId"));
  if (ownerId) {
    const owner = await db.user.findFirst({ where: { id: ownerId, tenantId: s.tenantId } });
    if (!owner) return { error: "Selected owner not found." };
  } else {
    ownerId = s.userId; // default: whoever created it owns it, same as tickets/opportunities
  }

  const relatedToRaw = str(formData.get("relatedTo"));
  const relatedTo = relatedToRaw && isWellFormedRelatedTo(relatedToRaw) ? relatedToRaw : null;

  const activity = await db.activity.create({
    data: {
      tenantId: s.tenantId,
      type,
      subject,
      relatedTo,
      dueDate: dueDateParsed,
      ownerId,
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "activity.created",
    entity: "Activity",
    entityId: activity.id,
    actorId: s.userId,
    payload: { note: `New ${type.toLowerCase()}: ${subject}`, relatedTo },
  });

  revalidatePath("/activities");
  const rel = parseRelatedTo(relatedTo);
  if (rel) revalidatePath(rel.href); // best-effort: keep the linked record's timeline fresh too
}

// Toggle done/open. Flips whatever the current value is (no explicit target
// param) so the row action can stay a single button/checkbox.
export async function toggleActivityDoneAction(activityId: string): Promise<{ error: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "activities", "write"))) return { error: "Not authorized" };

  const activity = await db.activity.findFirst({ where: { id: activityId, tenantId: s.tenantId } });
  if (!activity) return { error: "Activity not found" };

  const done = !activity.done;
  await db.activity.update({ where: { id: activity.id }, data: { done } });

  await emit({
    tenantId: s.tenantId,
    type: done ? "activity.completed" : "activity.reopened",
    entity: "Activity",
    entityId: activity.id,
    actorId: s.userId,
    payload: { note: `${activity.subject} → ${done ? "done" : "reopened"}` },
  });

  revalidatePath("/activities");
  const rel = parseRelatedTo(activity.relatedTo);
  if (rel) revalidatePath(rel.href);
}

// Reassign owner. ownerId === "" unassigns (nulls the owner).
export async function reassignActivityAction(activityId: string, ownerId: string): Promise<{ error: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "activities", "write"))) return { error: "Not authorized" };

  const activity = await db.activity.findFirst({ where: { id: activityId, tenantId: s.tenantId } });
  if (!activity) return { error: "Activity not found" };

  const nextOwnerId = ownerId.trim() || null;
  if (nextOwnerId) {
    const owner = await db.user.findFirst({ where: { id: nextOwnerId, tenantId: s.tenantId } });
    if (!owner) return { error: "Selected owner not found." };
  }

  await db.activity.update({ where: { id: activity.id }, data: { ownerId: nextOwnerId } });

  await emit({
    tenantId: s.tenantId,
    type: "activity.reassigned",
    entity: "Activity",
    entityId: activity.id,
    actorId: s.userId,
    payload: { note: `${activity.subject} reassigned`, ownerId: nextOwnerId },
  });

  revalidatePath("/activities");
}
