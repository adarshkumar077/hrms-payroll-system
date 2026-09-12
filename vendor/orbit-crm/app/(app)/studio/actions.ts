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

export async function updateModuleConfigAction(formData: FormData) {
  const s = await requireStudioWrite();
  const module = String(formData.get("module") || "");
  if (!module) return;

  const existing = await db.moduleConfig.findUnique({
    where: { tenantId_module: { tenantId: s.tenantId, module } },
  });
  if (!existing) return;

  const labelSingular = String(formData.get("labelSingular") || existing.labelSingular).trim() || existing.labelSingular;
  const labelPlural = String(formData.get("labelPlural") || existing.labelPlural).trim() || existing.labelPlural;
  // Checkboxes: present = "on"; a hidden marker field tells us the form included them.
  const enabled = formData.get("enabled") === "on";
  const inNav = formData.get("inNav") === "on";
  const inGlobalSearch = formData.get("inGlobalSearch") === "on";

  // The studio module itself must stay enabled+navigable — otherwise an admin
  // can lock themselves out of the very screen that fixes it.
  const safe = module === "studio" ? { enabled: true, inNav: true } : { enabled, inNav };

  const updated = await db.moduleConfig.update({
    where: { tenantId_module: { tenantId: s.tenantId, module } },
    data: { labelSingular, labelPlural, inGlobalSearch, ...safe, updatedById: s.userId },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "ModuleConfig",
    objectId: updated.id,
    action: "update",
    before: {
      labelSingular: existing.labelSingular,
      labelPlural: existing.labelPlural,
      enabled: existing.enabled,
      inNav: existing.inNav,
      inGlobalSearch: existing.inGlobalSearch,
    },
    after: {
      labelSingular: updated.labelSingular,
      labelPlural: updated.labelPlural,
      enabled: updated.enabled,
      inNav: updated.inNav,
      inGlobalSearch: updated.inGlobalSearch,
    },
  });

  revalidatePath("/studio");
  revalidatePath("/", "layout"); // nav labels render in the app shell
}
