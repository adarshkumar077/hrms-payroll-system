import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader, Empty } from "@/components/ui";
import { ensureConvertMaps } from "@/lib/studio/convert";
import { ensureDedupeRule, parseRuleFields } from "@/lib/studio/dedupe";
import { ConvertMapEditor, type MappingRow } from "./ConvertMapEditor";
import { DedupeEditor } from "./DedupeEditor";
import {
  CONVERT_TARGETS,
  CONVERT_TARGET_LABELS,
  CONVERT_TARGET_FIELDS,
  STANDARD_LEAD_SOURCE_FIELDS,
  DEDUPE_FIELDS,
} from "./constants";

// Dedupe fields offered per module — must be a subset of what
// lib/studio/dedupe.ts MODULES actually matches on for that module.
// Contacts has no "company" column, so it drops that one field from the
// shared leads list.
const CONTACTS_DEDUPE_FIELDS = DEDUPE_FIELDS.filter((f) => f !== "company");

export const dynamic = "force-dynamic";

/** Safe-parse a ConvertMap.mappings JSON blob — malformed/corrupt data renders as no rows rather than crashing the page. */
function parseMappings(json: string): MappingRow[] {
  try {
    const parsed = JSON.parse(json || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is { source: unknown; target: unknown } => m && typeof m === "object")
      .map((m) => ({ source: String((m as { source?: unknown }).source ?? ""), target: String((m as { target?: unknown }).target ?? "") }))
      .filter((m) => m.source && m.target);
  } catch {
    return [];
  }
}

/**
 * Orbit Studio — Convert & Duplicate Rules (WS6).
 * Two independent config surfaces: Lead → Account/Contact/Opportunity field
 * mapping (ConvertMap, drives lib/studio/convert.ts convertLead), and
 * per-module duplicate-detection rules (DedupeRule, drives lib/studio/dedupe.ts
 * checkDuplicates — leads and contacts in v1). Both are lazily defaulted so
 * this page always has rows to render.
 */
export default async function StudioRulesPage() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Convert & Duplicate Rules" subtitle="Configure how leads convert and how duplicates are caught." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  await Promise.all([
    ensureConvertMaps(s.tenantId),
    ensureDedupeRule(s.tenantId, "leads"),
    ensureDedupeRule(s.tenantId, "contacts"),
  ]);

  const [convertMaps, leadsDedupeRule, contactsDedupeRule, customLeadFields] = await Promise.all([
    db.convertMap.findMany({ where: { tenantId: s.tenantId, sourceModule: "lead" } }),
    db.dedupeRule.findUnique({ where: { tenantId_module: { tenantId: s.tenantId, module: "leads" } } }),
    db.dedupeRule.findUnique({ where: { tenantId_module: { tenantId: s.tenantId, module: "contacts" } } }),
    db.fieldDef.findMany({
      where: { tenantId: s.tenantId, module: "leads", system: false, archived: false },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const sourceFields = [
    ...STANDARD_LEAD_SOURCE_FIELDS,
    ...customLeadFields.map((f) => ({ value: f.code, label: f.label })),
  ];

  const leadsDedupeGroups = leadsDedupeRule ? parseRuleFields(leadsDedupeRule.fields) : [];
  const contactsDedupeGroups = contactsDedupeRule ? parseRuleFields(contactsDedupeRule.fields) : [];

  return (
    <div>
      <PageHeader
        title="Convert & Duplicate Rules"
        subtitle="Decide which lead fields flow into Accounts, Contacts & Opportunities, and how duplicate leads are caught."
        action={
          <Link href="/studio" className="btn-ghost text-xs py-1.5">
            ← Studio
          </Link>
        }
      />

      <div className="mb-8">
        <div className="font-semibold text-slate-800 mb-1">Lead Conversion</div>
        <p className="text-xs text-slate-500 mb-3 max-w-2xl">
          When a lead is converted, each enabled target below is created and populated from the mapped lead fields.
          Disable a target to skip creating it; mappings only copy a field when the lead has a value for it.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {CONVERT_TARGETS.map((target) => {
            const row = convertMaps.find((m) => m.targetModule === target);
            return (
              <ConvertMapEditor
                key={target}
                target={target}
                targetLabel={CONVERT_TARGET_LABELS[target]}
                sourceFields={sourceFields}
                targetFields={CONVERT_TARGET_FIELDS[target]}
                initialEnabled={row?.enabled ?? true}
                initialRequired={row?.required ?? false}
                initialMappings={row ? parseMappings(row.mappings) : []}
                note={
                  target === "opportunity"
                    ? "Only Name is mappable — amount/stage/probability are computed automatically at convert time."
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="font-semibold text-slate-800 mb-1">Duplicate Rules</div>
        <p className="text-xs text-slate-500 mb-3 max-w-2xl">
          Leads and Contacts in v1. Checked whenever a record is created (contacts) or created/edited (leads) — Warn
          lets the save through and flags the match, Block refuses the save.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DedupeEditor
            module="leads"
            moduleLabel="Leads"
            fields={DEDUPE_FIELDS}
            initialEnabled={leadsDedupeRule?.enabled ?? true}
            initialMode={leadsDedupeRule?.mode === "block" ? "block" : "warn"}
            initialGroups={leadsDedupeGroups}
          />
          <DedupeEditor
            module="contacts"
            moduleLabel="Contacts"
            fields={CONTACTS_DEDUPE_FIELDS}
            initialEnabled={contactsDedupeRule?.enabled ?? true}
            initialMode={contactsDedupeRule?.mode === "block" ? "block" : "warn"}
            initialGroups={contactsDedupeGroups}
          />
        </div>
      </div>
    </div>
  );
}
