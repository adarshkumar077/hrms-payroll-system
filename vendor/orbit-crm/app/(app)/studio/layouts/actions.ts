"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { isLayoutModule, parseLayoutSpec, saveRecordLayout } from "@/lib/studio/layouts";

/**
 * Orbit Studio — Layout Editor (WS9 v1).
 * Local copy of the requireStudioWrite guard, same pattern as
 * app/(app)/studio/rules/actions.ts — Studio writes are admin-territory.
 */
async function requireStudioWrite() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) throw new Error("No studio access");
  return s;
}

/**
 * Save (or reset, via `{fields: []}`) the record layout for a module.
 * `spec` arrives as a JSON string built by LayoutEditor; parseLayoutSpec is
 * corrupt-safe and drops any junk keys, so a hand-crafted request can't smuggle
 * anything beyond {code, hidden?} into what gets persisted.
 */
export async function saveLayoutAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const module = String(formData.get("module") || "");
  if (!isLayoutModule(module)) return { error: "Invalid module." };

  const spec = parseLayoutSpec(String(formData.get("spec") || "{}"));

  await saveRecordLayout(s.tenantId, s.userId, module, spec);

  revalidatePath("/studio/layouts");
  revalidatePath(`/${module}`);
}
