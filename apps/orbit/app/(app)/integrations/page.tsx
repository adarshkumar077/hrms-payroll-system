import Link from "next/link";
import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { SOURCES, samplePayload, type Source } from "@/lib/marketplace";
import { SimulateButton } from "./SimulateButton";
import { TallyKeyButton } from "./TallyKeyButton";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

const CONNECTED_WINDOW_MS = 10 * 60 * 1000; // 10 min — matches wave-d-contracts.md

export const dynamic = "force-dynamic";

const sourceTone: Record<string, string> = {
  IndiaMART: "brand",
  JustDial: "amber",
  TradeIndia: "blue",
  Website: "green",
};

// Where to paste the webhook URL inside each seller panel.
const setupNotes: Record<Source, string> = {
  IndiaMART:
    "Seller panel → Lead Manager → CRM / Push API. Paste this URL as the push callback so buyer enquiries POST here in real time.",
  JustDial:
    "JD seller dashboard → Leads / API integration. Register this URL as your lead webhook; JustDial posts each enquiry as JSON.",
  TradeIndia:
    "TradeIndia → My Inquiries → API settings. Configure this endpoint to receive inquiry push notifications.",
  Website:
    "Point your website contact/enquiry form's submit action (or a Zapier/Make webhook) at this URL.",
};

export default async function IntegrationsPage() {
  const s = await requireSession();
  if (!(await can(s, "integrations", "read"))) return <NoAccess label="Integrations" />;
  const t = s.tenantId;

  const configured = !!process.env.MARKETPLACE_WEBHOOK_KEY;

  // Build an absolute base URL for display (falls back to relative path text).
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  const base = host ? `${proto}://${host}` : "";

  const recent = await db.lead.findMany({
    where: { tenantId: t, source: { in: [...SOURCES] } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const capturedCount = await db.lead.count({
    where: { tenantId: t, source: { in: [...SOURCES] } },
  });

  // ── Tally connector state (D3) ──
  const [tallyState, ledgerCount, pendingInvoiceCount] = await Promise.all([
    db.connectorState.findUnique({ where: { tenantId_kind: { tenantId: t, kind: "tally" } } }),
    db.tallyLedger.count({ where: { tenantId: t } }),
    db.invoice.count({ where: { tenantId: t, status: "Finalized", tallyPushedAt: null } }),
  ]);
  const tallyConnected = !!tallyState?.lastSeenAt && Date.now() - tallyState.lastSeenAt.getTime() < CONNECTED_WINDOW_MS;
  const tallyStatus: { label: string; tone: string } = tallyConnected
    ? { label: "Connected", tone: "green" }
    : tallyState?.lastSeenAt
      ? { label: "Waiting", tone: "amber" }
      : { label: "Never connected", tone: "slate" };

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Inbound lead capture from marketplaces & your website."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Connection Mode"
          value={configured ? "Configured" : "Dev mode"}
          accent={configured ? "green" : "amber"}
          hint={configured ? "Webhook key set" : "MARKETPLACE_WEBHOOK_KEY unset"}
        />
        <StatCard label="Sources" value={String(SOURCES.length)} accent="brand" hint="Adapters available" />
        <StatCard
          label="Captured Leads"
          value={String(capturedCount)}
          accent="blue"
          hint="Via marketplace / website"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {SOURCES.map((src) => {
          const path = `/api/marketplace/${src}`;
          const url = base ? `${base}${path}` : path;
          return (
            <div key={src} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Badge tone={sourceTone[src] || "slate"}>{src}</Badge>
                  <span className="font-semibold text-slate-900">{src}</span>
                </div>
                <Badge tone={configured ? "green" : "amber"}>
                  {configured ? "Configured" : "Dev mode"}
                </Badge>
              </div>

              <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">
                Webhook URL
              </div>
              <code className="block w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3 text-slate-700 break-all">
                {url}
              </code>

              <p className="text-sm text-slate-500 mb-4">{setupNotes[src]}</p>

              <SimulateButton
                source={src}
                payload={samplePayload(src)}
                webhookKey={process.env.MARKETPLACE_WEBHOOK_KEY}
              />
            </div>
          );
        })}
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-3">Accounting</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Badge tone="blue">Tally</Badge>
              <span className="font-semibold text-slate-900">Tally Sync</span>
            </div>
            <Badge tone={tallyStatus.tone}>{tallyStatus.label}</Badge>
          </div>

          <p className="text-sm text-slate-500 mb-4">
            On-prem connector CLI that mirrors Tally ledgers in and pushes finalized invoices out as Sales vouchers.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Ledgers synced</div>
              <div className="font-semibold text-slate-800">{ledgerCount}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Pending invoices</div>
              <div className="font-semibold text-slate-800">{pendingInvoiceCount}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Last ledger sync</div>
              <div className="text-slate-700">{shortDate(tallyState?.lastLedgerSyncAt)}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Last voucher push</div>
              <div className="text-slate-700">{shortDate(tallyState?.lastVoucherPushAt)}</div>
            </div>
          </div>

          <TallyKeyButton hasKey={!!tallyState} />

          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
            <div>
              <Link href="/integrations/tally" className="text-brand-700 hover:underline">
                View synced ledgers →
              </Link>
            </div>
            <div>
              Connector setup steps: <code className="font-mono text-slate-600">connector/README.md</code>
            </div>
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mb-3">Recently captured</h2>
      {recent.length === 0 ? (
        <Empty>No leads captured yet. Use “Simulate incoming lead” above to test the pipeline.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Source</th>
                <th className="th">Name</th>
                <th className="th">Company</th>
                <th className="th">Score</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((lead) => (
                <tr key={lead.id}>
                  <td className="td">
                    <Badge tone={sourceTone[lead.source] || "slate"}>{lead.source}</Badge>
                  </td>
                  <td className="td">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline">
                      {lead.name}
                    </Link>
                  </td>
                  <td className="td text-slate-600">{lead.company || "—"}</td>
                  <td className="td">
                    {lead.score == null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      <span className="font-semibold text-slate-800" title={lead.scoreReason || ""}>
                        {lead.score}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
