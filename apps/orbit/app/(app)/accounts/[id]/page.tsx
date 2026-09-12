import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, Badge, MoneyStat } from "@/components/ui";
import { parseCustom } from "@/lib/studio/validate";
import { getStudioConfig, valuesByCategory, optionTone } from "@/lib/studio/config";
import { getRecordLayout, orderFields } from "@/lib/studio/layouts";
import { RecordShell } from "@/components/record/RecordShell";
import { InlineField, type InlineFieldOption } from "@/components/record/InlineField";
import { Timeline, type TimelineItem } from "@/components/record/Timeline";
import { TimelineComposer } from "@/components/record/TimelineComposer";
import { AttachmentsPanel } from "@/components/record/AttachmentsPanel";
import { listAttachments } from "@/lib/storage";
import { CallButton } from "@/components/CallButton";
import { telephonyConfigured } from "@/lib/telephony";
import { TagChips } from "@/components/TagChips";
import { getTagsFor, getTenantTags } from "@/lib/tags";
import { updateAccountAction, addAccountNoteAction } from "../actions";

export const dynamic = "force-dynamic";

// EventLog `type` → friendly timeline title. Falls back to payload.note (the
// human-readable note every emit() call in accounts/actions.ts already sets)
// or the raw type string for anything not listed here.
const EVENT_TITLES: Record<string, (payload: Record<string, unknown>) => string> = {
  "account.created": (p) => (p.note as string) || "Account created",
  "account.updated": (p) => `Updated ${(p.field as string) || "field"}`,
};

const stageTone: Record<string, string> = {
  Qualification: "slate",
  Proposal: "blue",
  Negotiation: "amber",
  ClosedWon: "green",
  ClosedLost: "red",
};

const priorityTone: Record<string, string> = {
  Low: "slate",
  Medium: "blue",
  High: "amber",
  Urgent: "red",
};

// Ticket statuses that count as "open" for the 360 panel come from the option
// CATEGORY (valuesByCategory) — never literals; tenant renames must not break this.

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "accounts", "read"))) return <NoAccess label="Accounts" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);
  const openTicketStatuses = valuesByCategory(config, "ticket_status", "open");

  const [account, customDefs, layoutSpec, accountTags, tenantTags] = await Promise.all([
    db.account.findFirst({ where: { id: params.id, tenantId: t } }),
    db.fieldDef.findMany({
      where: { tenantId: t, module: "accounts", archived: false, system: false },
      orderBy: { sortOrder: "asc" },
    }),
    getRecordLayout(t, "accounts"),
    getTagsFor(t, "accounts", params.id),
    getTenantTags(t),
  ]);
  if (!account) notFound();

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

  const customValues = parseCustom(account.custom);

  // ── 360 panels + timeline — one batch, all tenant-scoped, all take-limited ──
  const [
    contacts,
    contactCount,
    opportunities,
    opportunityCount,
    tickets,
    openTicketCount,
    invoices,
    invoiceCount,
    invoicesForReceivables,
    quotations,
    quotationCount,
    installedProducts,
    installedProductCount,
    activities,
    events,
    attachments,
  ] = await Promise.all([
    db.contact.findMany({
      where: { tenantId: t, accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, name: true, title: true },
    }),
    db.contact.count({ where: { tenantId: t, accountId: account.id } }),
    db.opportunity.findMany({
      where: { tenantId: t, accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, name: true, stage: true, amount: true },
    }),
    db.opportunity.count({ where: { tenantId: t, accountId: account.id } }),
    db.ticket.findMany({
      where: { tenantId: t, accountId: account.id, status: { in: openTicketStatuses } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, subject: true, priority: true },
    }),
    db.ticket.count({ where: { tenantId: t, accountId: account.id, status: { in: openTicketStatuses } } }),
    db.invoice.findMany({
      where: { tenantId: t, accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, number: true, status: true, grandTotal: true },
    }),
    db.invoice.count({ where: { tenantId: t, accountId: account.id } }),
    db.invoice.findMany({
      where: { tenantId: t, accountId: account.id, status: { not: "Paid" } },
      select: { grandTotal: true },
    }),
    db.quotation.findMany({
      where: { tenantId: t, accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, number: true, status: true, grandTotal: true },
    }),
    db.quotation.count({ where: { tenantId: t, accountId: account.id } }),
    db.installedProduct.findMany({
      where: { tenantId: t, accountId: account.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, serialNo: true, warrantyUntil: true },
    }),
    db.installedProduct.count({ where: { tenantId: t, accountId: account.id } }),
    db.activity.findMany({
      where: { tenantId: t, relatedTo: `Account:${account.id}` },
      include: { owner: true },
      orderBy: { createdAt: "desc" },
    }),
    db.eventLog.findMany({
      // activity.created excluded: the Activity row itself renders in the
      // timeline — showing its creation event too duplicates every note.
      where: { tenantId: t, entity: "Account", entityId: account.id, type: { not: "activity.created" } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    listAttachments(t, "Account", account.id),
  ]);

  const receivables = invoicesForReceivables.reduce((sum, inv) => sum + inv.grandTotal, 0);

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

  const addNote = addAccountNoteAction.bind(null, `Account:${account.id}`);

  const header = (
    <div className="mb-4">
      <PageHeader
        title={account.name}
        subtitle={[account.city, account.state].filter(Boolean).join(", ") || undefined}
        action={
          <Link href="/accounts" className="btn-ghost">
            ← Back to accounts
          </Link>
        }
      />
      <div className="flex items-center gap-2 flex-wrap">
        {account.industry && <Badge tone="brand">{account.industry}</Badge>}
        {(account.city || account.state) && (
          <Badge tone="slate">{[account.city, account.state].filter(Boolean).join(", ")}</Badge>
        )}
        {account.gstin && <span className="font-mono text-xs text-slate-500">{account.gstin}</span>}
      </div>
      <div className="mt-2">
        <TagChips module="accounts" recordId={account.id} tags={accountTags} allTags={tenantTags} />
      </div>
    </div>
  );

  // Layout-orderable detail fields (system + custom). Accounts' left rail has
  // no pinned metadata rows (no Owner/Created here), so the whole panel is
  // just the ordered list.
  const detailFieldNodes: { code: string; node: React.ReactNode }[] = [
    {
      code: "name",
      node: <InlineField key="name" name="name" label="Name" value={account.name} action={updateAccountAction} recordId={account.id} />,
    },
    {
      code: "industry",
      node: (
        <InlineField
          key="industry"
          name="industry"
          label="Industry"
          value={account.industry || ""}
          action={updateAccountAction}
          recordId={account.id}
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
              value={account.phone || ""}
              type="tel"
              action={updateAccountAction}
              recordId={account.id}
            />
          </div>
          <CallButton phone={account.phone} live={telephonyConfigured} />
        </div>
      ),
    },
    {
      code: "email",
      node: (
        <InlineField
          key="email"
          name="email"
          label="Email"
          value={account.email || ""}
          type="email"
          action={updateAccountAction}
          recordId={account.id}
        />
      ),
    },
    {
      code: "gstin",
      node: (
        <InlineField
          key="gstin"
          name="gstin"
          label="GSTIN"
          value={account.gstin || ""}
          action={updateAccountAction}
          recordId={account.id}
        />
      ),
    },
    {
      code: "address",
      node: (
        <InlineField
          key="address"
          name="address"
          label="Address"
          value={account.address || ""}
          action={updateAccountAction}
          recordId={account.id}
        />
      ),
    },
    {
      code: "city",
      node: (
        <InlineField key="city" name="city" label="City" value={account.city || ""} action={updateAccountAction} recordId={account.id} />
      ),
    },
    {
      code: "state",
      node: (
        <InlineField
          key="state"
          name="state"
          label="State"
          value={account.state || ""}
          action={updateAccountAction}
          recordId={account.id}
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
            action={updateAccountAction}
            recordId={account.id}
          />
        ),
      };
    }),
  ];
  const orderedDetailFieldNodes = orderFields(detailFieldNodes, layoutSpec);

  const left = (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-1">Details</div>
      <div className="divide-y divide-slate-100">{orderedDetailFieldNodes.map((f) => f.node)}</div>
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
      <MoneyStat label="Receivables" amount={receivables} accent="amber" hint="Unpaid invoices for this account" />

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800">Contacts</div>
          <span className="text-xs text-slate-400">{contactCount}</span>
        </div>
        {contacts.length === 0 ? (
          <div className="text-sm text-slate-400">No contacts yet.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span className="text-slate-800 truncate">{c.name}</span>
                <span className="text-xs text-slate-400 truncate">{c.title || "—"}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/contacts" className="text-xs text-brand-700 hover:underline mt-2 inline-block">
          View all contacts →
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800">Opportunities</div>
          <span className="text-xs text-slate-400">{opportunityCount}</span>
        </div>
        {opportunities.length === 0 ? (
          <div className="text-sm text-slate-400">No opportunities yet.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {opportunities.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <Link href={`/opportunities/${o.id}`} className="text-brand-700 hover:underline truncate">
                  {o.name}
                </Link>
                <span className="flex items-center gap-1 shrink-0">
                  <Badge tone={stageTone[o.stage] || "slate"}>{o.stage}</Badge>
                  <span className="text-xs text-slate-500">{inr(o.amount)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/opportunities" className="text-xs text-brand-700 hover:underline mt-2 inline-block">
          View all opportunities →
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800">Open Tickets</div>
          <span className="text-xs text-slate-400">{openTicketCount}</span>
        </div>
        {tickets.length === 0 ? (
          <div className="text-sm text-slate-400">No open tickets.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {tickets.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between gap-2">
                <span className="text-slate-800 truncate">{tk.subject}</span>
                <Badge tone={priorityTone[tk.priority] || "slate"}>{tk.priority}</Badge>
              </li>
            ))}
          </ul>
        )}
        <Link href="/tickets" className="text-xs text-brand-700 hover:underline mt-2 inline-block">
          View all tickets →
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800">Invoices</div>
          <span className="text-xs text-slate-400">{invoiceCount}</span>
        </div>
        {invoices.length === 0 ? (
          <div className="text-sm text-slate-400">No invoices yet.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2">
                <span className="text-slate-800 truncate">{inv.number}</span>
                <span className="flex items-center gap-1 shrink-0">
                  <Badge tone={inv.status === "Paid" ? "green" : inv.status === "Finalized" ? "blue" : "slate"}>
                    {inv.status}
                  </Badge>
                  <span className="text-xs text-slate-500">{inr(inv.grandTotal)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/finance/invoices" className="text-xs text-brand-700 hover:underline mt-2 inline-block">
          View all invoices →
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800">Quotations</div>
          <span className="text-xs text-slate-400">{quotationCount}</span>
        </div>
        {quotations.length === 0 ? (
          <div className="text-sm text-slate-400">No quotations yet.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {quotations.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-2">
                <Link href={`/quotations/${q.id}`} className="text-brand-700 hover:underline truncate">
                  {q.number}
                </Link>
                <span className="flex items-center gap-1 shrink-0">
                  <Badge tone={optionTone(config, "quotation_stage", q.status) || "slate"}>{q.status}</Badge>
                  <span className="text-xs text-slate-500">{inr(q.grandTotal)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/quotations" className="text-xs text-brand-700 hover:underline mt-2 inline-block">
          View all quotations →
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800">Installed Base</div>
          <span className="text-xs text-slate-400">{installedProductCount}</span>
        </div>
        {installedProducts.length === 0 ? (
          <div className="text-sm text-slate-400">No installed products yet.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {installedProducts.map((ip) => {
              const expired = !!ip.warrantyUntil && new Date(ip.warrantyUntil) < new Date();
              return (
                <li key={ip.id} className="flex items-center justify-between gap-2">
                  <Link href={`/installed/${ip.id}`} className="text-brand-700 hover:underline truncate">
                    {ip.name}
                    {ip.serialNo ? ` (${ip.serialNo})` : ""}
                  </Link>
                  <span className="flex items-center gap-1 shrink-0">
                    {ip.warrantyUntil && (
                      <Badge tone={expired ? "red" : "slate"}>{shortDate(ip.warrantyUntil)}</Badge>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/installed" className="text-xs text-brand-700 hover:underline mt-2 inline-block">
          View all installed products →
        </Link>
      </div>

      <AttachmentsPanel entity="Account" entityId={account.id} attachments={attachments} />
    </>
  );

  return <RecordShell header={header} left={left} center={center} right={right} />;
}
