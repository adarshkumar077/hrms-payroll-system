"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { listPathForModule } from "./constants";

// LIST FRAMEWORK (E1): SavedSearch CRUD. Schema is frozen (E0, commit
// 8ba9a20): { tenantId, module, name, params (JSON string), ownerId
// nullable=shared, isDefault }. `params` is produced by
// currentParamsToJson() (lib/list.ts) and consumed by savedParamsToQuery()
// — this file never interprets the JSON itself, just stores/moves it.

/** Create or update (by tenant+module+name — the model's @@unique) a saved
 *  view for `module` with the caller's current list state. `shared: true`
 *  (ownerId = null, visible tenant-wide) is CEO/admin-only, same gate as
 *  every other admin-only write in this app (session.isCeo — see lib/rbac.ts
 *  can()/DEFAULT_MEMBER_PERMISSIONS, which never grants a "shared" capability
 *  to non-CEO roles). */
export async function saveViewAction(
  module: string,
  name: string,
  paramsJson: string,
  shared: boolean
): Promise<{ error?: string } | void> {
  const s = await requireSession();

  const trimmed = name.trim();
  if (!trimmed) return { error: "View name is required." };
  if (shared && !s.isCeo) return { error: "Only admins can save a shared view." };

  try {
    const parsed = JSON.parse(paramsJson);
    if (!parsed || typeof parsed !== "object") throw new Error("bad shape");
  } catch {
    return { error: "Invalid filter state." };
  }

  const ownerId = shared ? null : s.userId;

  const existing = await db.savedSearch.findFirst({
    where: { tenantId: s.tenantId, module, name: trimmed },
  });
  // Don't let a member silently overwrite a shared view (or vice versa) by
  // reusing its name — the unique constraint is on name alone, ownership
  // isn't part of it, so this has to be an explicit check.
  if (existing && existing.ownerId !== ownerId && !s.isCeo) {
    return { error: "A view with that name already exists." };
  }

  const saved = await db.savedSearch.upsert({
    where: { tenantId_module_name: { tenantId: s.tenantId, module, name: trimmed } },
    update: { params: paramsJson, ownerId },
    create: { tenantId: s.tenantId, module, name: trimmed, params: paramsJson, ownerId },
  });

  await emit({
    tenantId: s.tenantId,
    type: "savedSearch.saved",
    entity: "SavedSearch",
    entityId: saved.id,
    actorId: s.userId,
    payload: { note: `Saved view "${trimmed}"`, module, shared },
  });

  revalidatePath(listPathForModule(module));
}

/** Delete a saved view — own view, or any view (incl. shared) if CEO/admin. */
export async function deleteViewAction(id: string): Promise<{ error?: string } | void> {
  const s = await requireSession();
  const sv = await db.savedSearch.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!sv) return { error: "View not found." };
  if (sv.ownerId !== s.userId && !s.isCeo) return { error: "Not authorized." };

  await db.savedSearch.delete({ where: { id: sv.id } });

  await emit({
    tenantId: s.tenantId,
    type: "savedSearch.deleted",
    entity: "SavedSearch",
    entityId: sv.id,
    actorId: s.userId,
    payload: { note: `Deleted view "${sv.name}"`, module: sv.module },
  });

  revalidatePath(listPathForModule(sv.module));
}

/** Star a view as the default for its (tenant, module, ownership scope) —
 *  "scope" is the same ownerId the view itself has: setting a shared view
 *  default only unsets other SHARED defaults, setting a personal view
 *  default only unsets that owner's other personal defaults. Both the
 *  unset-others and set-this happen in one transaction so there's never a
 *  moment (or a failure) that leaves two defaults active. */
export async function setDefaultViewAction(id: string): Promise<{ error?: string } | void> {
  const s = await requireSession();
  const sv = await db.savedSearch.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!sv) return { error: "View not found." };
  if (sv.ownerId !== s.userId && !s.isCeo) return { error: "Not authorized." };

  await db.$transaction([
    db.savedSearch.updateMany({
      where: { tenantId: s.tenantId, module: sv.module, ownerId: sv.ownerId, isDefault: true },
      data: { isDefault: false },
    }),
    db.savedSearch.update({ where: { id: sv.id }, data: { isDefault: true } }),
  ]);

  revalidatePath(listPathForModule(sv.module));
}

/** Unstar — clears isDefault without picking a new default. */
export async function unsetDefaultViewAction(id: string): Promise<{ error?: string } | void> {
  const s = await requireSession();
  const sv = await db.savedSearch.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!sv) return { error: "View not found." };
  if (sv.ownerId !== s.userId && !s.isCeo) return { error: "Not authorized." };

  await db.savedSearch.update({ where: { id: sv.id }, data: { isDefault: false } });
  revalidatePath(listPathForModule(sv.module));
}
