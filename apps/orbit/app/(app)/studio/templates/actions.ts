"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listPacks, previewPack, applyPack, exportPack, type PackDiff, type StudioPack } from "@/lib/studio/packs";

/**
 * Orbit Studio — Industry Templates (WS8).
 * lib/studio/packs.ts owns pack definitions and all apply-time DB writes; it
 * also writes its own StudioChangeLog entry on applyPack (source: "template"),
 * so these actions do NOT call logStudioChange themselves — only the guard,
 * pack lookup, and revalidation live here.
 */

/** Guard: Studio writes are admin-territory (CEO bypasses; roles need studio:write). */
async function requireStudioWrite() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) throw new Error("No studio access");
  return s;
}

/** Resolve a pack by key from the canonical list — rejects any key that isn't a known pack. */
function resolvePack(key: string): StudioPack {
  const pack = listPacks().find((p) => p.key === key);
  if (!pack) throw new Error(`Unknown template pack "${key}".`);
  return pack;
}

export async function previewAction(packKey: string): Promise<{ diff: PackDiff } | { error: string }> {
  const s = await requireStudioWrite();
  try {
    const pack = resolvePack(packKey);
    const diff = await previewPack(s.tenantId, pack);
    return { diff };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not preview this pack." };
  }
}

export async function applyAction(packKey: string): Promise<{ diff: PackDiff } | { error: string }> {
  const s = await requireStudioWrite();
  try {
    const pack = resolvePack(packKey);
    const diff = await applyPack(s.tenantId, s.userId, pack, "template");
    revalidatePath("/studio/templates");
    revalidatePath("/");
    revalidatePath("/", "layout");
    return { diff };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not apply this pack." };
  }
}

export async function exportAction(): Promise<{ pack: StudioPack } | { error: string }> {
  const s = await requireStudioWrite();
  try {
    const pack = await exportPack(s.tenantId);
    return { pack };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not export your configuration." };
  }
}
