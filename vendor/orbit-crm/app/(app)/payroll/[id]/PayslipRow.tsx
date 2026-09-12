"use client";

import { useState } from "react";
import { inr } from "@/lib/format";

export type SlipView = {
  id: string;
  name: string;
  code: string;
  gross: number;
  basic: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  pt: number;
  tds: number;
  lossOfPay: number;
  netPay: number;
  period: string;
};

// Mask helper — when the netPay field is RBAC-hidden we render bullets instead of the amount.
function money(value: number, masked: boolean): string {
  return masked ? "•••" : inr(value);
}

export function PayslipRow({ slip, maskNet }: { slip: SlipView; maskNet: boolean }) {
  const [open, setOpen] = useState(false);
  const pf = slip.pfEmployee + slip.pfEmployer;

  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="td font-medium text-slate-800">
          {slip.name}
          <div className="text-xs text-slate-400">{slip.code}</div>
        </td>
        <td className="td text-right">{inr(slip.gross)}</td>
        <td className="td text-right">{inr(slip.basic)}</td>
        <td className="td text-right">{inr(pf)}</td>
        <td className="td text-right">{inr(slip.esiEmployee + slip.esiEmployer)}</td>
        <td className="td text-right">{inr(slip.pt)}</td>
        <td className="td text-right">{inr(slip.tds)}</td>
        <td className="td text-right font-semibold text-slate-900">{money(slip.netPay, maskNet)}</td>
        <td className="td text-right">
          <button className="btn-ghost text-xs py-1" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "View slip"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} className="td bg-slate-50">
            <PayslipCard slip={slip} maskNet={maskNet} />
          </td>
        </tr>
      )}
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800 tabular-nums">{value}</span>
    </div>
  );
}

// Clean payslip layout — earnings vs deductions vs net.
function PayslipCard({ slip, maskNet }: { slip: SlipView; maskNet: boolean }) {
  const allowances = Math.max(0, slip.gross - slip.basic);
  const totalDeductions = slip.pfEmployee + slip.esiEmployee + slip.pt + slip.tds + slip.lossOfPay;

  return (
    <div className="card p-5 max-w-3xl mx-auto my-2 bg-white">
      <div className="flex items-start justify-between border-b border-slate-100 pb-3 mb-4">
        <div>
          <div className="text-sm font-bold text-slate-900">{slip.name}</div>
          <div className="text-xs text-slate-400">
            {slip.code} · Payslip for {slip.period}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-slate-400">Net Pay</div>
          <div className="text-xl font-bold text-emerald-600">{money(slip.netPay, maskNet)}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Earnings */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Earnings</div>
          <Line label="Basic" value={inr(slip.basic)} />
          <Line label="HRA + Allowances" value={inr(allowances)} />
          <div className="flex items-center justify-between py-1.5 mt-1 border-t border-slate-100 text-sm font-semibold">
            <span className="text-slate-700">Gross Earnings</span>
            <span className="text-slate-900 tabular-nums">{inr(slip.gross)}</span>
          </div>
        </div>

        {/* Deductions */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Deductions</div>
          <Line label="Provident Fund (12%)" value={inr(slip.pfEmployee)} />
          <Line label="ESI (0.75%)" value={inr(slip.esiEmployee)} />
          <Line label="Professional Tax" value={inr(slip.pt)} />
          <Line label="TDS" value={inr(slip.tds)} />
          {slip.lossOfPay > 0 && <Line label="Loss of Pay" value={inr(slip.lossOfPay)} />}
          <div className="flex items-center justify-between py-1.5 mt-1 border-t border-slate-100 text-sm font-semibold">
            <span className="text-slate-700">Total Deductions</span>
            <span className="text-slate-900 tabular-nums">{inr(totalDeductions)}</span>
          </div>
        </div>
      </div>

      {/* Net */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-200">
        <span className="text-sm font-semibold text-slate-700">Net Pay (Gross − Deductions)</span>
        <span className="text-lg font-bold text-slate-900">{money(slip.netPay, maskNet)}</span>
      </div>

      <div className="mt-3 text-xs text-slate-400">
        Employer contributions (not deducted from employee): PF {inr(slip.pfEmployer)} · ESI {inr(slip.esiEmployer)}.
      </div>
    </div>
  );
}
