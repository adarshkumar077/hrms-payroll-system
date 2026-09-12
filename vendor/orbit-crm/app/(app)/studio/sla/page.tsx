import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader, Empty } from "@/components/ui";
import { SlaRow } from "./SlaRow";

export const dynamic = "force-dynamic";

function parseMeta(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Orbit Studio — SLA hours (C5). One row per active ticket_priority option;
 * editing a row updates that option's meta.slaHours (config-as-data, no new
 * table). Read by ticket creation (manual + contract-automation renewal/PMS
 * visit tickets) via lib/contracts-automation.ts's computeSlaDueAt(), which
 * falls back to LEGACY_TICKET_SLA_HOURS for any priority with no meta set —
 * this page shows that same fallback for an unconfigured row so the number
 * displayed always matches what's actually in effect.
 */
export default async function StudioSlaPage() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="SLA Hours" subtitle="Configure how quickly each ticket priority must be resolved." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  const def = await db.picklistDef.findUnique({
    where: { tenantId_key: { tenantId: s.tenantId, key: "ticket_priority" } },
    include: { options: { where: { archived: false }, orderBy: { sortOrder: "asc" } } },
  });

  const priorities = def?.options ?? [];

  return (
    <div>
      <PageHeader
        title="SLA Hours"
        subtitle="Hours from ticket creation until it's due, by priority. Applies to manually created tickets left at 'Default (by priority)', and to contract-automation renewal/PMS visit tickets."
        action={
          <Link href="/studio" className="btn-ghost text-xs py-1.5">
            ← Studio
          </Link>
        }
      />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">Priority</th>
              <th className="th">Value</th>
              <th className="th">SLA hours</th>
            </tr>
          </thead>
          <tbody>
            {priorities.map((o) => {
              const meta = parseMeta(o.meta);
              const metaHours = Number((meta as { slaHours?: unknown }).slaHours);
              return (
                <SlaRow
                  key={o.id}
                  option={{
                    id: o.id,
                    value: o.value,
                    label: o.label,
                    tone: o.tone,
                    category: o.category,
                    slaHours: Number.isFinite(metaHours) && metaHours > 0 ? metaHours : null,
                  }}
                />
              );
            })}
          </tbody>
        </table>
        {priorities.length === 0 && (
          <Empty>No active ticket priority options — configure them under Picklists first.</Empty>
        )}
      </div>
    </div>
  );
}
