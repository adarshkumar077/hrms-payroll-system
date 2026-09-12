import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inrLakh } from "@/lib/format";
import { PageHeader, StatCard, MoneyStat, Badge } from "@/components/ui";
import { FilterBar } from "@/components/ListControls";
import { parseListParams } from "@/lib/list";
import { MoveStageButton } from "./MoveStageButton";
import { CreateOpportunityForm } from "./CreateOpportunityForm";
import type { CustomFieldSpec } from "@/components/studio/CustomFieldInputs";
import { getStudioConfig, moduleLabel, optionValues, valuesByCategory } from "@/lib/studio/config";

export const dynamic = "force-dynamic";

const stageTone: Record<string, string> = {
  Qualification: "slate",
  Proposal: "blue",
  Negotiation: "amber",
  ClosedWon: "green",
  ClosedLost: "red",
};

export default async function OpportunitiesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  const t = s.tenantId;

  const config = await getStudioConfig(t);
  const stages = optionValues(config, "opportunity_stage");

  const p = parseListParams(searchParams);

  // Stat cards are computed from the full, unfiltered tenant data so they stay accurate
  // regardless of the search/stage filter applied to the board columns below.
  const allOpps = await db.opportunity.findMany({
    where: { tenantId: t },
    orderBy: { createdAt: "desc" },
  });

  const where = {
    tenantId: t,
    ...(p.q ? { name: { contains: p.q } } : {}),
    ...(p.status ? { stage: p.status } : {}),
  };

  const opps = await db.opportunity.findMany({
    where,
    include: { account: true },
    orderBy: { createdAt: "desc" },
  });

  // Data for the "+ New Deal" form: tenant accounts (for the optional account
  // picker) + Studio custom-field defs (module "opportunities") with their
  // picklist options resolved.
  const [accountOptions, fieldDefs] = await Promise.all([
    db.account.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.fieldDef.findMany({
      where: { tenantId: t, module: "opportunities", archived: false },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const picklistIds = fieldDefs.filter((d) => d.picklistId).map((d) => d.picklistId as string);
  const picklistOptionRows = picklistIds.length
    ? await db.picklistOption.findMany({
        where: { picklistDefId: { in: picklistIds }, archived: false },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const customFieldSpecs: CustomFieldSpec[] = fieldDefs.map((d) => ({
    code: d.code,
    label: d.label,
    type: d.type,
    required: d.required,
    helpText: d.helpText,
    picklistOptions: d.picklistId
      ? picklistOptionRows.filter((o) => o.picklistDefId === d.picklistId).map((o) => ({ value: o.value, label: o.label }))
      : undefined,
  }));

  const openStages = valuesByCategory(config, "opportunity_stage", "open");
  const openOpps = allOpps.filter((o) => openStages.includes(o.stage));
  const gross = openOpps.reduce((a, o) => a + o.amount, 0);
  const weighted = openOpps.reduce((a, o) => a + (o.amount * o.probability) / 100, 0);

  // "won this" = won this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const wonStages = valuesByCategory(config, "opportunity_stage", "won");
  const wonThis = allOpps
    .filter((o) => wonStages.includes(o.stage) && new Date(o.createdAt) >= monthStart)
    .reduce((a, o) => a + o.amount, 0);

  const byStage = (stage: string) => opps.filter((o) => o.stage === stage);

  return (
    <div>
      <PageHeader
        title={moduleLabel(config, "opportunities", "plural")}
        subtitle="Opportunities by stage — drag deals toward close."
        action={<CreateOpportunityForm accountOptions={accountOptions} customFields={customFieldSpecs} />}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MoneyStat label="Gross Pipeline" amount={gross} accent="brand" hint="Open opportunities" />
        <MoneyStat label="Weighted Pipeline" amount={weighted} accent="amber" hint="Probability-adjusted" />
        <MoneyStat label="Won This Month" amount={wonThis} accent="green" hint="Closed-won" />
      </div>

      <FilterBar statuses={stages} placeholder="Search deal name…" />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stages.map((stage) => {
          const cards = byStage(stage);
          const total = cards.reduce((a, o) => a + o.amount, 0);
          return (
            <div key={stage} className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={stageTone[stage] || "slate"}>{stage}</Badge>
                <span className="text-xs text-slate-400">{inrLakh(total)}</span>
              </div>
              <div className="space-y-2">
                {cards.length === 0 ? (
                  <div className="card p-3 text-center text-xs text-slate-300">Empty</div>
                ) : (
                  cards.map((o) => (
                    <div key={o.id} className="card p-3">
                      <div className="text-sm font-medium text-slate-800">{o.account?.name || o.name}</div>
                      <Link href={`/opportunities/${o.id}`} className="text-xs text-slate-500 mt-0.5 block hover:text-brand-700 hover:underline">
                        {o.name}
                      </Link>
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <span className="font-semibold text-slate-700">{inrLakh(o.amount)}</span>
                        <span className="text-slate-400">{o.probability}%</span>
                      </div>
                      {openStages.includes(o.stage) && (
                        <div className="mt-2">
                          <MoveStageButton oppId={o.id} />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
