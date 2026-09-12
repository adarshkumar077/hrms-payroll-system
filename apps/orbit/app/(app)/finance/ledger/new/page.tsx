import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureChart } from "@/lib/gl";
import { NewJournalForm } from "./NewJournalForm";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

export default async function NewJournalPage() {
  const s = await requireSession();
  if (!(await can(s, "finance", "read"))) return <NoAccess label="Finance" />;

  await ensureChart(s.tenantId);
  const accounts = await db.ledgerAccount.findMany({
    where: { tenantId: s.tenantId },
    orderBy: { code: "asc" },
    select: { code: true, name: true },
  });

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-900">New Journal Entry</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manual double-entry posting — debits must equal credits.</p>
      </div>
      <NewJournalForm accounts={accounts} />
    </div>
  );
}
