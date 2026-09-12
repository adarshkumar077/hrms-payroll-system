import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { PageHeader, Badge } from "@/components/ui";
import { getStudioConfig, optionTone, options, valuesByCategory } from "@/lib/studio/config";
import { getRecordLayout, orderFields } from "@/lib/studio/layouts";
import { parseCustom } from "@/lib/studio/validate";
import { TagChips } from "@/components/TagChips";
import { getTagsFor, getTenantTags } from "@/lib/tags";
import { RecordShell } from "@/components/record/RecordShell";
import { InlineField, type InlineFieldOption } from "@/components/record/InlineField";
import { Timeline, type TimelineItem } from "@/components/record/Timeline";
import { TimelineComposer } from "@/components/record/TimelineComposer";
import { AttachmentsPanel } from "@/components/record/AttachmentsPanel";
import { listAttachments } from "@/lib/storage";
import { CallButton } from "@/components/CallButton";
import { telephonyConfigured } from "@/lib/telephony";
import { DraftPanel } from "./DraftPanel";
import { ConvertButton } from "../LeadRowActions";
import { updateLeadAction, addNoteAction } from "../actions";

export const dynamic = "force-dynamic";

// Studio "lead_status" tone key → components/ui.tsx Badge tone prop. Tuned so
// the DEFAULT config renders identically to the old hardcoded statusTone map
// (New=slate, Contacted=blue, Qualified=amber, Converted=green, Dead=red) —
// see app/(app)/leads/page.tsx for the matching lead_status/lead_source maps.
const STATUS_TONE_TO_BADGE: Record<string, string> = {
  blue: "slate", // New
  amber: "blue", // Contacted
  violet: "amber", // Qualified
  emerald: "green", // Converted
  slate: "red", // Dead
};

// EventLog `type` → friendly timeline title. Falls back to payload.note (the
// human-readable note every emit() call in leads/actions.ts already sets) or
// the raw type string for anything not listed here.
const EVENT_TITLES: Record<string, (payload: Record<string, unknown>) => string> = {
  "lead.created": (p) => (p.note as string) || "Lead created",
  "lead.scored": (p) => (p.note as string) || "AI scored",
  "lead.status.changed": (p) => (p.note as string) || "Status changed",
  "lead.updated": (p) => `Updated ${(p.field as string) || "field"}`,
  "lead.converted": (p) => (p.note as string) || "Converted",
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  const [lead, config, layoutSpec, leadTags, tenantTags] = await Promise.all([
    db.lead.findFirst({
      where: { id: params.id, tenantId: s.tenantId },
      include: { owner: true },
    }),
    getStudioConfig(s.tenantId),
    getRecordLayout(s.tenantId, "leads"),
    getTagsFor(s.tenantId, "leads", params.id),
    getTenantTags(s.tenantId),
  ]);
  if (!lead) notFound();

  const customDefs = await db.fieldDef.findMany({
    where: { tenantId: s.tenantId, module: "leads", archived: false, system: false },
    orderBy: { sortOrder: "asc" },
  });
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

  const customValues = parseCustom(lead.custom);

  const [activities, events, attachments] = await Promise.all([
    db.activity.findMany({
      where: { tenantId: s.tenantId, relatedTo: `Lead:${lead.id}` },
      include: { owner: true },
      orderBy: { createdAt: "desc" },
    }),
    db.eventLog.findMany({
      // activity.created excluded: the Activity row itself renders in the
      // timeline — showing its creation event too duplicates every note.
      where: { tenantId: s.tenantId, entity: "Lead", entityId: lead.id, type: { not: "activity.created" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    listAttachments(s.tenantId, "Lead", lead.id),
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

  const addNote = addNoteAction.bind(null, `Lead:${lead.id}`);

  const converted = !!lead.convertedAt;
  const sourceOptions: InlineFieldOption[] = options(config, "lead_source").map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const statusOptions: InlineFieldOption[] = options(config, "lead_status").map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const followUpTypeOptions: InlineFieldOption[] = [
    { value: "", label: "— None —" },
    ...options(config, "follow_up_type").map((o) => ({ value: o.value, label: o.label })),
  ];
  const lostReasonOptions: InlineFieldOption[] = [
    { value: "", label: "— None —" },
    ...options(config, "lost_reason").map((o) => ({ value: o.value, label: o.label })),
  ];
  // Lost Reason is only shown once the lead is in the "dead" status category —
  // the exact category name used by defaults.ts's lead_status picklist (New/
  // Contacted/Qualified are "open", Converted is "converted", Dead is "dead").
  const deadStatuses = valuesByCategory(config, "lead_status", "dead");
  const isDeadLead = deadStatuses.includes(lead.status);

  const header = (
    <div className="mb-4">
      <PageHeader
        title={lead.name}
        subtitle={lead.company || "Individual lead"}
        action={
          <div className="flex items-center gap-2">
            <ConvertButton leadId={lead.id} converted={converted} size="md" />
            <Link href="/leads" className="btn-ghost">
              ← Back to leads
            </Link>
          </div>
        }
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={STATUS_TONE_TO_BADGE[optionTone(config, "lead_status", lead.status) || ""] || "slate"}>
          {lead.status}
        </Badge>
        <Badge tone="amber">{lead.source}</Badge>
        <Badge tone="green">AI Score {lead.score == null ? "—" : lead.score}</Badge>
      </div>
      <div className="mt-2">
        <TagChips module="leads" recordId={lead.id} tags={leadTags} allTags={tenantTags} />
      </div>
    </div>
  );

  // Layout-orderable detail fields (system + custom). Owner/Created are fixed
  // metadata rows, not layout-editable, so they render outside this list,
  // pinned to the bottom regardless of saved order.
  const detailFieldNodes: { code: string; node: React.ReactNode }[] = [
    {
      code: "name",
      node: (
        <InlineField key="name" name="name" label="Name" value={lead.name} action={updateLeadAction} recordId={lead.id} readOnly={converted} />
      ),
    },
    {
      code: "company",
      node: (
        <InlineField
          key="company"
          name="company"
          label="Company"
          value={lead.company || ""}
          action={updateLeadAction}
          recordId={lead.id}
          readOnly={converted}
        />
      ),
    },
    {
      code: "email",
      node: (
        <InlineField
          key="email"
          name="email"
          label="Email"
          value={lead.email || ""}
          type="email"
          action={updateLeadAction}
          recordId={lead.id}
          readOnly={converted}
        />
      ),
    },
    {
      code: "phone",
      node: (
        <div key="phone" className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <InlineField
              name="phone"
              label="Phone"
              value={lead.phone || ""}
              type="tel"
              action={updateLeadAction}
              recordId={lead.id}
              readOnly={converted}
            />
          </div>
          <CallButton phone={lead.phone} live={telephonyConfigured} />
        </div>
      ),
    },
    {
      code: "source",
      node: (
        <InlineField
          key="source"
          name="source"
          label="Source"
          value={lead.source}
          type="select"
          options={sourceOptions}
          action={updateLeadAction}
          recordId={lead.id}
          readOnly={converted}
        />
      ),
    },
    {
      code: "status",
      node: (
        <InlineField
          key="status"
          name="status"
          label="Status"
          value={lead.status}
          type="select"
          options={statusOptions}
          action={updateLeadAction}
          recordId={lead.id}
          readOnly={converted}
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
          value={lead.followUpAt ? lead.followUpAt.toISOString().slice(0, 10) : ""}
          type="date"
          action={updateLeadAction}
          recordId={lead.id}
          readOnly={converted}
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
          value={lead.followUpType || ""}
          type="select"
          options={followUpTypeOptions}
          action={updateLeadAction}
          recordId={lead.id}
          readOnly={converted}
        />
      ),
    },
    ...(isDeadLead
      ? [
          {
            code: "lostReason",
            node: (
              <InlineField
                key="lostReason"
                name="lostReason"
                label="Lost reason"
                value={lead.lostReason || ""}
                type="select"
                options={lostReasonOptions}
                action={updateLeadAction}
                recordId={lead.id}
                readOnly={converted}
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
            action={updateLeadAction}
            recordId={lead.id}
            readOnly={converted}
          />
        ),
      };
    }),
  ];
  const orderedDetailFieldNodes = orderFields(detailFieldNodes, layoutSpec);

  const left = (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-1">Details</div>
      {converted && <div className="text-xs text-slate-400 mb-2">Converted leads are locked.</div>}
      <div className="divide-y divide-slate-100">
        {orderedDetailFieldNodes.map((f) => f.node)}

        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Owner</span>
          <span className="text-slate-800">{lead.owner?.name || "Unassigned"}</span>
        </div>
        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Created</span>
          <span className="text-slate-800">{shortDate(lead.createdAt)}</span>
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
      {converted && (
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3">Converted → Account · Contact · Deal</div>
          <div className="flex flex-col gap-2 text-sm">
            {lead.convertedAccountId && (
              <Link href="/accounts" className="text-brand-700 hover:underline">
                Account <span className="text-slate-400 text-xs">({lead.convertedAccountId})</span>
              </Link>
            )}
            {lead.convertedContactId && (
              <span className="text-slate-600">
                Contact <span className="text-slate-400 text-xs">({lead.convertedContactId})</span>
              </span>
            )}
            {lead.convertedOpportunityId && (
              <Link href="/opportunities" className="text-brand-700 hover:underline">
                Deal <span className="text-slate-400 text-xs">({lead.convertedOpportunityId})</span>
              </Link>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-2">Converted {shortDate(lead.convertedAt)}</div>
        </div>
      )}

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-1">AI Score</div>
        <div className="text-2xl font-bold text-slate-900">{lead.score == null ? "—" : lead.score}</div>
        <div className="text-xs text-slate-500 mt-1">{lead.scoreReason || "Not scored yet"}</div>
      </div>

      <AttachmentsPanel entity="Lead" entityId={lead.id} attachments={attachments} />

      <DraftPanel leadId={lead.id} />
    </>
  );

  return <RecordShell header={header} left={left} center={center} right={right} />;
}
