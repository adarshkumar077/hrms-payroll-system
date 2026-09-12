"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logStudioChange } from "@/lib/studio/changelog";

/**
 * Orbit Studio — Quote Terms (WS10 UI).
 * CRUD actions for QuoteTerms: create, update, delete, setDefault.
 * setDefault unsets other defaults of the same kind in a transaction.
 */

/** Guard: Studio writes are admin-territory (CEO bypasses; roles need studio:write). */
async function requireStudioWrite() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) throw new Error("No studio access");
  return s;
}

function isTermsKind(v: string): v is "terms" | "payment" {
  return v === "terms" || v === "payment";
}

export async function createTermsAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };
  if (name.length > 60) return { error: "Name must be 60 characters or less." };

  const kind = String(formData.get("kind") || "");
  if (!isTermsKind(kind)) return { error: "Invalid kind — choose 'terms' or 'payment'." };

  const body = String(formData.get("body") || "").trim();
  if (!body) return { error: "Body is required." };
  if (body.length > 5000) return { error: "Body must be 5000 characters or less." };

  const isDefault = formData.get("isDefault") === "on";

  const created = await db.$transaction(async (tx) => {
    // If setting as default, unset any other defaults of this kind.
    if (isDefault) {
      await tx.quoteTerms.updateMany({
        where: { tenantId: s.tenantId, kind, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.quoteTerms.create({
      data: { tenantId: s.tenantId, name, kind, body, isDefault },
    });
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "QuoteTerms",
    objectId: created.id,
    action: "create",
    after: { name, kind, body, isDefault },
  });

  revalidatePath("/studio/terms");
}

export async function updateTermsAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const id = String(formData.get("id") || "");
  const existing = await db.quoteTerms.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!existing) return { error: "Template not found." };

  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };
  if (name.length > 60) return { error: "Name must be 60 characters or less." };

  const body = String(formData.get("body") || "").trim();
  if (!body) return { error: "Body is required." };
  if (body.length > 5000) return { error: "Body must be 5000 characters or less." };

  const isDefault = formData.get("isDefault") === "on";

  const updated = await db.$transaction(async (tx) => {
    // If setting as default, unset any other defaults of this kind.
    if (isDefault && !existing.isDefault) {
      await tx.quoteTerms.updateMany({
        where: { tenantId: s.tenantId, kind: existing.kind, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.quoteTerms.update({
      where: { id: existing.id },
      data: { name, body, isDefault },
    });
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "QuoteTerms",
    objectId: updated.id,
    action: "update",
    before: { name: existing.name, body: existing.body, isDefault: existing.isDefault },
    after: { name: updated.name, body: updated.body, isDefault: updated.isDefault },
  });

  revalidatePath("/studio/terms");
}

export async function deleteTermsAction(id: string): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const existing = await db.quoteTerms.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!existing) return { error: "Template not found." };

  await db.quoteTerms.delete({ where: { id: existing.id } });

  revalidatePath("/studio/terms");
}

export async function setDefaultAction(id: string): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const existing = await db.quoteTerms.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!existing) return { error: "Template not found." };

  const updated = await db.$transaction(async (tx) => {
    // Unset any other defaults of this kind, then set this one.
    await tx.quoteTerms.updateMany({
      where: { tenantId: s.tenantId, kind: existing.kind, isDefault: true },
      data: { isDefault: false },
    });

    return tx.quoteTerms.update({
      where: { id: existing.id },
      data: { isDefault: true },
    });
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "QuoteTerms",
    objectId: updated.id,
    action: "update",
    before: { isDefault: existing.isDefault },
    after: { isDefault: updated.isDefault },
  });

  revalidatePath("/studio/terms");
}
