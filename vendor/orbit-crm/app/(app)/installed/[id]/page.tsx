import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { shortDate } from "@/lib/format";
import { PageHeader, Badge } from "@/components/ui";
import { parseCustom } from "@/lib/studio/validate";
import { getRecordLayout, orderFields } from "@/lib/studio/layouts";
import { RecordShell } from "@/components/record/RecordShell";
import { InlineField, type InlineFieldOption } from "@/components/record/InlineField";
import { Timeline, type TimelineItem } from "@/components/record/Timeline";
import { updateInstalledProductAction } from "../actions";
import { getStudioConfig, optionTone } from "@/lib/studio/config";

export const dynamic = "force-dynamic";

// Same alias map as tickets/contracts pages — Badge's classes use red/green
// where the picklist config uses rose/emerald.
const BADGE_TONE_ALIAS: Record<string, string> = { rose: "red", emerald: "green" };
function badgeTone(tone: string | null, fallback = "slate"): string {
  if (!tone) return fallback;
  return BADGE_TONE_ALIAS[tone] ?? tone;
}

// EventLog `type` → friendly timeline title. Falls back to payload.note or the
// raw type string, same convention as every other Universal Record Page.
const EVENT_TITLES: Record<string, (payload: Record<string, unknown>) => string> = {
  "installed.created": (p) => (p.note as string) || "Installed product created",
  "installed.updated": (p) => `Updated ${(p.field as string) || "field"}`,
};

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default async function InstalledProductDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "installed", "read"))) return <NoAccess label="Installed Base" />;
  const t = s.tenantId;

  const installedProduct = await db.installedProduct.findFirst({
    where: { id: params.id, tenantId: t },
    include: { account: true, product: true },
  });
  if (!installedProduct) notFound();

  const [customDefs, layoutSpec, config] = await Promise.all([
    db.fieldDef.findMany({
      where: { tenantId: t, module: "installed", archived: false, system: false },
      orderBy: { sortOrder: "asc" },
    }),
    getRecordLayout(t, "installed"),
    getStudioConfig(t),
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

  const customValues = parseCustom(installedProduct.custom);

  // contractId is scalar-only / polymorphic-lite (same pattern as
  // Ticket.contractId) — no Prisma relation, so fetch it tenant-scoped here.
  const [contract, tickets, ticketCount, events] = await Promise.all([
    installedProduct.contractId
      ? db.contract.findFirst({
          where: { id: installedProduct.contractId, tenantId: t },
          select: { id: true, number: true, name: true },
        })
      : Promise.resolve(null),
    db.ticket.findMany({
      where: { tenantId: t, installedProductId: installedProduct.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, subject: true, status: true, priority: true },
    }),
    db.ticket.count({ where: { tenantId: t, installedProductId: installedProduct.id } }),
    db.eventLog.findMany({
      where: { tenantId: t, entity: "InstalledProduct", entityId: installedProduct.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const eventItems: TimelineItem[] = events.map((e) => {
    const payload = parsePayload(e.payload);
    return {
      id: `event-${e.id}`,
      kind: "Event",
      title: (EVENT_TITLES[e.type] ?? ((p: Record<string, unknown>) => (p.note as string) || e.type))(payload),
      at: e.createdAt,
    };
  });

  const now = new Date();
  const expired = !!installedProduct.warrantyUntil && new Date(installedProduct.warrantyUntil) < now;

  const header = (
    <div className="mb-4">
      <PageHeader
        title={installedProduct.name}
        subtitle={installedProduct.account?.name || "No account linked"}
        action={
          <Link href="/installed" className="btn-ghost">
            ← Back to installed base
          </Link>
        }
      />
      <div className="flex items-center gap-2 flex-wrap">
        {installedProduct.serialNo && <span className="font-mono text-xs text-slate-500">{installedProduct.serialNo}</span>}
        {installedProduct.warrantyUntil && (
          <Badge tone={expired ? "red" : "green"}>
            {expired ? "Warranty expired" : "Under warranty"} · {shortDate(installedProduct.warrantyUntil)}
          </Badge>
        )}
      </div>
    </div>
  );

  const detailFieldNodes: { code: string; node: React.ReactNode }[] = [
    {
      code: "name",
      node: (
        <InlineField
          key="name"
          name="name"
          label="Name"
          value={installedProduct.name}
          action={updateInstalledProductAction}
          recordId={installedProduct.id}
        />
      ),
    },
    {
      code: "serialNo",
      node: (
        <InlineField
          key="serialNo"
          name="serialNo"
          label="Serial No"
          value={installedProduct.serialNo || ""}
          action={updateInstalledProductAction}
          recordId={installedProduct.id}
        />
      ),
    },
    {
      code: "installedAt",
      node: (
        <InlineField
          key="installedAt"
          name="installedAt"
          label="Installed on"
          value={installedProduct.installedAt ? installedProduct.installedAt.toISOString().slice(0, 10) : ""}
          type="date"
          action={updateInstalledProductAction}
          recordId={installedProduct.id}
        />
      ),
    },
    {
      code: "warrantyUntil",
      node: (
        <InlineField
          key="warrantyUntil"
          name="warrantyUntil"
          label="Warranty until"
          value={installedProduct.warrantyUntil ? installedProduct.warrantyUntil.toISOString().slice(0, 10) : ""}
          type="date"
          action={updateInstalledProductAction}
          recordId={installedProduct.id}
        />
      ),
    },
    {
      code: "location",
      node: (
        <InlineField
          key="location"
          name="location"
          label="Location"
          value={installedProduct.location || ""}
          action={updateInstalledProductAction}
          recordId={installedProduct.id}
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
            action={updateInstalledProductAction}
            recordId={installedProduct.id}
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

  const center = <Timeline items={eventItems} />;

  const right = (
    <>
      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-3">Account</div>
        {installedProduct.account ? (
          <div className="text-sm">
            <Link href={`/accounts/${installedProduct.account.id}`} className="text-brand-700 hover:underline font-medium">
              {installedProduct.account.name}
            </Link>
            {installedProduct.account.industry && (
              <div className="text-slate-500 text-xs mt-1">{installedProduct.account.industry}</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-400">No account linked.</div>
        )}
      </div>

      <div className="card p-4">
        <div className="font-semibold text-slate-800 mb-3">Product</div>
        {installedProduct.product ? (
          <div className="text-sm">
            {/* Products module has no per-record detail page yet — link to the list. */}
            <Link href="/products" className="text-brand-700 hover:underline font-medium">
              {installedProduct.product.name}
            </Link>
            {installedProduct.product.sku && <div className="text-slate-500 text-xs mt-1">SKU {installedProduct.product.sku}</div>}
          </div>
        ) : (
          <div className="text-sm text-slate-400">No product linked.</div>
        )}
      </div>

      {installedProduct.contractId && (
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3">Contract</div>
          {contract ? (
            <div className="text-sm">
              <Link href={`/contracts/${contract.id}`} className="text-brand-700 hover:underline font-medium">
                {contract.number}
              </Link>
              <div className="text-slate-500 text-xs mt-1">{contract.name}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">Linked contract not found.</div>
          )}
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-slate-800">Linked Tickets</div>
          <span className="text-xs text-slate-400">{ticketCount}</span>
        </div>
        {tickets.length === 0 ? (
          <div className="text-sm text-slate-400">No linked tickets.</div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {tickets.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between gap-2">
                <span className="text-slate-800 truncate">{tk.subject}</span>
                <Badge tone={badgeTone(optionTone(config, "ticket_priority", tk.priority))}>{tk.priority}</Badge>
              </li>
            ))}
          </ul>
        )}
        <Link href="/tickets" className="text-xs text-brand-700 hover:underline mt-2 inline-block">
          View all tickets →
        </Link>
      </div>
    </>
  );

  return <RecordShell header={header} left={left} center={center} right={right} />;
}
