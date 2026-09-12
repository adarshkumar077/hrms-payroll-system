"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { nextTagColor, normalizeTagName } from "@/lib/tags";
import { TAG_MODULE_DELEGATES, TAG_MODULE_PATHS, isTagModule } from "./constants";

// Add a tag to a record — find-or-create the Tag by (tenantId, normalized
// name), then create the TagLink. Verifies the TARGET record's tenantId
// first (never trust the caller's module+recordId pair blindly).
export async function addTagAction(module: string, recordId: string, name: string): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!isTagModule(module)) return { error: "Unknown module." };

  const trimmed = normalizeTagName(name);
  if (!trimmed) return { error: "Tag name is required." };

  const delegate = TAG_MODULE_DELEGATES[module];
  const record = await (delegate as any).findFirst({ where: { id: recordId, tenantId: s.tenantId } });
  if (!record) return { error: "Record not found." };

  let tag = await db.tag.findFirst({ where: { tenantId: s.tenantId, name: trimmed } });
  if (!tag) {
    const existingCount = await db.tag.count({ where: { tenantId: s.tenantId } });
    tag = await db.tag.create({
      data: { tenantId: s.tenantId, name: trimmed, color: nextTagColor(existingCount) },
    });
  }

  try {
    await db.tagLink.create({
      data: { tenantId: s.tenantId, tagId: tag.id, module, recordId },
    });
  } catch (e: any) {
    // Unique violation (tenantId+tagId+module+recordId) = already tagged — no-op.
    if (e?.code !== "P2002") throw e;
    return;
  }

  await emit({
    tenantId: s.tenantId,
    type: "tag.added",
    entity: "Tag",
    entityId: tag.id,
    actorId: s.userId,
    payload: { note: `Tagged "${tag.name}"`, module, recordId, tagName: tag.name },
  });

  const paths = TAG_MODULE_PATHS[module];
  revalidatePath(paths.list);
  revalidatePath(paths.detail(recordId));
}

// Remove a tag from a record. Verifies tenantId via the TagLink row itself
// (TagLink is polymorphic — no relation to the target record to check against).
export async function removeTagAction(linkId: string): Promise<{ error?: string } | void> {
  const s = await requireSession();
  const link = await db.tagLink.findFirst({ where: { id: linkId, tenantId: s.tenantId } });
  if (!link) return { error: "Tag link not found." };

  await db.tagLink.delete({ where: { id: link.id } });

  await emit({
    tenantId: s.tenantId,
    type: "tag.removed",
    entity: "Tag",
    entityId: link.tagId,
    actorId: s.userId,
    payload: { note: "Tag removed", module: link.module, recordId: link.recordId },
  });

  if (isTagModule(link.module)) {
    const paths = TAG_MODULE_PATHS[link.module];
    revalidatePath(paths.list);
    revalidatePath(paths.detail(link.recordId));
  }
}
