"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { computePayslip } from "@/lib/compliance/payroll";
import { postPayrollJournal } from "@/lib/gl";

// Given the tenant's latest run (if any), figure out the next month/year to process.
function nextPeriod(last: { month: number; year: number } | null): { month: number; year: number } {
  if (!last) {
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() }; // 1-12
  }
  if (last.month >= 12) return { month: 1, year: last.year + 1 };
  return { month: last.month + 1, year: last.year };
}

// (1) Run payroll for the next month: build a Draft run + one payslip per salary structure,
// aggregate statutory totals onto the run, emit, revalidate.
export async function runPayrollAction() {
  const s = await requireSession();
  const t = s.tenantId;

  const structures = await db.salaryStructure.findMany({ where: { tenantId: t } });
  if (structures.length === 0) return;

  const last = await db.payrollRun.findFirst({
    where: { tenantId: t },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { month: true, year: true },
  });
  const { month, year } = nextPeriod(last);

  const slips = structures.map((st) => {
    const calc = computePayslip({ gross: st.gross, basic: st.basic, annualGross: st.gross * 12 });
    return { employeeId: st.employeeId, calc };
  });

  const totals = slips.reduce(
    (a, { calc }) => ({
      gross: a.gross + calc.gross,
      net: a.net + calc.netPay,
      pf: a.pf + calc.pfEmployee + calc.pfEmployer,
      esi: a.esi + calc.esiEmployee + calc.esiEmployer,
      tds: a.tds + calc.tds,
    }),
    { gross: 0, net: 0, pf: 0, esi: 0, tds: 0 }
  );

  const run = await db.payrollRun.create({
    data: {
      tenantId: t,
      month,
      year,
      status: "Draft",
      grossTotal: totals.gross,
      netTotal: totals.net,
      pfTotal: totals.pf,
      esiTotal: totals.esi,
      tdsTotal: totals.tds,
      payslips: {
        create: slips.map(({ employeeId, calc }) => ({
          employeeId,
          gross: calc.gross,
          basic: calc.basic,
          pfEmployee: calc.pfEmployee,
          pfEmployer: calc.pfEmployer,
          esiEmployee: calc.esiEmployee,
          esiEmployer: calc.esiEmployer,
          pt: calc.pt,
          tds: calc.tds,
          lossOfPay: calc.lossOfPay,
          netPay: calc.netPay,
        })),
      },
    },
  });

  await emit({
    tenantId: t,
    type: "payroll.run.created",
    entity: "PayrollRun",
    entityId: run.id,
    actorId: s.userId,
    payload: {
      note: `Payroll run drafted for ${month}/${year} — ${slips.length} payslip(s)`,
      month,
      year,
      count: slips.length,
      grossTotal: totals.gross,
      netTotal: totals.net,
    },
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${run.id}`);
}

// Status transition: Draft -> Locked.
export async function lockRunAction(runId: string) {
  const s = await requireSession();
  const run = await db.payrollRun.findFirst({ where: { id: runId, tenantId: s.tenantId } });
  if (!run || run.status !== "Draft") return;

  await db.payrollRun.update({ where: { id: run.id }, data: { status: "Locked" } });

  // GL auto-posting is additive and must never break the lock transition.
  // Guard against double-posting on repeated/racing lock calls.
  try {
    const reference = `Payroll ${run.month}/${run.year}`;
    const already = await db.journalEntry.findFirst({ where: { tenantId: s.tenantId, reference } });
    if (!already) {
      await postPayrollJournal(s.tenantId, {
        label: `${run.month}/${run.year}`,
        grossTotal: run.grossTotal,
        netTotal: run.netTotal,
        pfTotal: run.pfTotal,
        esiTotal: run.esiTotal,
        tdsTotal: run.tdsTotal,
      });
    }
  } catch (err) {
    console.error("postPayrollJournal failed", err);
  }

  await emit({
    tenantId: s.tenantId,
    type: "payroll.run.locked",
    entity: "PayrollRun",
    entityId: run.id,
    actorId: s.userId,
    payload: { note: `Payroll ${run.month}/${run.year} locked`, month: run.month, year: run.year },
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${run.id}`);
}

// Status transition: Locked -> Paid.
export async function markPaidAction(runId: string) {
  const s = await requireSession();
  const run = await db.payrollRun.findFirst({ where: { id: runId, tenantId: s.tenantId } });
  if (!run || run.status !== "Locked") return;

  await db.payrollRun.update({ where: { id: run.id }, data: { status: "Paid" } });

  await emit({
    tenantId: s.tenantId,
    type: "payroll.run.paid",
    entity: "PayrollRun",
    entityId: run.id,
    actorId: s.userId,
    payload: {
      note: `Payroll ${run.month}/${run.year} marked paid — ${run.netTotal} disbursed`,
      month: run.month,
      year: run.year,
      netTotal: run.netTotal,
    },
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${run.id}`);
}
