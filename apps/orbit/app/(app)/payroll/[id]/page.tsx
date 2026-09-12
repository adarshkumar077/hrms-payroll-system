import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { fieldHidden } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { PayslipRow, type SlipView } from "./PayslipRow";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function statusTone(status: string): string {
  if (status === "Paid") return "green";
  if (status === "Locked") return "amber";
  return "slate";
}

export default async function PayrollRunPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "payroll", "read"))) return <NoAccess label="Payroll" />;
  const t = s.tenantId;

  const run = await db.payrollRun.findFirst({
    where: { id: params.id, tenantId: t },
    include: {
      payslips: {
        include: { employee: { select: { name: true, code: true } } },
        orderBy: { employee: { name: "asc" } },
      },
    },
  });

  if (!run) notFound();

  const maskNet = await fieldHidden(s, "payslip.netPay");
  const period = `${MONTHS[run.month]} ${run.year}`;

  const slips: SlipView[] = run.payslips.map((p) => ({
    id: p.id,
    name: p.employee?.name ?? "—",
    code: p.employee?.code ?? "—",
    gross: p.gross,
    basic: p.basic,
    pfEmployee: p.pfEmployee,
    pfEmployer: p.pfEmployer,
    esiEmployee: p.esiEmployee,
    esiEmployer: p.esiEmployer,
    pt: p.pt,
    tds: p.tds,
    lossOfPay: p.lossOfPay,
    netPay: p.netPay,
    period,
  }));

  // Footer totals across all payslips.
  const totals = slips.reduce(
    (a, p) => ({
      gross: a.gross + p.gross,
      basic: a.basic + p.basic,
      pf: a.pf + p.pfEmployee + p.pfEmployer,
      esi: a.esi + p.esiEmployee + p.esiEmployer,
      pt: a.pt + p.pt,
      tds: a.tds + p.tds,
      net: a.net + p.netPay,
    }),
    { gross: 0, basic: 0, pf: 0, esi: 0, pt: 0, tds: 0, net: 0 }
  );

  return (
    <div>
      <PageHeader
        title={`Payslip Register — ${period}`}
        subtitle={`${slips.length} employee(s) · run status below`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(run.status)}>{run.status}</Badge>
            <Link href="/payroll" className="btn-ghost text-sm">
              ← All runs
            </Link>
          </div>
        }
      />

      {slips.length === 0 ? (
        <Empty>No payslips in this run.</Empty>
      ) : (
        <div className="card overflow-hidden mb-4">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Employee</th>
                <th className="th text-right">Gross</th>
                <th className="th text-right">Basic</th>
                <th className="th text-right">PF (EE+ER)</th>
                <th className="th text-right">ESI</th>
                <th className="th text-right">PT</th>
                <th className="th text-right">TDS</th>
                <th className="th text-right">Net Pay</th>
                <th className="th text-right">Slip</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((slip) => (
                <PayslipRow key={slip.id} slip={slip} maskNet={maskNet} />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold text-slate-800">
                <td className="td">Totals</td>
                <td className="td text-right">{inr(totals.gross)}</td>
                <td className="td text-right">{inr(totals.basic)}</td>
                <td className="td text-right">{inr(totals.pf)}</td>
                <td className="td text-right">{inr(totals.esi)}</td>
                <td className="td text-right">{inr(totals.pt)}</td>
                <td className="td text-right">{inr(totals.tds)}</td>
                <td className="td text-right">{maskNet ? "•••" : inr(totals.net)}</td>
                <td className="td"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Compliance note — statutory rates. */}
      <div className="card p-4 text-sm text-slate-600">
        <div className="font-semibold text-slate-800 mb-2">📋 Statutory compliance notes</div>
        <ul className="space-y-1 list-disc list-inside">
          <li>
            <span className="font-medium text-slate-700">Provident Fund (PF):</span> 12% employee + 12% employer on
            basic, capped at a wage ceiling of {inr(15000)}.
          </li>
          <li>
            <span className="font-medium text-slate-700">ESI:</span> 0.75% employee + 3.25% employer, applicable only
            when monthly gross wage is ≤ {inr(21000)}.
          </li>
          <li>
            <span className="font-medium text-slate-700">Professional Tax (PT):</span> state slab (Maharashtra-style
            here) — up to {inr(200)}/month.
          </li>
          <li>
            <span className="font-medium text-slate-700">TDS:</span> estimated on annualised gross under the new regime
            (₹7L rebate, standard deduction ₹75k, +4% cess).
          </li>
          <li>
            <span className="font-medium text-slate-700">2025 Labour Codes:</span> basic pay must be ≥ 50% of gross to
            keep the structure compliant.
          </li>
        </ul>
      </div>
    </div>
  );
}
