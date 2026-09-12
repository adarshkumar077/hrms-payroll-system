import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { FilterBar, Pagination } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { shortDate } from "@/lib/format";
import { whatsappConfigured } from "@/lib/whatsapp";
import { SendMessageForm } from "./SendMessageForm";

export const dynamic = "force-dynamic";

// MessageLog.channel / deliveryStatus are provider-domain literals (sanctioned
// exception, docs/ai/design/wave-d-contracts.md §Sanctioned literals) — plain
// strings, NOT Studio picklists, so the tone maps are hardcoded here rather
// than resolved via lib/studio/config.
const CHANNEL_OPTIONS = ["whatsapp", "sms"];
const DELIVERY_STATUS_OPTIONS = ["queued", "sent", "delivered", "read", "failed"];

const CHANNEL_TONE: Record<string, string> = {
  whatsapp: "green",
  sms: "blue",
};

const DELIVERY_TONE: Record<string, string> = {
  queued: "slate",
  sent: "blue",
  delivered: "green",
  read: "brand",
  failed: "red",
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const s = await requireSession();
  if (!(await can(s, "messages", "read"))) return <NoAccess label="Messages" />;
  const t = s.tenantId;
  const canWrite = await can(s, "messages", "write");

  const p = parseListParams(searchParams);
  const channelParam = searchParams["channel"];
  const channel = (Array.isArray(channelParam) ? channelParam[0] : channelParam) || "";

  const toParam = searchParams["to"];
  const entityParam = searchParams["entity"];
  const entityIdParam = searchParams["entityId"];
  const initialTo = (Array.isArray(toParam) ? toParam[0] : toParam) || "";
  const initialEntity = (Array.isArray(entityParam) ? entityParam[0] : entityParam) || null;
  const initialEntityId = (Array.isArray(entityIdParam) ? entityIdParam[0] : entityIdParam) || null;

  const where = {
    tenantId: t,
    ...(channel ? { channel } : {}),
    ...(p.status ? { deliveryStatus: p.status } : {}),
    ...(p.q
      ? {
          OR: [{ toNumber: { contains: p.q } }, { body: { contains: p.q } }],
        }
      : {}),
  };

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [messages, total, sentToday, failedToday, deliveredOrRead, sentOrBetter] = await Promise.all([
    db.messageLog.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["createdAt"], { createdAt: "desc" }),
      skip: p.skip,
      take: p.take,
    }),
    db.messageLog.count({ where }),
    db.messageLog.count({
      where: { tenantId: t, createdAt: { gte: startOfDay }, deliveryStatus: { in: ["sent", "delivered", "read"] } },
    }),
    db.messageLog.count({ where: { tenantId: t, createdAt: { gte: startOfDay }, deliveryStatus: "failed" } }),
    db.messageLog.count({ where: { tenantId: t, deliveryStatus: { in: ["delivered", "read"] } } }),
    db.messageLog.count({ where: { tenantId: t, deliveryStatus: { notIn: ["queued", "failed"] } } }),
  ]);

  const deliveredRate = sentOrBetter > 0 ? Math.round((deliveredOrRead / sentOrBetter) * 100) : null;

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="WhatsApp / SMS send log — delivery status tracked via provider webhooks."
        action={
          canWrite ? (
            <SendMessageForm initialTo={initialTo} initialEntity={initialEntity} initialEntityId={initialEntityId} />
          ) : undefined
        }
      />

      {!whatsappConfigured && (
        <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <span className="font-semibold">WhatsApp provider not configured — running in mock mode.</span>{" "}
          Sends still work and appear below with a <span className="font-mono">mock-*</span> provider id; delivery
          flips to "sent" immediately. Set <span className="font-mono">WHATSAPP_PROVIDER=exotel</span> +{" "}
          <span className="font-mono">EXOTEL_*</span> creds in <span className="font-mono">.env</span> to go live
          (see <span className="font-mono">.env.whatsapp.example</span>).
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Sent Today" value={String(sentToday)} accent="brand" hint="Left the queue today" />
        <StatCard
          label="Delivered Rate"
          value={deliveredRate === null ? "—" : `${deliveredRate}%`}
          accent={deliveredRate === null ? "slate" : deliveredRate >= 80 ? "green" : "amber"}
          hint="Delivered+read / sent-or-better"
        />
        <StatCard label="Failed Today" value={String(failedToday)} accent={failedToday > 0 ? "red" : "slate"} hint="Provider rejected" />
      </div>

      <FilterBar
        statuses={DELIVERY_STATUS_OPTIONS}
        placeholder="Search number or message…"
        extra={{ param: "channel", options: CHANNEL_OPTIONS, label: "All channels" }}
      />

      {messages.length === 0 ? (
        <Empty>No messages match your filters.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Channel</th>
                <th className="th">To</th>
                <th className="th">Message</th>
                <th className="th">Template</th>
                <th className="th">Status</th>
                <th className="th">Sent</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id}>
                  <td className="td">
                    <Badge tone={CHANNEL_TONE[m.channel] || "slate"}>{m.channel}</Badge>
                  </td>
                  <td className="td font-medium text-slate-800">{m.toNumber}</td>
                  <td className="td text-slate-600" title={m.body}>
                    {truncate(m.body, 60)}
                  </td>
                  <td className="td text-slate-500">{m.templateKey || "—"}</td>
                  <td className="td">
                    <Badge tone={DELIVERY_TONE[m.deliveryStatus] || "slate"}>{m.deliveryStatus}</Badge>
                    {m.deliveryStatus === "failed" && m.error && (
                      <div className="mt-0.5 text-xs text-rose-500" title={m.error}>
                        {truncate(m.error, 40)}
                      </div>
                    )}
                  </td>
                  <td className="td text-slate-500">{shortDate(m.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination {...pageInfo(total, p.page)} />
    </div>
  );
}
