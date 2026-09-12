"use server";

import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { draftStudioConfig } from "@/lib/ai";
import { planLimits } from "@/lib/billing";
import { previewPack, applyPack, type StudioPack, type PackDiff } from "@/lib/studio/packs";

/**
 * Orbit Studio — AI onboarding interview (WS8).
 *
 * Two-step, human-approves flow: proposeAction only ever calls the AI (or
 * its industry-template fallback via lib/ai.ts's draftStudioConfig) and
 * previews the resulting diff — nothing is written. applyProposalAction is
 * the only place that writes, and it NEVER trusts the pack JSON that
 * traveled back from the client — it re-parses and re-validates every field
 * against the same caps and allow-lists as lib/ai.ts's own sanitizer before
 * calling applyPack (source "ai"; applyPack itself writes the single
 * StudioChangeLog entry for the apply, same as /studio/templates' applyAction).
 */

/** Guard: Studio writes are admin-territory (CEO bypasses; roles need studio:write). */
async function requireStudioWrite() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) throw new Error("No studio access");
  return s;
}

const STUDIO_PACK_MODULES = new Set(["leads", "opportunities", "accounts", "quotations", "tickets", "products"]);
const STUDIO_FIELD_TYPES = new Set(["text", "number", "currency", "date", "checkbox", "picklist"]);

function slugKey(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * Strict re-validation of a pack payload against lib/studio/packs.ts's
 * `StudioPack` shape. Unlike lib/ai.ts's sanitizer (which silently
 * clamps/drops so a first draft always renders something), this REJECTS
 * anything over cap or referencing an unknown module/type — a hand-crafted
 * request must not be able to smuggle in more than the interview could ever
 * legitimately produce.
 */
function validatePackShape(raw: unknown): { pack: StudioPack } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Malformed configuration data." };
  const r = raw as Record<string, unknown>;

  const modulesRaw = Array.isArray(r.modules) ? r.modules : [];
  if (modulesRaw.length > 3) return { error: "Too many module renames (max 3)." };
  const modules: { module: string; labelSingular: string; labelPlural: string }[] = [];
  for (const x of modulesRaw) {
    if (!x || typeof x !== "object") return { error: "Malformed module rename." };
    const o = x as Record<string, unknown>;
    const module = String(o.module || "");
    if (!STUDIO_PACK_MODULES.has(module)) return { error: `Unknown module "${module}".` };
    const labelSingular = String(o.labelSingular || "").trim();
    const labelPlural = String(o.labelPlural || "").trim();
    if (!labelSingular || !labelPlural) return { error: "Module rename is missing a label." };
    modules.push({ module, labelSingular: labelSingular.slice(0, 40), labelPlural: labelPlural.slice(0, 40) });
  }

  const picklistsRaw = Array.isArray(r.picklists) ? r.picklists : [];
  if (picklistsRaw.length > 3) return { error: "Too many picklists (max 3)." };
  const picklists: { key: string; label: string; options: { value: string; category: null }[] }[] = [];
  for (const x of picklistsRaw) {
    if (!x || typeof x !== "object") return { error: "Malformed picklist." };
    const o = x as Record<string, unknown>;
    const key = slugKey(String(o.key || ""));
    const label = String(o.label || "").trim();
    if (!key || !label) return { error: "Picklist is missing a key or label." };
    const optionsRaw = Array.isArray(o.options) ? o.options : [];
    const options: { value: string; category: null }[] = [];
    for (const opt of optionsRaw) {
      if (!opt || typeof opt !== "object") return { error: "Malformed picklist option." };
      const value = String((opt as Record<string, unknown>).value || "").trim();
      if (value) options.push({ value: value.slice(0, 40), category: null });
    }
    if (options.length === 0) return { error: `Picklist "${label}" has no options.` };
    picklists.push({ key, label: label.slice(0, 40), options: options.slice(0, 12) });
  }
  const picklistKeys = new Set(picklists.map((p) => p.key));

  const fieldsRaw = Array.isArray(r.fields) ? r.fields : [];
  if (fieldsRaw.length > 8) return { error: "Too many fields (max 8)." };
  const fields: { module: string; label: string; type: string; picklistKey?: string }[] = [];
  for (const x of fieldsRaw) {
    if (!x || typeof x !== "object") return { error: "Malformed field." };
    const o = x as Record<string, unknown>;
    const module = String(o.module || "");
    if (!STUDIO_PACK_MODULES.has(module)) return { error: `Unknown module "${module}" on a field.` };
    const type = String(o.type || "");
    if (!STUDIO_FIELD_TYPES.has(type)) return { error: `Unknown field type "${type}".` };
    const label = String(o.label || "").trim();
    if (!label) return { error: "Field is missing a label." };
    const picklistKey = o.picklistKey ? slugKey(String(o.picklistKey)) : undefined;
    if (type === "picklist" && (!picklistKey || !picklistKeys.has(picklistKey))) {
      return { error: `Field "${label}" references an unknown picklist.` };
    }
    fields.push({ module, label: label.slice(0, 40), type, ...(picklistKey ? { picklistKey } : {}) });
  }

  const key = String(r.key || "ai-proposal").trim() || "ai-proposal";
  const name = String(r.name || "AI-drafted configuration").trim().slice(0, 60) || "AI-drafted configuration";
  const industry = String(r.industry || "Custom").trim().slice(0, 60) || "Custom";
  const description = String(r.description || "").trim().slice(0, 200);

  const pack: StudioPack = { key, name, industry, description, modules, picklists, fields };
  return { pack };
}

export type ProposeResult =
  | { ok: true; pack: StudioPack; diff: PackDiff; source: "model" | "fallback"; note?: string }
  | { ok: false; error: string };

const AI_ONBOARDING_GATED_ERROR =
  "AI onboarding is available on Growth and Scale plans — you can still apply an industry template.";

export async function proposeAction(input: {
  description: string;
  sells: string;
  buyers: string;
  dealWord: string;
}): Promise<ProposeResult> {
  const s = await requireStudioWrite();

  if (!(await planLimits(s.tenantId)).aiOnboarding) {
    return { ok: false, error: AI_ONBOARDING_GATED_ERROR };
  }

  const description = String(input.description || "").trim().slice(0, 2000);
  const sells = String(input.sells || "").trim().slice(0, 500);
  const buyers = String(input.buyers || "").trim().slice(0, 500);
  const dealWord = String(input.dealWord || "").trim().slice(0, 60);
  if (!description) return { ok: false, error: "Describe your business first." };

  const { pack: rawPack, source, note } = await draftStudioConfig({ description, sells, buyers, dealWord });
  const validated = validatePackShape(rawPack);
  if ("error" in validated) {
    return { ok: false, error: `Could not build a configuration from that description (${validated.error}) — try adding more detail.` };
  }

  const diff = await previewPack(s.tenantId, validated.pack);
  return { ok: true, pack: validated.pack, diff, source, note };
}

export type ApplyResult = { ok: true; diff: PackDiff } | { ok: false; error: string };

/** packJson: the exact pack object proposeAction returned, round-tripped through JSON by the client. Re-validated in full here — never trust it. */
export async function applyProposalAction(packJson: string): Promise<ApplyResult> {
  const s = await requireStudioWrite();

  if (!(await planLimits(s.tenantId)).aiOnboarding) {
    return { ok: false, error: AI_ONBOARDING_GATED_ERROR };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(packJson);
  } catch {
    return { ok: false, error: "Malformed configuration data." };
  }

  const validated = validatePackShape(raw);
  if ("error" in validated) return { ok: false, error: validated.error };

  const diff = await applyPack(s.tenantId, s.userId, validated.pack, "ai");
  return { ok: true, diff };
}
