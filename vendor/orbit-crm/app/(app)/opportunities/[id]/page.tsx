import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, Badge } from "@/components/ui";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, optionTone, optionLabel, options, valuesByCategory } from "@/lib/studio/config";
import { getRecordLayout, orderFields } from "@/lib/studio/layouts";
import { parseCustom } from "@/lib/studio/validate";
import { formatElapsed } from "@/lib/tat";
import { TagChips } from "@/components/TagChips";
import { getTagsFor, getTenantTags } from "@/lib/tags";
import { RecordShell } from "@/components/record/RecordShell";
import { InlineField, type InlineFieldOption } from "@/components/record/InlineField";
import { Timeline, type TimelineItem } from "@/components/record/Timeline";
import { TimelineComposer } from "@/components/record/TimelineComposer";
import { AttachmentsPanel } from "@/components/record/AttachmentsPanel";
import { listAttachments } from "@/lib/storage";
import { MoveStageButton } from "../MoveStageButton";
import { updateOpportunityAction, addOpportunityNoteAction } from "../actions";

export const dynamic = "force-dynamic";

// Studio "opportunity_stage" tone key → components/ui.tsx Badge tone prop.
// Tuned so the DEFAULT config renders identically to the old hardcoded
// stageTone map in app/(app)/opportunities/page.tsx (Qualification=slate,
// Proposal=blue, Negotiation=amber, ClosedWon=green, ClosedLost=red) — same
// approach as leads/[id]/page.tsx's STATUS_TONE_TO_BADGE.
const STAGE_TONE_TO_BADGE: Record<string, string> = {
  blue: "slate", // Qualification
  amber: "blue", // Proposal
  violet: "amber", // Negotiation
  emerald: "green", // ClosedWon
  rose: "red", // ClosedLost
};

// EventLog `type` → friendly timeline title. Falls back to payload.note (the
// human-readable note every emit() call in opportunities/actions.ts already
// sets) or the raw type string for anything not listed here.
const EVENT_TITLES: Record<string, (payload: Record<string, unknown>) => string> = {
  "opportunity.created": (p) => (p.note as string) || "Deal created",
  "opportunity.stage.changed": (p) => (p.note as string) || "Stage changed",
  "opportunity.updated": (p) => `Updated ${(p.field as string) || "field"}`,
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default async function OpportunityDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "opportunities", "read"))) return <NoAccess label="Opportunities" />;

  const [opp, config, layoutSpec, oppTags, tenantTags] = await Promise.all([
    db.opportunity.findFirst({
      where: { id: params.id, tenantId: s.tenantId },
      include: { account: true, owner: true, quotations: true },
    }),
    getStudioConfig(s.tenantId),
    getRecordLayout(s.tenantId, "opportunities"),
    getTagsFor(s.tenantId, "opportunities", params.id),
    getTenantTags(s.tenantId),
  ]);
  if (!opp) notFound();

  const [customDefs, accounts, sourceLead] = await Promise.all([
    db.fieldDef.findMany({
      where: { tenantId: s.tenantId, module: "opportunities", archived: false, system: false },
      orderBy: { sortOrder: "asc" },
    }),
    db.account.findMany({ where: { tenantId: s.tenantId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Lead-Created TAT: the lead that converted INTO this opportunity, if any
    // (Lead.convertedOpportunityId is the linkage stamped by convertLead — see
    // lib/studio/convert.ts). Not every opportunity has one (manually created
    // deals don't), so this can be null.
    db.lead.findFirst({ where: { tenantId: s.tenantId, convertedOpportunityId: opp.id }, select: { createdAt: true } }),
  ]);
  const picklistIds = customDefs.map((d) => d.picklistId).filter((id): id is string => !!id);
  const picklistOptionRows = picklistIds.length
    ? await db.picklistOption.findMany({
        where: { picklistDefId: { in: picklistIds }, archived: false },
        orderBy: { sortOrder: "asc" },
      })
    : [];
  const optionsByPicklistId = new Map<string, InlineFieldOption[]>();
  for (const o of picklistOptionRows) {
    const arr = optionsByPicklistId.get(o.picklistDefId) ?? [];
    arr.push({ value: o.value, label: o.label });
    optionsByPicklistId.set(o.picklistDefId, arr);
  }

  const customValues = parseCustom(opp.custom);

  const [activities, events, attachments] = await Promise.all([
    db.activity.findMany({
      where: { tenantId: s.tenantId, relatedTo: `Opportunity:${opp.id}` },
      include: { owner: true },
      orderBy: { createdAt: "desc" },
    }),
    db.eventLog.findMany({
      // activity.created excluded: the Activity row itself renders in the
      // timeline — showing its creation event too duplicates every note.
      where: { tenantId: s.tenantId, entity: "Opportunity", entityId: opp.id, type: { not: "activity.created" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    listAttachments(s.tenantId, "Opportunity", opp.id),
  ]);

  // actorId on EventLog is a raw user id — batch-resolve names for display
  // (same pattern as app/(app)/admin/page.tsx's audit log).
  const eventActorIds = Array.from(new Set(events.map((e) => e.actorId).filter(Boolean))) as string[];
  const eventActors = eventActorIds.length
    ? await db.user.findMany({ where: { id: { in: eventActorIds } }, select: { id: true, name: true } })
    : [];
  const eventActorName = new Map(eventActors.map((a) => [a.id, a.name]));

  const activityItems: TimelineItem[] = activities.map((a) => ({
    id: `activity-${a.id}`,
    kind: a.type,
    title: a.subject,
    meta: a.owner?.name ? `by ${a.owner.name}` : undefined,
    at: a.createdAt,
  }));
  const eventItems: TimelineItem[] = events.map((e) => {
    const payload = parsePayload(e.payload);
    const actorName = e.actorId ? eventActorName.get(e.actorId) : undefined;
    return {
      id: `event-${e.id}`,
      kind: "Event",
      title: (EVENT_TITLES[e.type] ?? ((p: Record<string, unknown>) => (p.note as string) || e.type))(payload),
      meta: actorName ? `by ${actorName}` : undefined,
      at: e.createdAt,
    };
  });
  const timelineItems = [...activityItems, ...eventItems]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 30);

  const addNote = addOpportunityNoteAction.bind(null, `Opportunity:${opp.id}`);

  const stageOptions: InlineFieldOption[] = options(config, "opportunity_stage").map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const accountOptions: InlineFieldOption[] = [{ value: "", label: "— None —" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))];

  const followUpTypeOptions: InlineFieldOption[] = [
    { value: "", label: "— None —" },
    ...options(config, "follow_up_type").map((o) => ({ value: o.value, label: o.label })),
  ];
  const lostReasonOptions: InlineFieldOption[] = [
    { value: "", label: "— None —" },
    ...options(config, "lost_reason").map((o) => ({ value: o.value, label: o.label })),
  ];

  const openStages = valuesByCategory(config, "opportunity_stage", "open");
  const isOpen = openStages.includes(opp.stage);
  // Lost Reason is only shown once the deal is in a "lost" stage — the exact
  // category name used by defaults.ts's opportunity_stage picklist (ClosedLost).
  const lostStages = valuesByCategory(config, "opportunity_stage", "lost");
  const isLostOpp = lostStages.includes(opp.stage);

  // Lead-Created TAT — elapsed time from the source lead's createdAt. Deals
  // stay editable after they close (no lock semantics here, see actions.ts),
  // so there's no dedicated "closedAt" column; once the stage is in a closed
  // category (won or lost) we approximate the close moment with the record's
  // own updatedAt (Prisma @updatedAt — last bumped by the stage-change write
  // itself), otherwise the TAT keeps ticking against "now".
  const closedStages = valuesByCategory(config, "opportunity_stage", "won", "lost");
  const isClosedOpp = closedStages.includes(opp.stage);
  const leadCreatedTat = sourceLead
    ? formatElapsed(sourceLead.createdAt, isClosedOpp ? opp.updatedAt : new Date())
    : null;

  const header = (
    <div className="mb-4">
      <PageHeader
        title={opp.name}
        subtitle={inr(opp.amount)}
        action={
          <div className="flex items-center gap-2">
            {isOpen && <MoveStageButton oppId={opp.id} />}
            <Link href="/opportunities" className="btn-ghost">
              ← Back to opportunities
            </Link>
          </div>
        }
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={STAGE_TONE_TO_BADGE[optionTone(config, "opportunity_stage", opp.stage) || ""] || "slate"}>
          {optionLabel(config, "opportunity_stage", opp.stage)}
        </Badge>
        <Badge tone="brand">{inr(opp.amount)}</Badge>
        <Badge tone="amber">{opp.probability}% probability</Badge>
      </div>
      <div className="mt-2">
        <TagChips module="opportunities" recordId={opp.id} tags={oppTags} allTags={tenantTags} />
      </div>
    </div>
  );

  // Layout-orderable detail fields (system + custom). Owner/Created are fixed
  // metadata rows, not layout-editable, so they render outside this list,
  // pinned to the bottom regardless of saved order.
  const detailFieldNodes: { code: string; node: React.ReactNode }[] = [
    {
      code: "name",
      node: <InlineField key="name" name="name" label="Name" value={opp.name} action={updateOpportunityAction} recordId={opp.id} />,
    },
    {
      code: "amount",
      node: (
        <InlineField
          key="amount"
          name="amount"
          label="Amount"
          value={String(opp.amount)}
          action={updateOpportunityAction}
          recordId={opp.id}
        />
      ),
    },
    {
      code: "stage",
      node: (
        <InlineField
          key="stage"
          name="stage"
          label="Stage"
          value={opp.stage}
          type="select"
          options={stageOptions}
          action={updateOpportunityAction}
          recordId={opp.id}
        />
      ),
    },
    {
      code: "closeDate",
      // InlineField has no dedicated date type — rendered as text; value/edits
      // use ISO date (YYYY-MM-DD), same convention as the create form's <input type="date">.
      node: (
        <InlineField
          key="closeDate"
          name="closeDate"
          label="Close date (YYYY-MM-DD)"
          value={opp.closeDate ? opp.closeDate.toISOString().slice(0, 10) : ""}
          action={updateOpportunityAction}
          recordId={opp.id}
        />
      ),
    },
    {
      code: "accountId",
      node: (
        <InlineField
          key="accountId"
          name="accountId"
          label="Account"
          value={opp.accountId || ""}
          type="select"
          options={accountOptions}
          action={updateOpportunityAction}
          recordId={opp.id}
        />
      ),
    },
    {
      code: "followUpAt",
      node: (
        <InlineField
          key="followUpAt"
          name="followUpAt"
          label="Follow-up date"
          value={opp.followUpAt ? opp.followUpAt.toISOString().slice(0, 10) : ""}
          type="date"
          action={updateOpportunityAction}
          recordId={opp.id}
        />
      ),
    },
    {
      code: "followUpType",
      node: (
        <InlineField
          key="followUpType"
          name="followUpType"
          label="Follow-up type"
          value={opp.followUpType || ""}
          type="select"
          options={followUpTypeOptions}
          action={updateOpportunityAction}
          recordId={opp.id}
        />
      ),
    },
    ...(isLostOpp
      ? [
          {
            code: "lostReason",
            node: (
              <InlineField
                key="lostReason"
                name="lostReason"
                label="Lost reason"
                value={opp.lostReason || ""}
                type="select"
                options={lostReasonOptions}
                action={updateOpportunityAction}
                recordId={opp.id}
              />
            ),
          },
        ]
      : []),
    ...customDefs.map((d) => {
      const raw = customValues[d.code];
      let fieldType: "text" | "email" | "tel" | "select" = "text";
      let fieldOptions: InlineFieldOption[] | undefined;
      if (d.type === "picklist") {
        fieldType = "select";
        fieldOptions = d.picklistId ? optionsByPicklistId.get(d.picklistId) ?? [] : [];
      } else if (d.type === "email") {
        fieldType = "email";
      } else if (d.type === "phone") {
        fieldType = "tel";
      }
      const value =
        raw == null ? "" : Array.isArray(raw) ? raw.join(", ") : typeof raw === "boolean" ? String(raw) : String(raw);

      return {
        code: d.code,
        node: (
          <InlineField
            key={d.code}
            name={d.code}
            label={d.label}
            value={value}
            type={fieldType}
            options={fieldOptions}
            action={updateOpportunityAction}
            recordId={opp.id}
          />
        ),
      };
    }),
  ];
  const orderedDetailFieldNodes = orderFields(detailFieldNodes, layoutSpec);

  const left = (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-1">Details</div>
      <div className="divide-y divide-slate-100">
        {orderedDetailFieldNodes.map((f) => f.node)}

        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Owner</span>
          <span className="text-slate-800">{opp.owner?.name || "Unassigned"}</span>
        </div>
        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Created</span>
          <span className="text-slate-800">{shortDate(opp.createdAt)}</span>
        </div>
      </div>
    </div>
  );

  const center = (
    <>
      <TimelineComposer action={addNote} />
      <Timeline items={timelineItems} />
    </>
  );

  const right = (
    <>
      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-1">Account</div>
        {opp.account ? (
          <Link href={`/accounts/${opp.account.id}`} className="text-brand-700 hover:underline text-sm">
            {opp.account.name}
          </Link>
        ) : (
          <div className="text-sm text-slate-400">No account linked</div>
        )}
      </div>

      {opp.quotations.length > 0 && (
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-1">Quotations</div>
          <div className="text-2xl font-bold text-slate-900">{opp.quotations.length}</div>
        </div>
      )}

      {leadCreatedTat && (
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-1">Lead-Created TAT</div>
          <div className="text-2xl font-bold text-slate-900">{leadCreatedTat}</div>
          <div className="text-xs text-slate-500 mt-1">
            {isClosedOpp ? "From lead creation to close" : "From lead creation to now"}
          </div>
        </div>
      )}

      <AttachmentsPanel entity="Opportunity" entityId={opp.id} attachments={attachments} />
    </>
  );

  return <RecordShell header={header} left={left} center={center} right={right} />;
}
