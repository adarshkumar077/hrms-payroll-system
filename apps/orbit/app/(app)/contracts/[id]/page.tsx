import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, Badge } from "@/components/ui";
import { getStudioConfig, optionTone, optionLabel, options, valuesByCategory } from "@/lib/studio/config";
import { parseCustom } from "@/lib/studio/validate";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { RecordShell } from "@/components/record/RecordShell";
import { InlineField, type InlineFieldOption } from "@/components/record/InlineField";
import { Timeline, type TimelineItem } from "@/components/record/Timeline";
import { TimelineComposer } from "@/components/record/TimelineComposer";
import { AttachmentsPanel } from "@/components/record/AttachmentsPanel";
import { listAttachments } from "@/lib/storage";
import { TagChips } from "@/components/TagChips";
import { getTagsFor, getTenantTags } from "@/lib/tags";
import { updateContractAction, addContractNoteAction } from "../actions";

export const dynamic = "force-dynamic";

// components/ui.tsx's Badge only understands a fixed tone vocabulary
// (slate/blue/amber/red/green/brand); Studio config tones use a broader
// palette (rose/emerald/violet/...). Same alias used across tickets pages.
const BADGE_TONE_ALIAS: Record<string, string> = { rose: "red", emerald: "green" };
function badgeTone(tone: string | null, fallback = "slate"): string {
  if (!tone) return fallback;
  return BADGE_TONE_ALIAS[tone] ?? tone;
}

// EventLog `type` → friendly timeline title. Falls back to payload.note or
// the raw type string for anything not listed here — mirrors
// ../../tickets/[id]/page.tsx's EVENT_TITLES.
const EVENT_TITLES: Record<string, (payload: Record<string, unknown>) => string> = {
  "contract.updated": (p) => `Updated ${(p.field as string) || "field"}`,
  "contract.expiring": (p) => (p.note as string) || "Marked expiring soon",
  "contract.expired": (p) => (p.note as string) || "Marked expired",
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "contracts", "read"))) return <NoAccess label="Contracts" />;

  const [contract, config, contractTags, tenantTags] = await Promise.all([
    db.contract.findFirst({
      where: { id: params.id, tenantId: s.tenantId },
      include: { account: true },
    }),
    getStudioConfig(s.tenantId),
    getTagsFor(s.tenantId, "contracts", params.id),
    getTenantTags(s.tenantId),
  ]);
  if (!contract) notFound();

  const [customDefs, linkedTickets] = await Promise.all([
    db.fieldDef.findMany({
      where: { tenantId: s.tenantId, module: "contracts", archived: false, system: false },
      orderBy: { sortOrder: "asc" },
    }),
    // Ticket.contractId is scalar-only, polymorphic-lite (no Prisma relation —
    // see the Wave C comment on the Ticket model in prisma/schema.prisma), so
    // this is a plain filtered query, not an `include`.
    db.ticket.findMany({
      where: { tenantId: s.tenantId, contractId: contract.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
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

  const customValues = parseCustom(contract.custom);

  const [activities, events, attachments] = await Promise.all([
    db.activity.findMany({
      where: { tenantId: s.tenantId, relatedTo: `Contract:${contract.id}` },
      include: { owner: true },
      orderBy: { createdAt: "desc" },
    }),
    db.eventLog.findMany({
      // activity.created excluded: the Activity row itself renders in the
      // timeline — showing its creation event too duplicates every note.
      where: { tenantId: s.tenantId, entity: "Contract", entityId: contract.id, type: { not: "activity.created" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    listAttachments(s.tenantId, "Contract", contract.id),
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

  const addNote = addContractNoteAction.bind(null, `Contract:${contract.id}`);

  const typeOptions: InlineFieldOption[] = options(config, "contract_type").map((o) => ({ value: o.value, label: o.label }));
  const statusOptions: InlineFieldOption[] = options(config, "contract_status").map((o) => ({ value: o.value, label: o.label }));

  const activeStatusValues = valuesByCategory(config, "contract_status", "active");
  const overdue = activeStatusValues.includes(contract.status) && new Date(contract.endDate) < new Date();

  const header = (
    <div className="mb-4">
      <PageHeader
        title={contract.name}
        subtitle={`${contract.number} · ${contract.account?.name || "No account linked"}`}
        action={
          <Link href="/contracts" className="btn-ghost">
            ← Back to contracts
          </Link>
        }
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={badgeTone(optionTone(config, "contract_status", contract.status))}>
          {optionLabel(config, "contract_status", contract.status)}
        </Badge>
        <Badge tone={badgeTone(optionTone(config, "contract_type", contract.type))}>
          {optionLabel(config, "contract_type", contract.type)}
        </Badge>
        <Badge tone={overdue ? "red" : "slate"}>
          Ends {shortDate(contract.endDate)}
          {overdue ? " · Overdue" : ""}
        </Badge>
      </div>
      <div className="mt-2">
        <TagChips module="contracts" recordId={contract.id} tags={contractTags} allTags={tenantTags} />
      </div>
    </div>
  );

  const left = (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-1">Details</div>
      <div className="divide-y divide-slate-100">
        <InlineField name="name" label="Name" value={contract.name} action={updateContractAction} recordId={contract.id} />
        <InlineField
          name="type"
          label="Type"
          value={contract.type}
          type="select"
          options={typeOptions}
          action={updateContractAction}
          recordId={contract.id}
        />
        <InlineField
          name="status"
          label="Status"
          value={contract.status}
          type="select"
          options={statusOptions}
          action={updateContractAction}
          recordId={contract.id}
        />
        <InlineField
          name="startDate"
          label="Start Date"
          value={new Date(contract.startDate).toISOString().slice(0, 10)}
          type="date"
          action={updateContractAction}
          recordId={contract.id}
        />
        <InlineField
          name="endDate"
          label="End Date"
          value={new Date(contract.endDate).toISOString().slice(0, 10)}
          type="date"
          action={updateContractAction}
          recordId={contract.id}
        />
        <InlineField name="value" label="Value (₹)" value={String(contract.value)} action={updateContractAction} recordId={contract.id} />
        <InlineField
          name="visitQuota"
          label="Visit Quota"
          value={String(contract.visitQuota)}
          action={updateContractAction}
          recordId={contract.id}
        />
        <InlineField
          name="renewalNoticeDays"
          label="Renewal Notice (days)"
          value={String(contract.renewalNoticeDays)}
          action={updateContractAction}
          recordId={contract.id}
        />
        <InlineField name="notes" label="Notes" value={contract.notes || ""} action={updateContractAction} recordId={contract.id} />

        {customDefs.map((d) => {
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

          return (
            <InlineField
              key={d.code}
              name={d.code}
              label={d.label}
              value={value}
              type={fieldType}
              options={fieldOptions}
              action={updateContractAction}
              recordId={contract.id}
            />
          );
        })}

        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Number</span>
          <span className="text-slate-800">{contract.number}</span>
        </div>
        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Created</span>
          <span className="text-slate-800">{shortDate(contract.createdAt)}</span>
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
        <div className="font-semibold text-slate-800 mb-3">Account</div>
        {contract.account ? (
          <div className="text-sm">
            <Link href={`/accounts/${contract.account.id}`} className="text-brand-700 hover:underline font-medium">
              {contract.account.name}
            </Link>
            {contract.account.industry && <div className="text-slate-500 text-xs mt-1">{contract.account.industry}</div>}
          </div>
        ) : (
          <div className="text-sm text-slate-400">No account linked.</div>
        )}
      </div>

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-1">Value</div>
        <div className="text-2xl font-bold text-slate-900">{inr(contract.value)}</div>
        <div className="text-xs text-slate-500 mt-1">Visit quota: {contract.visitQuota}</div>
      </div>

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-3">Linked Tickets</div>
        {linkedTickets.length === 0 ? (
          <div className="text-sm text-slate-400">No tickets linked to this contract.</div>
        ) : (
          <ul className="space-y-2">
            {linkedTickets.map((tk) => (
              <li key={tk.id} className="text-sm flex items-center justify-between gap-2">
                <Link href={`/tickets/${tk.id}`} className="text-brand-700 hover:underline truncate">
                  {tk.subject}
                </Link>
                <Badge tone="slate">{tk.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AttachmentsPanel entity="Contract" entityId={contract.id} attachments={attachments} />
    </>
  );

  return <RecordShell header={header} left={left} center={center} right={right} />;
}
