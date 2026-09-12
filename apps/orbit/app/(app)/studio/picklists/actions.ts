"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logStudioChange } from "@/lib/studio/changelog";

/** Guard: Studio writes are admin-territory (CEO bypasses; roles need studio:write). */
async function requireStudioWrite() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) throw new Error("No studio access");
  return s;
}

/** Revalidate every surface that renders picklist data. */
function revalidatePicklist(key: string) {
  revalidatePath(`/studio/picklists/${key}`);
  revalidatePath("/studio/picklists");
  revalidatePath("/", "layout");
}

/** Load an option scoped to the caller's tenant (via its parent PicklistDef), or null. */
async function findTenantOption(tenantId: string, optionId: string) {
  const option = await db.picklistOption.findUnique({
    where: { id: optionId },
    include: { picklist: true },
  });
  if (!option || option.picklist.tenantId !== tenantId) return null;
  return option;
}

export async function addOptionAction(formData: FormData) {
  const s = await requireStudioWrite();
  const key = String(formData.get("key") || "");
  const label = String(formData.get("label") || "").trim();
  const tone = String(formData.get("tone") || "slate").trim() || "slate";
  const categoryRaw = formData.get("category");

  if (!key) throw new Error("Missing picklist key");
  if (!label) throw new Error("Label is required");

  const def = await db.picklistDef.findUnique({ where: { tenantId_key: { tenantId: s.tenantId, key } } });
  if (!def) throw new Error("Picklist not found");

  // Value is derived from the label and is immutable thereafter.
  const value = label.replace(/[^A-Za-z0-9 ]/g, "").trim();
  if (!value) throw new Error("Label must contain at least one letter or number");

  const dup = await db.picklistOption.findUnique({
    where: { picklistDefId_value: { picklistDefId: def.id, value } },
  });
  if (dup) throw new Error(`An option with value "${value}" already exists on this list`);

  // System lists anchor business logic on category — new options there get no
  // category (excluded from category-driven metrics) rather than a guessed one.
  const category = !def.system && categoryRaw ? String(categoryRaw).trim() || null : null;

  const maxSort = await db.picklistOption.aggregate({
    where: { picklistDefId: def.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  const created = await db.picklistOption.create({
    data: {
      picklistDefId: def.id,
      value,
      label,
      tone,
      category,
      sortOrder,
      isDefault: false,
      archived: false,
    },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "PicklistOption",
    objectId: created.id,
    action: "create",
    before: null,
    after: created,
  });

  revalidatePicklist(key);
}

export async function updateOptionAction(formData: FormData) {
  const s = await requireStudioWrite();
  const optionId = String(formData.get("optionId") || "");
  const existing = await findTenantOption(s.tenantId, optionId);
  if (!existing) return;

  const label = String(formData.get("label") ?? "").trim() || existing.label;
  const tone = String(formData.get("tone") ?? existing.tone ?? "slate").trim() || "slate";

  const updated = await db.picklistOption.update({
    where: { id: optionId },
    data: { label, tone },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "PicklistOption",
    objectId: updated.id,
    action: "update",
    before: { label: existing.label, tone: existing.tone },
    after: { label: updated.label, tone: updated.tone },
  });

  revalidatePicklist(existing.picklist.key);
}

export async function setDefaultAction(formData: FormData) {
  const s = await requireStudioWrite();
  const optionId = String(formData.get("optionId") || "");
  const existing = await findTenantOption(s.tenantId, optionId);
  if (!existing) return;
  if (existing.archived) throw new Error("Cannot set an archived option as default");
  if (existing.isDefault) return; // already default — no-op

  await db.$transaction([
    db.picklistOption.updateMany({
      where: { picklistDefId: existing.picklistDefId },
      data: { isDefault: false },
    }),
    db.picklistOption.update({ where: { id: optionId }, data: { isDefault: true } }),
  ]);

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "PicklistOption",
    objectId: optionId,
    action: "update",
    before: { isDefault: false },
    after: { isDefault: true },
  });

  revalidatePicklist(existing.picklist.key);
}

export async function moveOptionAction(formData: FormData) {
  const s = await requireStudioWrite();
  const optionId = String(formData.get("optionId") || "");
  const direction = String(formData.get("direction") || "");
  if (direction !== "up" && direction !== "down") return;

  const existing = await findTenantOption(s.tenantId, optionId);
  if (!existing || existing.archived) return;

  const siblings = await db.picklistOption.findMany({
    where: { picklistDefId: existing.picklistDefId, archived: false },
    orderBy: { sortOrder: "asc" },
  });
  const idx = siblings.findIndex((o) => o.id === optionId);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;

  const a = siblings[idx];
  const b = siblings[swapIdx];

  await db.$transaction([
    db.picklistOption.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } }),
    db.picklistOption.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
  ]);

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "PicklistOption",
    objectId: a.id,
    action: "update",
    before: { sortOrder: a.sortOrder },
    after: { sortOrder: b.sortOrder },
  });

  revalidatePicklist(existing.picklist.key);
}

export async function archiveOptionAction(formData: FormData) {
  const s = await requireStudioWrite();
  const optionId = String(formData.get("optionId") || "");
  const existing = await findTenantOption(s.tenantId, optionId);
  if (!existing) return;
  if (existing.archived) return;

  if (existing.isDefault) {
    throw new Error("Cannot archive the default option — set another option as default first");
  }

  if (existing.picklist.system) {
    const activeCount = await db.picklistOption.count({
      where: { picklistDefId: existing.picklistDefId, archived: false },
    });
    if (activeCount <= 1) {
      throw new Error("Cannot archive the last active option of a system list");
    }
  }

  const updated = await db.picklistOption.update({
    where: { id: optionId },
    data: { archived: true },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "PicklistOption",
    objectId: updated.id,
    action: "archive",
    before: { archived: false },
    after: { archived: true },
  });

  revalidatePicklist(existing.picklist.key);
}

export async function restoreOptionAction(formData: FormData) {
  const s = await requireStudioWrite();
  const optionId = String(formData.get("optionId") || "");
  const existing = await findTenantOption(s.tenantId, optionId);
  if (!existing) return;
  if (!existing.archived) return;

  const updated = await db.picklistOption.update({
    where: { id: optionId },
    data: { archived: false },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "PicklistOption",
    objectId: updated.id,
    action: "update",
    before: { archived: true },
    after: { archived: false },
  });

  revalidatePicklist(existing.picklist.key);
}
