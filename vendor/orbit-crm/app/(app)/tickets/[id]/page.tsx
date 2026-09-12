import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { PageHeader, Badge } from "@/components/ui";
import { getStudioConfig, optionTone, optionLabel, options, valuesByCategory } from "@/lib/studio/config";
import { getRecordLayout, orderFields } from "@/lib/studio/layouts";
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
import { updateTicketAction, addTicketNoteAction } from "../actions";
import { TicketFeedbackForm } from "../TicketFeedbackForm";

export const dynamic = "force-dynamic";

// components/ui.tsx's Badge only understands a fixed tone vocabulary
// (slate/blue/amber/red/green/brand); Studio config tones use a broader
// palette (rose/emerald/violet/...). Same alias tickets/page.tsx uses so
// config-driven priority tones render the same classes here.
const BADGE_TONE_ALIAS: Record<string, string> = { rose: "red", emerald: "green" };
function badgeTone(tone: string | null, fallback = "slate"): string {
  if (!tone) return fallback;
  return BADGE_TONE_ALIAS[tone] ?? tone;
}

// Status badge tone is NOT derived from the config's `tone` field, mirroring
// tickets/page.tsx's statusTone map — see that file's comment for why
// (default ticket_status config tones don't reproduce today's rendered
// colors, so deriving via optionTone would violate zero-visual-change).
const STATUS_TONE: Record<string, string> = {
  Open: "amber",
  InProgress: "blue",
  Resolved: "green",
  Closed: "slate",
};

// EventLog `type` → friendly timeline title. Falls back to payload.note (the
// human-readable note every emit() call in tickets/actions.ts already sets)
// or the raw type string for anything not listed here.
const EVENT_TITLES: Record<string, (payload: Record<string, unknown>) => string> = {
  "ticket.status.changed": (p) => (p.note as string) || "Status changed",
  "ticket.updated": (p) => `Updated ${(p.field as string) || "field"}`,
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "tickets", "read"))) return <NoAccess label="Tickets" />;

  const [ticket, config, layoutSpec, ticketTags, tenantTags] = await Promise.all([
    db.ticket.findFirst({
      where: { id: params.id, tenantId: s.tenantId },
      include: { account: true, owner: true },
    }),
    getStudioConfig(s.tenantId),
    getRecordLayout(s.tenantId, "tickets"),
    getTagsFor(s.tenantId, "tickets", params.id),
    getTenantTags(s.tenantId),
  ]);
  if (!ticket) notFound();

  const [customDefs, accounts, contracts, installedProducts, linkedContract, linkedInstalledProduct] = await Promise.all([
    db.fieldDef.findMany({
      where: { tenantId: s.tenantId, module: "tickets", archived: false, system: false },
      orderBy: { sortOrder: "asc" },
    }),
    db.account.findMany({ where: { tenantId: s.tenantId }, orderBy: { name: "asc" } }),
    db.contract.findMany({ where: { tenantId: s.tenantId }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true } }),
    db.installedProduct.findMany({
      where: { tenantId: s.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, serialNo: true },
    }),
    ticket.contractId ? db.contract.findFirst({ where: { id: ticket.contractId, tenantId: s.tenantId } }) : null,
    ticket.installedProductId
      ? db.installedProduct.findFirst({ where: { id: ticket.installedProductId, tenantId: s.tenantId } })
      : null,
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

  const customValues = parseCustom(ticket.custom);

  const [activities, events, attachments] = await Promise.all([
    db.activity.findMany({
      where: { tenantId: s.tenantId, relatedTo: `Ticket:${ticket.id}` },
      include: { owner: true },
      orderBy: { createdAt: "desc" },
    }),
    db.eventLog.findMany({
      // activity.created excluded: the Activity row itself renders in the
      // timeline — showing its creation event too duplicates every note.
      where: { tenantId: s.tenantId, entity: "Ticket", entityId: ticket.id, type: { not: "activity.created" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    listAttachments(s.tenantId, "Ticket", ticket.id),
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

  const addNote = addTicketNoteAction.bind(null, `Ticket:${ticket.id}`);

  const statusOptions: InlineFieldOption[] = options(config, "ticket_status").map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const priorityOptions: InlineFieldOption[] = options(config, "ticket_priority").map((o) => ({
    value: o.value,
    label: o.label,
  }));
  const accountOptions: InlineFieldOption[] = [
    { value: "", label: "— None —" },
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
  ];
  const typeOptions: InlineFieldOption[] = options(config, "ticket_type").map((o) => ({ value: o.value, label: o.label }));
  const contractOptions: InlineFieldOption[] = [
    { value: "", label: "— None —" },
    ...contracts.map((c) => ({ value: c.id, label: `${c.number} — ${c.name}` })),
  ];
  const installedProductOptions: InlineFieldOption[] = [
    { value: "", label: "— None —" },
    ...installedProducts.map((ip) => ({ value: ip.id, label: ip.serialNo ? `${ip.name} (${ip.serialNo})` : ip.name })),
  ];

  const openStatusValues = valuesByCategory(config, "ticket_status", "open");
  const breached = openStatusValues.includes(ticket.status) && !!ticket.slaDueAt && new Date(ticket.slaDueAt) < new Date();

  // Feedback is only collectable once a ticket has reached a "closed"
  // category status — see lib/studio/defaults.ts's ticket_status picklist
  // (Resolved/Closed both carry category "closed").
  const closedStatusValues = valuesByCategory(config, "ticket_status", "closed");
  const isClosedLike = closedStatusValues.includes(ticket.status);

  const contractExpired = !!linkedContract && new Date(linkedContract.endDate) < new Date();

  const header = (
    <div className="mb-4">
      <PageHeader
        title={ticket.subject}
        subtitle={ticket.account?.name || "No account linked"}
        action={
          <Link href="/tickets" className="btn-ghost">
            ← Back to tickets
          </Link>
        }
      />
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={STATUS_TONE[ticket.status] || "slate"}>{ticket.status}</Badge>
        <Badge tone={badgeTone(optionTone(config, "ticket_priority", ticket.priority))}>{ticket.priority}</Badge>
        {ticket.typeKey && (
          <Badge tone={badgeTone(optionTone(config, "ticket_type", ticket.typeKey))}>
            {optionLabel(config, "ticket_type", ticket.typeKey)}
          </Badge>
        )}
        <Badge tone={breached ? "red" : "slate"}>
          SLA {ticket.slaDueAt ? shortDate(ticket.slaDueAt) : "—"}
          {breached ? " · Breached" : ""}
        </Badge>
      </div>
      <div className="mt-2">
        <TagChips module="tickets" recordId={ticket.id} tags={ticketTags} allTags={tenantTags} />
      </div>
    </div>
  );

  // Layout-orderable detail fields (system + custom). Owner/Created are fixed
  // metadata rows, not layout-editable, so they render outside this list,
  // pinned to the bottom regardless of saved order.
  const detailFieldNodes: { code: string; node: React.ReactNode }[] = [
    {
      code: "subject",
      node: (
        <InlineField
          key="subject"
          name="subject"
          label="Subject"
          value={ticket.subject}
          action={updateTicketAction}
          recordId={ticket.id}
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
          value={ticket.status}
          type="select"
          options={statusOptions}
          action={updateTicketAction}
          recordId={ticket.id}
        />
      ),
    },
    {
      code: "priority",
      node: (
        <InlineField
          key="priority"
          name="priority"
          label="Priority"
          value={ticket.priority}
          type="select"
          options={priorityOptions}
          action={updateTicketAction}
          recordId={ticket.id}
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
          value={ticket.accountId || ""}
          type="select"
          options={accountOptions}
          action={updateTicketAction}
          recordId={ticket.id}
        />
      ),
    },
    {
      code: "slaDueAt",
      node: (
        <InlineField
          key="slaDueAt"
          name="slaDueAt"
          label="SLA Due (ISO)"
          value={ticket.slaDueAt ? new Date(ticket.slaDueAt).toISOString() : ""}
          action={updateTicketAction}
          recordId={ticket.id}
        />
      ),
    },
    {
      code: "typeKey",
      node: (
        <InlineField
          key="typeKey"
          name="typeKey"
          label="Type"
          value={ticket.typeKey || ""}
          type="select"
          options={typeOptions}
          action={updateTicketAction}
          recordId={ticket.id}
        />
      ),
    },
    {
      code: "contractId",
      node: (
        <InlineField
          key="contractId"
          name="contractId"
          label="Contract"
          value={ticket.contractId || ""}
          type="select"
          options={contractOptions}
          action={updateTicketAction}
          recordId={ticket.id}
        />
      ),
    },
    {
      code: "installedProductId",
      node: (
        <InlineField
          key="installedProductId"
          name="installedProductId"
          label="Installed Product"
          value={ticket.installedProductId || ""}
          type="select"
          options={installedProductOptions}
          action={updateTicketAction}
          recordId={ticket.id}
        />
      ),
    },
    {
      code: "charges",
      node: (
        <InlineField
          key="charges"
          name="charges"
          label="Charges (₹)"
          value={String(ticket.charges)}
          action={updateTicketAction}
          recordId={ticket.id}
        />
      ),
    },
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
            action={updateTicketAction}
            recordId={ticket.id}
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
          <span className="text-slate-800">{ticket.owner?.name || "Unassigned"}</span>
        </div>
        <div className="py-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Created</span>
          <span className="text-slate-800">{shortDate(ticket.createdAt)}</span>
        </div>
      </div>
    </div>
  );

  const center = (
    <>
      {isClosedLike && (
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3">Feedback</div>
          <TicketFeedbackForm ticketId={ticket.id} feedback={ticket.feedback} rating={ticket.feedbackRating} />
        </div>
      )}
      <TimelineComposer action={addNote} />
      <Timeline items={timelineItems} />
    </>
  );

  const right = (
    <>
      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-3">Account</div>
        {ticket.account ? (
          <div className="text-sm">
            <Link href={`/accounts/${ticket.account.id}`} className="text-brand-700 hover:underline font-medium">
              {ticket.account.name}
            </Link>
            {ticket.account.industry && <div className="text-slate-500 text-xs mt-1">{ticket.account.industry}</div>}
          </div>
        ) : (
          <div className="text-sm text-slate-400">No account linked.</div>
        )}
      </div>

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-3">Contract</div>
        {linkedContract ? (
          <div className="text-sm">
            <Link href={`/contracts/${linkedContract.id}`} className="text-brand-700 hover:underline font-medium">
              {linkedContract.number} — {linkedContract.name}
            </Link>
            <div className="text-slate-500 text-xs mt-1">Ends {shortDate(linkedContract.endDate)}</div>
            {contractExpired && (
              <div className="mt-2">
                <Badge tone="red">Contract expired</Badge>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-400">No contract linked.</div>
        )}
      </div>

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-3">Installed Product</div>
        {linkedInstalledProduct ? (
          <div className="text-sm">
            <Link href={`/installed/${linkedInstalledProduct.id}`} className="text-brand-700 hover:underline font-medium">
              {linkedInstalledProduct.name}
            </Link>
            {linkedInstalledProduct.serialNo && (
              <div className="text-slate-500 text-xs mt-1">SN {linkedInstalledProduct.serialNo}</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-400">No installed product linked.</div>
        )}
      </div>

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-1">SLA</div>
        <div className="text-2xl font-bold text-slate-900">{ticket.slaDueAt ? shortDate(ticket.slaDueAt) : "—"}</div>
        <div className="mt-2">{breached && <Badge tone="red">Breached</Badge>}</div>
      </div>

      <AttachmentsPanel entity="Ticket" entityId={ticket.id} attachments={attachments} />
    </>
  );

  return <RecordShell header={header} left={left} center={center} right={right} />;
}
