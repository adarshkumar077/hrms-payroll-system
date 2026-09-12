import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { PrintButton } from "../../PrintButton";

export const dynamic = "force-dynamic";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function PrintPayslipPage({ params }: { params: { id: string } }) {
  const s = await requireSession();

  const payslip = await db.payslip.findFirst({
    where: { id: params.id, payrollRun: { tenantId: s.tenantId } },
    include: { employee: true, payrollRun: true },
  });

  if (!payslip) notFound();

  const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });

  const period = `${MONTHS[payslip.payrollRun.month]} ${payslip.payrollRun.year}`;
  const totalDeductions =
    payslip.pfEmployee + payslip.esiEmployee + payslip.pt + payslip.tds + payslip.lossOfPay;
  const totalEmployerContrib = payslip.pfEmployer + payslip.esiEmployer;
  const earningsGross = payslip.gross - payslip.lossOfPay;

  return (
    <div className="print-root">
      <style>{`
        .print-root {
          font-family: Arial, Helvetica, sans-serif;
          color: #0f172a;
          padding: 2rem;
          background: #fff;
        }
        .print-root * { box-sizing: border-box; }
        .sheet { max-width: 800px; margin: 0 auto; }
        h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 6px 8px; font-size: 12.5px; text-align: left; }
        thead th { border-bottom: 2px solid #0f172a; text-transform: uppercase; font-size: 10.5px; letter-spacing: .03em; color: #475569; }
        tbody tr { border-bottom: 1px solid #e2e8f0; }
        .right { text-align: right; }
        .muted { color: #64748b; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 1rem; margin-bottom: 1rem; }
        .meta { display: flex; justify-content: space-between; gap: 2rem; margin-bottom: 1.25rem; }
        .meta-block { flex: 1; }
        .meta-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; color: #64748b; margin-bottom: 2px; }
        .cols { display: flex; gap: 1.5rem; margin-top: 1rem; }
        .col { flex: 1; }
        .col h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: #475569; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 0 0 6px; }
        .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
        .row.total { border-top: 1px solid #cbd5e1; font-weight: bold; margin-top: 4px; padding-top: 6px; }
        .net-box { margin-top: 1.5rem; border: 2px solid #0f172a; border-radius: 6px; padding: 1rem; display: flex; justify-content: space-between; align-items: center; }
        .net-box .label { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #475569; }
        .net-box .amount { font-size: 1.5rem; font-weight: bold; }
        .employer-note { margin-top: 1rem; font-size: 11.5px; color: #64748b; }
        .toolbar { margin-bottom: 1.5rem; }
        @media print {
          .print-root { padding: 0; }
          .no-print { display: none !important; }
          .sheet { max-width: none; }
        }
      `}</style>
      <div className="sheet">
        <div className="toolbar no-print">
          <PrintButton />
        </div>

        <div className="header">
          <div>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
              Payslip
            </div>
            <h1>{period}</h1>
            <div className="muted">{tenant?.name || "—"}</div>
          </div>
          <div className="right">
            <div style={{ fontWeight: 600 }}>{payslip.employee.name}</div>
            <div className="muted">Emp. Code: {payslip.employee.code}</div>
          </div>
        </div>

        <div className="meta">
          <div className="meta-block">
            <div className="meta-label">Employee</div>
            <div>{payslip.employee.name}</div>
            <div className="muted">{payslip.employee.designation || "—"} · {payslip.employee.department || "—"}</div>
          </div>
          <div className="meta-block">
            <div className="meta-label">Pay Period</div>
            <div>{period}</div>
            <div className="muted">Run status: {payslip.payrollRun.status}</div>
          </div>
        </div>

        <div className="cols">
          <div className="col">
            <h2>Earnings</h2>
            <div className="row">
              <span>Basic</span>
              <span>{inr(payslip.basic)}</span>
            </div>
            <div className="row">
              <span>Other allowances</span>
              <span>{inr(Math.max(0, payslip.gross - payslip.basic))}</span>
            </div>
            {payslip.lossOfPay > 0 && (
              <div className="row">
                <span>Loss of pay</span>
                <span>-{inr(payslip.lossOfPay)}</span>
              </div>
            )}
            <div className="row total">
              <span>Gross Earnings</span>
              <span>{inr(earningsGross)}</span>
            </div>
          </div>

          <div className="col">
            <h2>Deductions</h2>
            <div className="row">
              <span>PF (employee)</span>
              <span>{inr(payslip.pfEmployee)}</span>
            </div>
            <div className="row">
              <span>ESI (employee)</span>
              <span>{inr(payslip.esiEmployee)}</span>
            </div>
            <div className="row">
              <span>Professional Tax</span>
              <span>{inr(payslip.pt)}</span>
            </div>
            <div className="row">
              <span>TDS</span>
              <span>{inr(payslip.tds)}</span>
            </div>
            <div className="row total">
              <span>Total Deductions</span>
              <span>{inr(totalDeductions - payslip.lossOfPay)}</span>
            </div>
          </div>
        </div>

        <div className="net-box">
          <span className="label">Net Pay</span>
          <span className="amount">{inr(payslip.netPay)}</span>
        </div>

        <div className="employer-note">
          Employer contributions (not deducted from pay): PF employer {inr(payslip.pfEmployer)} · ESI employer{" "}
          {inr(payslip.esiEmployer)} · Total employer contribution {inr(totalEmployerContrib)}.
        </div>

        <p className="muted" style={{ fontSize: 11, marginTop: "2rem" }}>
          Computer-generated payslip. Statutory deductions per PF/ESI/PT/TDS rules in force.
        </p>
      </div>
    </div>
  );
}
