import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { RunPayrollButton } from "./RunActions";
import { RunStatusActions } from "./RunActions";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, moduleLabel } from "@/lib/studio/config";

export const dynamic = "force-dynamic";

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function statusTone(status: string): string {
  if (status === "Paid") return "green";
  if (status === "Locked") return "amber";
  return "slate"; // Draft
}

// Compute the label for the "next" month that a new run would target.
function nextLabel(last: { month: number; year: number } | null): string {
  let month: number, year: number;
  if (!last) {
    const now = new Date();
    month = now.getMonth() + 1;
    year = now.getFullYear();
  } else if (last.month >= 12) {
    month = 1;
    year = last.year + 1;
  } else {
    month = last.month + 1;
    year = last.year;
  }
  return `${MONTHS[month]} ${year}`;
}

export default async function PayrollPage() {
  const s = await requireSession();
  if (!(await can(s, "payroll", "read"))) return <NoAccess label="Payroll" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);

  const [runs, structureCount] = await Promise.all([
    db.payrollRun.findMany({
      where: { tenantId: t },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: { _count: { select: { payslips: true } } },
    }),
    db.salaryStructure.count({ where: { tenantId: t } }),
  ]);

  const latest = runs[0] ?? null;
  const statutory = latest ? latest.pfTotal + latest.esiTotal + latest.tdsTotal : 0;
  const next = nextLabel(latest);

  return (
    <div>
      <PageHeader
        title={moduleLabel(config, "payroll", "plural")}
        subtitle="India statutory payroll — PF, ESI, PT & TDS computed per the 2025 Labour Codes."
        action={<RunPayrollButton nextLabel={next} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Latest Gross"
          value={inr(latest?.grossTotal ?? 0)}
          accent="brand"
          hint={latest ? `${MONTHS[latest.month]} ${latest.year}` : "No runs yet"}
        />
        <StatCard
          label="Latest Net Payout"
          value={inr(latest?.netTotal ?? 0)}
          accent="green"
          hint={latest ? `${latest._count.payslips} payslip(s)` : "No runs yet"}
        />
        <StatCard
          label="Statutory Total"
          value={inr(statutory)}
          accent="amber"
          hint="PF + ESI + TDS"
        />
        <StatCard
          label="Salary Structures"
          value={String(structureCount)}
          accent="slate"
          hint="Employees on payroll"
        />
      </div>

      {structureCount === 0 && (
        <div className="mb-4">
          <Badge tone="amber">No salary structures found — add them under HR before running payroll.</Badge>
        </div>
      )}

      {runs.length === 0 ? (
        <Empty>No payroll runs yet. Use “Run payroll for {next}” to draft the first one.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Period</th>
                <th className="th">Status</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Net</th>
                <th className="th text-right">PF</th>
                <th className="th text-right">ESI</th>
                <th className="th text-right">TDS</th>
                <th className="th text-right">Payslips</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td">
                    <Link href={`/payroll/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {MONTHS[r.month]} {r.year}
                    </Link>
                  </td>
                  <td className="td">
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </td>
                  <td className="td text-right">{inr(r.grossTotal)}</td>
                  <td className="td text-right">{inr(r.netTotal)}</td>
                  <td className="td text-right">{inr(r.pfTotal)}</td>
                  <td className="td text-right">{inr(r.esiTotal)}</td>
                  <td className="td text-right">{inr(r.tdsTotal)}</td>
                  <td className="td text-right">{r._count.payslips}</td>
                  <td className="td text-right">
                    <RunStatusActions runId={r.id} status={r.status} />
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
