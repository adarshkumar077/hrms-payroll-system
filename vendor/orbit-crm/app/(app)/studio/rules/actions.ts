"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { logStudioChange } from "@/lib/studio/changelog";
import { ensureConvertMaps } from "@/lib/studio/convert";
import { allowedDedupeFields, ensureDedupeRule } from "@/lib/studio/dedupe";
import { CONVERT_TARGETS, CONVERT_TARGET_FIELDS, STANDARD_LEAD_SOURCE_FIELDS, type ConvertTarget } from "./constants";

/**
 * Orbit Studio — Convert & Duplicate Rules (WS6 UI).
 * ConvertMap rows are lazily defaulted by ensureConvertMaps (lib/studio/convert.ts);
 * DedupeRule rows are lazily defaulted per-module by ensureDedupeRule
 * (lib/studio/dedupe.ts — currently "leads" and "contacts"). Both actions here
 * re-validate every submitted field against the allowed lists server-side —
 * the client only offers the allowed options, but a hand-crafted request must
 * not be able to smuggle in an unknown source/target column or dedupe field.
 */

/** Guard: Studio writes are admin-territory (CEO bypasses; roles need studio:write). */
async function requireStudioWrite() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) throw new Error("No studio access");
  return s;
}

function isConvertTarget(v: string): v is ConvertTarget {
  return (CONVERT_TARGETS as readonly string[]).includes(v);
}

type RawMapping = { source?: unknown; target?: unknown };

export async function updateConvertMapAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const target = String(formData.get("target") || "");
  if (!isConvertTarget(target)) return { error: "Invalid conversion target." };

  let row = await db.convertMap.findUnique({
    where: { tenantId_sourceModule_targetModule: { tenantId: s.tenantId, sourceModule: "lead", targetModule: target } },
  });
  if (!row) {
    // Defaults haven't been created for this tenant yet (e.g. first visit
    // raced with page load) — create them, then retry the lookup once.
    await ensureConvertMaps(s.tenantId);
    row = await db.convertMap.findUnique({
      where: { tenantId_sourceModule_targetModule: { tenantId: s.tenantId, sourceModule: "lead", targetModule: target } },
    });
  }
  if (!row) return { error: "Conversion map not found." };

  const enabled = formData.get("enabled") === "on";
  const required = formData.get("required") === "on";

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("mappings") || "[]"));
  } catch {
    return { error: "Malformed mapping data." };
  }
  if (!Array.isArray(parsed)) return { error: "Malformed mapping data." };

  const customFields = await db.fieldDef.findMany({
    where: { tenantId: s.tenantId, module: "leads", system: false, archived: false },
    select: { code: true },
  });
  const allowedSources = new Set<string>([
    ...STANDARD_LEAD_SOURCE_FIELDS.map((f) => f.value),
    ...customFields.map((f) => f.code),
  ]);
  const allowedTargets = new Set<string>(CONVERT_TARGET_FIELDS[target].map((f) => f.value));

  const mappings: { source: string; target: string }[] = [];
  for (const raw of parsed as RawMapping[]) {
    const source = String((raw as RawMapping)?.source ?? "").trim();
    const targetField = String((raw as RawMapping)?.target ?? "").trim();
    if (!source || !targetField) continue; // incomplete row — dropped silently, same as a blank add-row
    if (!allowedSources.has(source)) return { error: `Unknown lead field "${source}".` };
    if (!allowedTargets.has(targetField)) return { error: `Unknown ${target} field "${targetField}".` };
    mappings.push({ source, target: targetField });
  }

  const updated = await db.convertMap.update({
    where: { id: row.id },
    data: { enabled, required, mappings: JSON.stringify(mappings) },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "ConvertMap",
    objectId: updated.id,
    action: "update",
    before: { enabled: row.enabled, required: row.required, mappings: row.mappings },
    after: { enabled: updated.enabled, required: updated.required, mappings: updated.mappings },
  });

  revalidatePath("/studio/rules");
}

// Modules with a Studio-editable dedupe rule (must match lib/studio/dedupe.ts MODULES).
const DEDUPE_MODULES = ["leads", "contacts"] as const;

export async function updateDedupeRuleAction(formData: FormData): Promise<{ error: string } | void> {
  const s = await requireStudioWrite();

  const module = String(formData.get("module") || "");
  if (!(DEDUPE_MODULES as readonly string[]).includes(module)) return { error: "Invalid dedupe module." };

  // Source of truth for which fields this module's matching engine supports —
  // lib/studio/dedupe.ts MODULES. Kept in sync rather than duplicated here.
  const allowedFields = allowedDedupeFields(module);
  if (!allowedFields) return { error: "Invalid dedupe module." };

  await ensureDedupeRule(s.tenantId, module);
  const existing = await db.dedupeRule.findUnique({ where: { tenantId_module: { tenantId: s.tenantId, module } } });
  if (!existing) return { error: "Duplicate rule not found." };

  const enabled = formData.get("enabled") === "on";
  const modeRaw = String(formData.get("mode") || "warn");
  const mode = modeRaw === "block" ? "block" : "warn";

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("fields") || "[]"));
  } catch {
    return { error: "Malformed match group data." };
  }
  if (!Array.isArray(parsed)) return { error: "Malformed match group data." };

  const allowed = new Set<string>(allowedFields);
  const groups: string[][] = [];
  for (const g of parsed) {
    if (!Array.isArray(g)) return { error: "Malformed match group data." };
    const fields = g.map((f) => String(f)).filter((f) => f.length > 0);
    for (const f of fields) {
      if (!allowed.has(f)) return { error: `Unknown field "${f}" in match group.` };
    }
    if (fields.length > 0) groups.push(Array.from(new Set(fields)));
  }

  if (enabled && groups.length === 0) {
    return { error: "Add at least one match group before enabling duplicate detection." };
  }

  const updated = await db.dedupeRule.update({
    where: { id: existing.id },
    data: { enabled, mode, fields: JSON.stringify(groups) },
  });

  await logStudioChange({
    tenantId: s.tenantId,
    actorId: s.userId,
    source: "ui",
    object: "DedupeRule",
    objectId: updated.id,
    action: "update",
    before: { enabled: existing.enabled, mode: existing.mode, fields: existing.fields },
    after: { enabled: updated.enabled, mode: updated.mode, fields: updated.fields },
  });

  revalidatePath("/studio/rules");
}
