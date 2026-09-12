import { db } from "@/lib/db";
import { ensureStudioDefaults, DEFAULT_MODULES, DEFAULT_PICKLISTS } from "./defaults";
import { logStudioChange } from "./changelog";
import { makeFieldCode } from "./validate";

// Built-in packs (static imports so they bundle — not fs, works in any deploy target).
import itServicesAmc from "./packs/it-services-amc.json";
import tradingDistribution from "./packs/trading-distribution.json";
import manufacturing from "./packs/manufacturing.json";
import professionalServices from "./packs/professional-services.json";
import realEstate from "./packs/real-estate.json";

/**
 * Orbit Studio — industry template packs (WS8).
 *
 * A StudioPack is a declarative bundle of module renames, picklists, and
 * custom fields that a tenant can apply to fast-forward Studio configuration
 * toward a specific industry vertical. Application is strictly ADDITIVE —
 * packs never delete or silently overwrite a tenant's existing config
 * (see planPack for the exact merge rules). Same "never destructive" rule
 * the rest of Studio follows (defaults.ts create-catch, config.ts archived
 * options remaining readable, etc).
 *
 * The five built-ins live as JSON under ./packs/*.json and are pulled in via
 * static imports (not fs) so they end up in the server bundle rather than
 * requiring filesystem access at runtime (works identically in Vercel/Docker
 * as it does locally).
 */

export type StudioPack = {
  key: string;
  name: string;
  industry: string;
  description: string;
  modules?: { module: string; labelSingular?: string; labelPlural?: string }[];
  picklists?: {
    key: string;
    label: string;
    options: { value: string; label?: string; category?: string | null; tone?: string | null; meta?: Record<string, unknown> }[];
  }[];
  fields?: { module: string; label: string; type: string; required?: boolean; helpText?: string; picklistKey?: string }[];
};

export type PackDiffItem = { kind: "module" | "picklist" | "option" | "field"; summary: string };
export type PackDiff = { creates: PackDiffItem[]; updates: PackDiffItem[]; conflicts: PackDiffItem[] };

const BUILTIN_PACKS: StudioPack[] = [
  itServicesAmc,
  tradingDistribution,
  manufacturing,
  professionalServices,
  realEstate,
];

export function listPacks(): StudioPack[] {
  return BUILTIN_PACKS;
}

// ── Pure planner ─────────────────────────────────────────────────────────
//
// planPack(pack, snapshot) is the shared brain behind previewPack (dry-run)
// and applyPack (dry-run + write). It never touches the database — callers
// hand it a snapshot of the tenant's CURRENT config, built from whatever
// source they like (a live db read for previewPack/applyPack, or a fake
// object in tests).

export type PackPlanSnapshot = {
  /** module key → current labels (from ModuleConfig). Absent = unknown module. */
  modules: Map<string, { labelSingular: string; labelPlural: string }>;
  /** picklist key → { id, options: value → label } (from PicklistDef + PicklistOption). */
  picklists: Map<string, { id: string; options: Map<string, string> }>;
  /** `${module}::${label.toLowerCase()}` set (from FieldDef), for case-insensitive (module,label) matching. */
  fields: Set<string>;
};

function fieldKey(module: string, label: string): string {
  return `${module}::${label.trim().toLowerCase()}`;
}

/**
 * Classify every module/picklist/option/field in `pack` against `snapshot`.
 * Pure — no I/O, deterministic, safe to unit test directly.
 *
 * Merge rules (additive, never destructive):
 *  - modules: known module key → "update" (apply overwrites the labels given).
 *             unknown module key → "conflict" (nothing to attach the rename to).
 *  - picklists: unknown key → "picklist" create (the PicklistDef itself) plus
 *               an "option" create for every option it ships with.
 *               known key → per option: unknown value → "option" create;
 *               known value with the SAME label → silent no-op (skipped
 *               entirely, not even reported — the tenant already has exactly
 *               this option); known value with a DIFFERENT label → "option"
 *               conflict (tenant's label wins).
 *  - fields: matched by (module, label) case-insensitively against existing
 *            FieldDefs → "field" conflict (tenant's field wins). Otherwise a
 *            "field" create — UNLESS it names a picklistKey that resolves to
 *            neither an existing picklist nor one defined earlier in this
 *            same pack, in which case it's a "field" conflict (nothing to
 *            attach the picklist to).
 */
export function planPack(pack: StudioPack, snapshot: PackPlanSnapshot): PackDiff {
  const creates: PackDiffItem[] = [];
  const updates: PackDiffItem[] = [];
  const conflicts: PackDiffItem[] = [];

  // -- modules --------------------------------------------------------------
  for (const m of pack.modules ?? []) {
    if (snapshot.modules.has(m.module)) {
      const labelBits = [m.labelSingular, m.labelPlural].filter(Boolean).join(" / ");
      updates.push({ kind: "module", summary: `Rename ${m.module} → ${labelBits || "(no label change)"}` });
    } else {
      conflicts.push({ kind: "module", summary: `Unknown module "${m.module}" — skipped` });
    }
  }

  // -- picklists --------------------------------------------------------------
  // Track keys that will exist once this pack's picklists are applied
  // (pre-existing ones plus every key the pack itself defines), so field
  // picklistKey resolution below can see picklists created earlier in the
  // same pack.
  const availablePicklistKeys = new Set(snapshot.picklists.keys());

  for (const pl of pack.picklists ?? []) {
    availablePicklistKeys.add(pl.key);
    const existing = snapshot.picklists.get(pl.key);

    if (!existing) {
      creates.push({ kind: "picklist", summary: `Create picklist "${pl.label}" (${pl.key})` });
      for (const o of pl.options) {
        creates.push({ kind: "option", summary: `Add option "${o.value}" to ${pl.key}` });
      }
      continue;
    }

    for (const o of pl.options) {
      const existingLabel = existing.options.get(o.value);
      if (existingLabel === undefined) {
        creates.push({ kind: "option", summary: `Add option "${o.value}" to ${pl.key}` });
      } else if (existingLabel === (o.label ?? o.value)) {
        // identical value+label already present — silent no-op
      } else {
        conflicts.push({
          kind: "option",
          summary: `Option "${o.value}" in ${pl.key} already exists with a different label — kept tenant's`,
        });
      }
    }
  }

  // -- fields --------------------------------------------------------------
  for (const f of pack.fields ?? []) {
    if (snapshot.fields.has(fieldKey(f.module, f.label))) {
      conflicts.push({ kind: "field", summary: `Field "${f.label}" already exists on ${f.module} — kept tenant's` });
      continue;
    }
    if (f.picklistKey && !availablePicklistKeys.has(f.picklistKey)) {
      conflicts.push({
        kind: "field",
        summary: `Field "${f.label}" references unknown picklist "${f.picklistKey}" — skipped`,
      });
      continue;
    }
    creates.push({ kind: "field", summary: `Add field "${f.label}" (${f.type}) to ${f.module}` });
  }

  return { creates, updates, conflicts };
}

// ── DB-backed snapshot + preview/apply/export ───────────────────────────────

async function buildSnapshot(tenantId: string): Promise<PackPlanSnapshot> {
  await ensureStudioDefaults(tenantId);

  const [modules, picklistDefs, fieldDefs] = await Promise.all([
    db.moduleConfig.findMany({ where: { tenantId } }),
    db.picklistDef.findMany({ where: { tenantId }, include: { options: true } }),
    db.fieldDef.findMany({ where: { tenantId } }),
  ]);

  const modulesMap = new Map(modules.map((m) => [m.module, { labelSingular: m.labelSingular, labelPlural: m.labelPlural }]));

  const picklistsMap = new Map<string, { id: string; options: Map<string, string> }>();
  for (const pd of picklistDefs) {
    picklistsMap.set(pd.key, { id: pd.id, options: new Map(pd.options.map((o) => [o.value, o.label])) });
  }

  const fieldsSet = new Set(fieldDefs.map((f) => fieldKey(f.module, f.label)));

  return { modules: modulesMap, picklists: picklistsMap, fields: fieldsSet };
}

/** Dry-run: classify a pack against a tenant's live config. Zero writes. */
export async function previewPack(tenantId: string, pack: StudioPack): Promise<PackDiff> {
  const snapshot = await buildSnapshot(tenantId);
  return planPack(pack, snapshot);
}

/**
 * Apply a pack to a tenant: computes the same diff as previewPack, then
 * executes every "create" and "update" item inside a single transaction
 * (conflicts are never written — the tenant's existing config always wins).
 * Logs exactly one StudioChangeLog entry for the whole apply.
 */
export async function applyPack(
  tenantId: string,
  actorId: string | null,
  pack: StudioPack,
  source: "template" | "ai" = "template"
): Promise<PackDiff> {
  const snapshot = await buildSnapshot(tenantId);
  const diff = planPack(pack, snapshot);

  await db.$transaction(async (tx) => {
    // -- modules: apply the rename for every module the plan marked "update" --
    for (const m of pack.modules ?? []) {
      if (!snapshot.modules.has(m.module)) continue; // conflict — skip
      await tx.moduleConfig.update({
        where: { tenantId_module: { tenantId, module: m.module } },
        data: {
          ...(m.labelSingular !== undefined ? { labelSingular: m.labelSingular } : {}),
          ...(m.labelPlural !== undefined ? { labelPlural: m.labelPlural } : {}),
        },
      });
    }

    // -- picklists: create new PicklistDefs, append non-colliding options --
    // picklistDefId per key, populated as we go so field creation below can
    // resolve picklistKey → id for picklists created earlier in this same
    // apply (mirrors availablePicklistKeys in planPack).
    const picklistIds = new Map<string, string>();
    for (const [key, existing] of snapshot.picklists) picklistIds.set(key, existing.id);

    for (const pl of pack.picklists ?? []) {
      let existing = snapshot.picklists.get(pl.key);

      if (!existing) {
        const created = await tx.picklistDef.create({ data: { tenantId, key: pl.key, label: pl.label, system: false } });
        picklistIds.set(pl.key, created.id);
        existing = { id: created.id, options: new Map() };
      }

      let sortOrder = existing.options.size;
      for (const o of pl.options) {
        const existingLabel = existing.options.get(o.value);
        if (existingLabel !== undefined) continue; // create-skip or conflict — never write
        await tx.picklistOption.create({
          data: {
            picklistDefId: picklistIds.get(pl.key)!,
            value: o.value,
            label: o.label ?? o.value,
            tone: o.tone ?? null,
            category: o.category ?? null,
            meta: JSON.stringify(o.meta ?? {}),
            sortOrder: sortOrder++,
          },
        });
      }
    }

    // -- fields: create custom FieldDefs for every non-conflicting field --
    // Track taken codes + next sortOrder per module (queried once per module
    // touched by this pack, not per field).
    const takenCodes = new Map<string, Set<string>>();
    const nextSort = new Map<string, number>();

    for (const f of pack.fields ?? []) {
      if (snapshot.fields.has(fieldKey(f.module, f.label))) continue; // conflict — skip
      const picklistDefId = f.picklistKey ? picklistIds.get(f.picklistKey) : undefined;
      if (f.picklistKey && !picklistDefId) continue; // conflict (unresolvable picklist) — skip

      if (!takenCodes.has(f.module)) {
        const existingFields = await tx.fieldDef.findMany({ where: { tenantId, module: f.module }, select: { code: true, sortOrder: true } });
        takenCodes.set(f.module, new Set(existingFields.map((e) => e.code)));
        nextSort.set(f.module, existingFields.reduce((max, e) => Math.max(max, e.sortOrder), -1) + 1);
      }

      const taken = takenCodes.get(f.module)!;
      const code = makeFieldCode(f.label, taken);
      taken.add(code);
      const sortOrder = nextSort.get(f.module)!;
      nextSort.set(f.module, sortOrder + 1);

      await tx.fieldDef.create({
        data: {
          tenantId,
          module: f.module,
          code,
          label: f.label,
          type: f.type,
          system: false,
          required: !!f.required,
          helpText: f.helpText ?? null,
          picklistId: picklistDefId ?? null,
          sortOrder,
        },
      });
    }
  });

  await logStudioChange({
    tenantId,
    actorId,
    source,
    object: "StudioPack",
    objectId: pack.key,
    action: "apply_pack",
    after: diff,
  });

  return diff;
}

/**
 * Serialize a tenant's current Studio config back into a StudioPack: every
 * custom (non-system, non-archived) field, every picklist option that isn't
 * part of the shipped DEFAULT_PICKLISTS baseline (custom picklists export in
 * full), and every module whose labels diverge from DEFAULT_MODULES.
 */
export async function exportPack(tenantId: string): Promise<StudioPack> {
  await ensureStudioDefaults(tenantId);

  const [modules, picklistDefs, fieldDefs] = await Promise.all([
    db.moduleConfig.findMany({ where: { tenantId } }),
    db.picklistDef.findMany({ where: { tenantId }, include: { options: true } }),
    db.fieldDef.findMany({ where: { tenantId } }),
  ]);

  const moduleRenames = modules
    .filter((m) => {
      const base = DEFAULT_MODULES.find((d) => d.module === m.module);
      return base && (base.labelSingular !== m.labelSingular || base.labelPlural !== m.labelPlural);
    })
    .map((m) => ({ module: m.module, labelSingular: m.labelSingular, labelPlural: m.labelPlural }));

  const picklists = picklistDefs
    .map((pd) => {
      const base = DEFAULT_PICKLISTS.find((d) => d.key === pd.key);
      const nonDefaultOptions = pd.options.filter((o) => !base || !base.options.some((bo) => bo.value === o.value));
      if (nonDefaultOptions.length === 0) return null;
      return {
        key: pd.key,
        label: pd.label,
        options: nonDefaultOptions.map((o) => ({
          value: o.value,
          label: o.label,
          category: o.category,
          tone: o.tone,
          meta: JSON.parse(o.meta || "{}"),
        })),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const picklistKeyById = new Map(picklistDefs.map((pd) => [pd.id, pd.key]));

  const fields = fieldDefs
    .filter((f) => !f.system && !f.archived)
    .map((f) => ({
      module: f.module,
      label: f.label,
      type: f.type,
      required: f.required,
      ...(f.helpText ? { helpText: f.helpText } : {}),
      ...(f.picklistId && picklistKeyById.has(f.picklistId) ? { picklistKey: picklistKeyById.get(f.picklistId)! } : {}),
    }));

  return {
    key: `tenant-export-${tenantId}`,
    name: "Tenant Export",
    industry: "custom",
    description: "Snapshot of this tenant's current Studio configuration (custom fields, custom picklist options, module renames).",
    modules: moduleRenames,
    picklists,
    fields,
  };
}
