import * as React from "react";
import { db } from "@/lib/db";
import { ensureStudioDefaults } from "./defaults";

// React.cache exists in the RSC runtime; fall back to identity outside it
// (vitest, scripts) so this module stays importable everywhere.
const rscCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

/**
 * Orbit Studio — per-request config bundle.
 *
 * getStudioConfig(tenantId) loads the whole tenant configuration in two
 * queries, wrapped in React cache() so a page render pays for it once.
 * Business logic keys on option CATEGORY (won/lost/open/marketplace/...),
 * never on labels or values — tenants can rename anything without breaking
 * revenue math, copilot answers, or AI scoring.
 */

export type StudioOption = {
  value: string;
  label: string;
  tone: string | null;
  category: string | null;
  meta: Record<string, unknown>;
  sortOrder: number;
  isDefault: boolean;
  archived: boolean;
};

export type StudioModule = {
  module: string;
  labelSingular: string;
  labelPlural: string;
  enabled: boolean;
  inNav: boolean;
  navGroup: string | null;
  navOrder: number;
  inGlobalSearch: boolean;
};

export type StudioConfig = {
  tenantId: string;
  modules: Map<string, StudioModule>;
  picklists: Map<string, StudioOption[]>; // key → options sorted, incl. archived (filter at use site)
};

function parseMeta(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
}

export const getStudioConfig = rscCache(async (tenantId: string): Promise<StudioConfig> => {
  await ensureStudioDefaults(tenantId);
  const [modules, defs] = await Promise.all([
    db.moduleConfig.findMany({ where: { tenantId } }),
    db.picklistDef.findMany({ where: { tenantId }, include: { options: { orderBy: { sortOrder: "asc" } } } }),
  ]);

  const moduleMap = new Map<string, StudioModule>();
  for (const m of modules) {
    moduleMap.set(m.module, {
      module: m.module,
      labelSingular: m.labelSingular,
      labelPlural: m.labelPlural,
      enabled: m.enabled,
      inNav: m.inNav,
      navGroup: m.navGroup,
      navOrder: m.navOrder,
      inGlobalSearch: m.inGlobalSearch,
    });
  }

  const picklists = new Map<string, StudioOption[]>();
  for (const d of defs) {
    picklists.set(
      d.key,
      d.options.map((o) => ({
        value: o.value,
        label: o.label,
        tone: o.tone,
        category: o.category,
        meta: parseMeta(o.meta),
        sortOrder: o.sortOrder,
        isDefault: o.isDefault,
        archived: o.archived,
      }))
    );
  }

  return { tenantId, modules: moduleMap, picklists };
});

// ── Helpers (all read the bundle — no extra queries) ───────────────────────

/** Active (non-archived) options of a picklist, in order. */
export function options(config: StudioConfig, key: string): StudioOption[] {
  return (config.picklists.get(key) ?? []).filter((o) => !o.archived);
}

/** Option values (active) — drop-in replacement for the old hardcoded arrays. */
export function optionValues(config: StudioConfig, key: string): string[] {
  return options(config, key).map((o) => o.value);
}

/** Values whose category matches — the ONLY sanctioned way to filter by business meaning. */
export function valuesByCategory(config: StudioConfig, key: string, ...categories: string[]): string[] {
  const set = new Set(categories);
  // Include archived options here: historical rows may still carry them and
  // category-based queries must keep matching those rows.
  return (config.picklists.get(key) ?? []).filter((o) => o.category && set.has(o.category)).map((o) => o.value);
}

/** Display label for a stored value (falls back to the raw value, incl. archived). */
export function optionLabel(config: StudioConfig, key: string, value: string): string {
  return (config.picklists.get(key) ?? []).find((o) => o.value === value)?.label ?? value;
}

/** Badge tone for a stored value. */
export function optionTone(config: StudioConfig, key: string, value: string): string | null {
  return (config.picklists.get(key) ?? []).find((o) => o.value === value)?.tone ?? null;
}

/** Meta field (e.g. stage probability) for a stored value. */
export function optionMeta(config: StudioConfig, key: string, value: string): Record<string, unknown> {
  return (config.picklists.get(key) ?? []).find((o) => o.value === value)?.meta ?? {};
}

/** Default option value of a picklist (first active if none flagged). */
export function defaultValue(config: StudioConfig, key: string): string | undefined {
  const act = options(config, key);
  return (act.find((o) => o.isDefault) ?? act[0])?.value;
}

/** Module display label. */
export function moduleLabel(config: StudioConfig, module: string, form: "singular" | "plural" = "plural"): string {
  const m = config.modules.get(module);
  if (!m) return module;
  return form === "singular" ? m.labelSingular : m.labelPlural;
}

/** Is a module enabled for this tenant? Unknown modules default to enabled. */
export function moduleEnabled(config: StudioConfig, module: string): boolean {
  return config.modules.get(module)?.enabled ?? true;
}

/**
 * The next value in a picklist's active order — replaces the old hardcoded
 * STATUS_FLOW/STAGE_FLOW walks. Restrict with `categories` to define the flow
 * (e.g. lead advance = ["open","converted"], so Dead is never a "next").
 * Returns undefined at the end of the flow or if `current` isn't in it.
 */
export function nextOptionValue(
  config: StudioConfig,
  key: string,
  current: string,
  categories?: string[]
): string | undefined {
  const flow = options(config, key).filter(
    (o) => !categories || (o.category != null && categories.includes(o.category))
  );
  const idx = flow.findIndex((o) => o.value === current);
  if (idx < 0 || idx >= flow.length - 1) return undefined;
  return flow[idx + 1].value;
}

/**
 * Server-side write validation: is this value an ACTIVE option of the list?
 * Every action that writes a picklist-backed column must gate on this
 * (archived options remain readable on old rows but are not writable).
 */
export function isValidOption(config: StudioConfig, key: string, value: string): boolean {
  return options(config, key).some((o) => o.value === value);
}
