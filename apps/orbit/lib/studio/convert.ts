import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { getStudioConfig, defaultValue, optionMeta, valuesByCategory, type StudioConfig } from "./config";

/**
 * Orbit Studio — Lead → Account + Contact + Opportunity CONVERT action.
 *
 * "Converted" was previously just a lead_status label; this makes it a real
 * transactional action that creates the downstream CRM records and links
 * them back onto the Lead (convertedAccountId/convertedContactId/
 * convertedOpportunityId/convertedAt — see prisma/schema.prisma).
 *
 * Field mapping is tenant-configurable via the ConvertMap model (lazily
 * defaulted here, same pattern as ensureStudioDefaults/ensureChart) so
 * Studio can later expose a UI for editing which lead fields land where
 * without touching this file.
 */

export type FieldMapping = { source: string; target: string };

export type DefaultConvertMap = {
  sourceModule: string;
  targetModule: string;
  enabled: boolean;
  required: boolean;
  mappings: FieldMapping[];
};

// Defaults reference only fields that exist in Orbit today. The opportunity
// map's mappings are intentionally empty — name/amount/stage/probability are
// computed at convert time (see convertLead), not simple field copies.
export const DEFAULT_CONVERT_MAPS: DefaultConvertMap[] = [
  {
    sourceModule: "lead",
    targetModule: "account",
    enabled: true,
    required: false,
    mappings: [
      { source: "company", target: "name" },
      { source: "phone", target: "phone" },
      { source: "email", target: "email" },
    ],
  },
  {
    sourceModule: "lead",
    targetModule: "contact",
    enabled: true,
    required: false,
    mappings: [
      { source: "name", target: "name" },
      { source: "email", target: "email" },
      { source: "phone", target: "phone" },
    ],
  },
  {
    sourceModule: "lead",
    targetModule: "opportunity",
    enabled: true,
    required: false,
    mappings: [],
  },
];

function parseMappings(json: string): FieldMapping[] {
  try {
    const parsed = JSON.parse(json || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseCustom(json: unknown): Record<string, unknown> {
  try {
    return JSON.parse(typeof json === "string" ? json : "{}") || {};
  } catch {
    return {};
  }
}

/**
 * Pure field-mapping applicator: [{source,target}] + a source record → a
 * target-shaped partial record. Skips empty/nullish source values (so
 * `{ ...fallbacks, ...applyMappings(...) }` never clobbers a good default
 * with blank data). Codes starting with "c_" are read from source.custom
 * (Studio custom-field JSON) instead of a top-level property.
 */
export function applyMappings(mappings: FieldMapping[], source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let custom: Record<string, unknown> | undefined;
  for (const m of mappings) {
    let value: unknown;
    if (m.source.startsWith("c_")) {
      custom ??= parseCustom(source.custom);
      value = custom[m.source];
    } else {
      value = source[m.source];
    }
    if (value === undefined || value === null || value === "") continue;
    out[m.target] = value;
  }
  return out;
}

/** Lazily create the 3 default ConvertMap rows if missing. Idempotent (create-catch, like ensureStudioDefaults). */
export async function ensureConvertMaps(tenantId: string): Promise<void> {
  for (const m of DEFAULT_CONVERT_MAPS) {
    const existing = await db.convertMap.findUnique({
      where: { tenantId_sourceModule_targetModule: { tenantId, sourceModule: m.sourceModule, targetModule: m.targetModule } },
    });
    if (existing) continue;
    try {
      await db.convertMap.create({
        data: {
          tenantId,
          sourceModule: m.sourceModule,
          targetModule: m.targetModule,
          enabled: m.enabled,
          required: m.required,
          mappings: JSON.stringify(m.mappings),
        },
      });
    } catch {
      // exists (unique tenantId+sourceModule+targetModule) — concurrent first-use created it
    }
  }
}

export type ConvertResult = {
  error?: string;
  accountId?: string;
  contactId?: string;
  opportunityId?: string;
};

/**
 * Convert a Lead into an Account + Contact + Opportunity in a single
 * transaction, per the tenant's (lazily-defaulted) ConvertMap config.
 * Re-convert is blocked — a converted Lead returns its existing linkage.
 * A target whose ConvertMap row is disabled is skipped (its id stays
 * undefined); if all three are disabled the Lead is still stamped
 * converted+convertedAt.
 */
export async function convertLead(tenantId: string, actorId: string, leadId: string): Promise<ConvertResult> {
  const lead = await db.lead.findFirst({ where: { id: leadId, tenantId } });
  if (!lead) return { error: "Lead not found" };

  if (lead.convertedAt) {
    return {
      error: "Already converted",
      accountId: lead.convertedAccountId ?? undefined,
      contactId: lead.convertedContactId ?? undefined,
      opportunityId: lead.convertedOpportunityId ?? undefined,
    };
  }

  await ensureConvertMaps(tenantId);
  const maps = await db.convertMap.findMany({ where: { tenantId, sourceModule: "lead" } });
  const accountMap = maps.find((m) => m.targetModule === "account");
  const contactMap = maps.find((m) => m.targetModule === "contact");
  const opportunityMap = maps.find((m) => m.targetModule === "opportunity");

  const config: StudioConfig = await getStudioConfig(tenantId);
  const source: Record<string, unknown> = {
    name: lead.name,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    custom: lead.custom,
  };

  const result = await db.$transaction(async (tx) => {
    let accountId: string | undefined;
    let contactId: string | undefined;
    let opportunityId: string | undefined;

    if (accountMap?.enabled) {
      const mapped = applyMappings(parseMappings(accountMap.mappings), source);
      const name = (mapped.name as string | undefined) || lead.company || lead.name;
      const account = await tx.account.create({
        data: {
          tenantId,
          name,
          phone: (mapped.phone as string | undefined) ?? lead.phone,
          email: (mapped.email as string | undefined) ?? lead.email,
        },
      });
      accountId = account.id;
    }

    if (contactMap?.enabled) {
      const mapped = applyMappings(parseMappings(contactMap.mappings), source);
      const contact = await tx.contact.create({
        data: {
          tenantId,
          accountId: accountId ?? null,
          name: (mapped.name as string | undefined) || lead.name,
          email: (mapped.email as string | undefined) ?? lead.email,
          phone: (mapped.phone as string | undefined) ?? lead.phone,
        },
      });
      contactId = contact.id;
    }

    if (opportunityMap?.enabled) {
      const stage = defaultValue(config, "opportunity_stage") ?? "Qualification";
      const probability = Number(optionMeta(config, "opportunity_stage", stage).probability ?? 20);
      const opportunity = await tx.opportunity.create({
        data: {
          tenantId,
          accountId: accountId ?? null,
          name: `Deal — ${lead.company || lead.name}`,
          amount: 0,
          stage,
          probability,
          ownerId: actorId,
        },
      });
      opportunityId = opportunity.id;
    }

    const convertedStatus = valuesByCategory(config, "lead_status", "converted")[0] ?? "Converted";

    await tx.lead.update({
      where: { id: lead.id },
      data: {
        status: convertedStatus,
        convertedAccountId: accountId,
        convertedContactId: contactId,
        convertedOpportunityId: opportunityId,
        convertedAt: new Date(),
      },
    });

    return { accountId, contactId, opportunityId };
  });

  await emit({
    tenantId,
    type: "lead.converted",
    entity: "Lead",
    entityId: lead.id,
    actorId,
    payload: { note: `${lead.name} converted`, ...result },
  });

  return result;
}
