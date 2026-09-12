// Orbit AI layer — provider-agnostic.
// Priority: (1) any OpenAI-compatible endpoint via LLM_BASE_URL/LLM_API_KEY/LLM_MODEL
//           (works with Groq, Google Gemini, OpenRouter, Together, local Ollama, etc.),
//           (2) Anthropic (ANTHROPIC_API_KEY), (3) deterministic local heuristic fallback.
// Design law: every function degrades gracefully so the app is ALWAYS demoable.

const llmBase = process.env.LLM_BASE_URL;
const llmKey = process.env.LLM_API_KEY;
const llmModel = process.env.LLM_MODEL || "llama-3.3-70b-versatile";

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export const aiProvider: "openai-compatible" | "anthropic" | "local" = llmBase && llmKey
  ? "openai-compatible"
  : anthropicKey
    ? "anthropic"
    : "local";

export const aiEnabled = aiProvider !== "local";

export const aiProviderLabel =
  aiProvider === "openai-compatible"
    ? `${hostLabel(llmBase!)} · ${llmModel}`
    : aiProvider === "anthropic"
      ? "Claude"
      : "Local";

function hostLabel(url: string): string {
  try {
    const h = new URL(url).host;
    if (h.includes("groq")) return "Groq";
    if (h.includes("google")) return "Gemini";
    if (h.includes("openrouter")) return "OpenRouter";
    if (h.includes("together")) return "Together";
    if (h.includes("localhost") || h.includes("127.0.0.1")) return "Ollama";
    return h;
  } catch {
    return "LLM";
  }
}

// ── Unified completion ────────────────────────────────────────
async function complete(system: string, user: string, maxTokens = 400): Promise<string> {
  if (aiProvider === "openai-compatible") {
    const res = await fetch(`${trimSlash(llmBase!)}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llmKey}`,
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.4,
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text().catch(() => "")}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }

  if (aiProvider === "anthropic") {
    // Lazy import so the app builds/runs even if the SDK is absent.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicKey });
    const msg = await client.messages.create({
      model: anthropicModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b: any) => b.type === "text");
    return block && (block as any).type === "text" ? (block as any).text : "";
  }

  throw new Error("NO_AI");
}

function trimSlash(u: string) {
  return u.replace(/\/+$/, "");
}

// ── AI-5: Lead scoring ────────────────────────────────────────
// `ctx.sourceCategory` is the Studio `lead_source` picklist option's CATEGORY
// (e.g. "marketplace"), not the literal source value — lets tenant-renamed or
// tenant-added sources score correctly. Omit `ctx` entirely for legacy,
// literal-source-list behavior (back-compat for callers that haven't migrated).
export async function scoreLead(
  lead: {
    name: string;
    company?: string | null;
    source: string;
    email?: string | null;
    phone?: string | null;
  },
  ctx?: { sourceCategory?: string | null }
): Promise<{ score: number; reason: string; source: "model" | "fallback" }> {
  if (aiEnabled) {
    try {
      const leadForPrompt =
        ctx?.sourceCategory != null
          ? { ...lead, source: `${lead.source} (category: ${ctx.sourceCategory})` }
          : lead;
      const txt = await complete(
        'You are a B2B sales lead scorer for an Indian SMB. Respond with ONLY compact JSON: {"score":<0-100 integer>,"reason":"<max 12 words>"}. No prose, no markdown.',
        `Lead: ${JSON.stringify(leadForPrompt)}. Score conversion likelihood.`,
        150
      );
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) {
        const p = JSON.parse(m[0]);
        return {
          score: clamp(p.score),
          reason: String(p.reason || "AI scored").slice(0, 80),
          source: "model",
        };
      }
    } catch {
      /* fall through to heuristic */
    }
  }
  return { ...heuristicScore(lead, ctx), source: "fallback" };
}

function heuristicScore(
  lead: { company?: string | null; source: string; email?: string | null; phone?: string | null },
  ctx?: { sourceCategory?: string | null }
) {
  let s = 40;
  const reasons: string[] = [];
  const isMarketplace =
    ctx !== undefined
      ? ctx.sourceCategory === "marketplace"
      : ["IndiaMART", "JustDial", "TradeIndia"].includes(lead.source);
  if (isMarketplace) {
    s += 20;
    reasons.push("high-intent marketplace source");
  }
  if (lead.company) {
    s += 15;
    reasons.push("named company");
  }
  if (lead.email) s += 10;
  if (lead.phone) s += 10;
  return { score: clamp(s), reason: reasons.join(", ") || "baseline profile" };
}

// ── AI-2: Follow-up drafting ──────────────────────────────────
export async function draftFollowUp(ctx: {
  leadName: string;
  company?: string | null;
  channel: "email" | "whatsapp";
  context?: string;
}): Promise<string> {
  if (aiEnabled) {
    try {
      const out = await complete(
        "You draft short, warm B2B sales follow-ups for an Indian SMB. Professional, concise, India business English. Return only the message.",
        `Draft a ${ctx.channel} follow-up to ${ctx.leadName}${ctx.company ? " at " + ctx.company : ""}. ${ctx.context || ""}`,
        350
      );
      if (out.trim()) return out.trim();
    } catch {
      /* fall through */
    }
  }
  const hi = ctx.channel === "whatsapp" ? "Hi" : "Dear";
  return `${hi} ${ctx.leadName},\n\nThank you for your interest${ctx.company ? " on behalf of " + ctx.company : ""}. I'd love to show you how Orbit can streamline your operations. Would a quick 15-minute call this week work?\n\nWarm regards,\nSales Team`;
}

// ── AI-3: Call summarization ──────────────────────────────────
export async function summarizeCall(transcript: string): Promise<string> {
  if (aiEnabled) {
    try {
      const out = await complete(
        "Summarize this sales call in exactly 2 bullet points followed by one 'Next step:' line. Be crisp. Return only the summary.",
        transcript,
        250
      );
      if (out.trim()) return out.trim();
    } catch {
      /* fall through */
    }
  }
  const words = transcript.split(/\s+/).filter(Boolean).length;
  return `• Call logged (${words} words).\n• Key points captured.\nNext step: schedule follow-up.`;
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

// ── AI-8: Studio onboarding — "describe your business" → draft config ──
// The shape below deliberately MIRRORS lib/studio/packs.ts's `StudioPack`
// (key/name/industry/description, modules/picklists/fields) without
// importing it: lib/ai.ts is a low-level leaf module (imported from many
// places), and packs.ts is Studio domain logic — importing it here would
// risk a load-order cycle. Callers that need the real `StudioPack` type
// re-validate/re-shape this object against it themselves (see
// app/(app)/studio/templates/interview/actions.ts).
const STUDIO_PACK_MODULES = ["leads", "opportunities", "accounts", "quotations", "tickets", "products"] as const;
const STUDIO_FIELD_TYPES = ["text", "number", "currency", "date", "checkbox", "picklist"] as const;

type DraftedPickOption = { value: string; category: null };
type DraftedPicklist = { key: string; label: string; options: DraftedPickOption[] };
type DraftedField = {
  module: (typeof STUDIO_PACK_MODULES)[number];
  label: string;
  type: (typeof STUDIO_FIELD_TYPES)[number];
  picklistKey?: string;
};
/** Structural mirror of StudioPack — see the module comment above. */
export type DraftedStudioPack = {
  key: string;
  name: string;
  industry: string;
  description: string;
  modules: { module: (typeof STUDIO_PACK_MODULES)[number]; labelSingular: string; labelPlural: string }[];
  picklists: DraftedPicklist[];
  fields: DraftedField[];
};

function slugKey(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// System columns per module that a proposed custom field must not duplicate
// (case-insensitive label match) — the model has repeatedly proposed
// redundant "Name"/"Phone"/etc. fields that already exist as built-ins.
// STUDIO_PACK_MODULES includes "quotations", which has no built-in columns
// list yet, so it's simply absent below (Set() lookup on a missing key is
// safely undefined/empty).
const SYSTEM_COLUMN_LABELS: Record<string, Set<string>> = {
  leads: new Set(["name", "company", "email", "phone", "source", "status"]),
  accounts: new Set(["name", "industry", "phone", "email", "gstin", "address", "city", "state"]),
  opportunities: new Set(["name", "amount", "stage", "probability"]),
  tickets: new Set(["subject", "priority", "status"]),
  contacts: new Set(["name", "email", "phone", "title"]),
  products: new Set(["name", "sku", "hsn", "unit price", "tax rate"]),
};

function isSystemColumnLabel(module: string, label: string): boolean {
  const cols = SYSTEM_COLUMN_LABELS[module];
  return !!cols && cols.has(label.trim().toLowerCase());
}

/** Best-effort sanitizer for the model's JSON — never throws, always returns a usable (possibly empty) pack. */
function sanitizeDraftedPack(raw: unknown): DraftedStudioPack {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const moduleSet = new Set<string>(STUDIO_PACK_MODULES);
  const typeSet = new Set<string>(STUDIO_FIELD_TYPES);

  const modules = (Array.isArray(r.modules) ? r.modules : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      module: String(x.module || ""),
      labelSingular: String(x.labelSingular || "").trim().slice(0, 40),
      labelPlural: String(x.labelPlural || "").trim().slice(0, 40),
    }))
    .filter((x) => moduleSet.has(x.module) && x.labelSingular && x.labelPlural)
    .slice(0, 3) as DraftedStudioPack["modules"];

  const picklists: DraftedPicklist[] = (Array.isArray(r.picklists) ? r.picklists : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => {
      const key = slugKey(String(x.key || ""));
      const label = String(x.label || "").trim().slice(0, 40);
      const options: DraftedPickOption[] = (Array.isArray(x.options) ? x.options : [])
        .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
        .map((o) => ({ value: String(o.value || "").trim().slice(0, 40), category: null as null }))
        .filter((o) => o.value)
        .slice(0, 10);
      return { key, label, options };
    })
    .filter((p) => p.key && p.label && p.options.length > 0)
    .slice(0, 3);

  const picklistKeys = new Set(picklists.map((p) => p.key));

  const fields: DraftedField[] = (Array.isArray(r.fields) ? r.fields : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({
      module: String(x.module || ""),
      label: String(x.label || "").trim().slice(0, 40),
      type: String(x.type || ""),
      picklistKey: x.picklistKey ? slugKey(String(x.picklistKey)) : undefined,
    }))
    .filter((f) => moduleSet.has(f.module) && !!f.label && typeSet.has(f.type))
    .filter((f) => f.type !== "picklist" || (f.picklistKey && picklistKeys.has(f.picklistKey)))
    .filter((f) => !isSystemColumnLabel(f.module, f.label))
    .slice(0, 8) as DraftedField[];

  return {
    key: "ai-proposal",
    name: String(r.name || "AI-drafted configuration").trim().slice(0, 60) || "AI-drafted configuration",
    industry: String(r.industry || "Custom").trim().slice(0, 60) || "Custom",
    description: String(r.description || "").trim().slice(0, 200),
    modules,
    picklists,
    fields,
  };
}

/** industry → lib/studio/packs/*.json key, matched against the free-text interview answers. Order matters (first match wins). */
function matchIndustryPackKey(text: string): string {
  const t = text.toLowerCase();
  if (/\bit\b|\bamc\b|computer/.test(t)) return "it-services-amc";
  if (/trade|trading|distribut|wholesale/.test(t)) return "trading-distribution";
  if (/manufactur|factory|machine/.test(t)) return "manufacturing";
  if (/\bca\b|account|legal|consult|audit/.test(t)) return "professional-services";
  if (/real estate|property|builder/.test(t)) return "real-estate";
  return "trading-distribution";
}

/**
 * AI-8: turn a short free-text business description into a draft Studio
 * configuration (module renames + custom fields + picklists), reviewable as
 * a diff before anything is written (see interview/actions.ts). Design law:
 * AI drafts, human approves — this function never touches the database.
 */
export async function draftStudioConfig(input: {
  description: string;
  sells: string;
  buyers: string;
  dealWord: string;
}): Promise<{ pack: DraftedStudioPack | Record<string, unknown>; source: "model" | "fallback"; note?: string }> {
  if (aiEnabled) {
    try {
      const system =
        'You configure a CRM for a new business. Respond with ONLY compact JSON (no prose, no markdown) matching exactly: ' +
        '{"name":"<short config name>","industry":"<short industry label>","description":"<one line>",' +
        '"modules":[{"module":"<leads|opportunities|accounts|quotations|tickets|products>","labelSingular":"<label>","labelPlural":"<label>"}],' +
        '"picklists":[{"key":"<snake_case>","label":"<list label>","options":[{"value":"<option>","category":null}]}],' +
        '"fields":[{"module":"<leads|opportunities|accounts|quotations|tickets|products>","label":"<field label>","type":"<text|number|currency|date|checkbox|picklist>","picklistKey":"<only if type is picklist, must match a key in picklists>"}]}. ' +
        "Rules: module MUST be one of leads|opportunities|accounts|quotations|tickets|products — never invent a module. " +
        "field type MUST be one of text|number|currency|date|checkbox|picklist. Every picklist option's category MUST be null. " +
        "At most 8 fields total, 3 picklists, 3 module renames. If the business's word for a deal/opportunity is given, rename the opportunities module to it.";
      const user = `Business description: ${input.description}\nWhat they sell: ${input.sells}\nWho buys it: ${input.buyers}\nTheir word for a deal: ${input.dealWord}`;
      const txt = await complete(system, user, 900);
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        return { pack: sanitizeDraftedPack(parsed), source: "model" };
      }
    } catch {
      /* fall through to the industry-template fallback */
    }
  }

  const key = matchIndustryPackKey(`${input.description} ${input.sells} ${input.buyers} ${input.dealWord}`);
  const note = "AI unavailable — suggested the closest industry template instead.";
  try {
    // Runtime-lazy import: keeps lib/ai.ts free of a static dependency on
    // lib/studio/packs.ts (avoids a module-load cycle risk — see the comment
    // on DraftedStudioPack above). Only reached on the fallback path.
    const packsModule: any = await import("@/lib/studio/packs");
    const packs: any[] = typeof packsModule.listPacks === "function" ? packsModule.listPacks() : [];
    const found = packs.find((p) => p && p.key === key) ?? packs[0];
    if (found) return { pack: found, source: "fallback", note };
  } catch {
    /* packs module unavailable — fall through to the empty stub below */
  }
  return {
    pack: { key, name: "Suggested template", industry: key, description: "", modules: [], picklists: [], fields: [] },
    source: "fallback",
    note,
  };
}
