import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError, inrLakh } from "../../lib/api";
import { PageHeader, StatCard } from "../../components/Layout";
import { Modal } from "../../components/Modal";

type PayrollRun = {
  id: string;
  month: number;
  year: number;
  status: "Draft" | "Locked" | "Paid" | string;
  gross_total: number;
  net_total: number;
  pf_total: number;
  esi_total: number;
  tds_total: number;
};

type Payslip = {
  id: string;
  employee: { id: string; name: string; code: string } | null;
  gross: number;
  basic: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  pt: number;
  tds: number;
  lossOfPay: number;
  netPay: number | string;
};

type RunDetail = {
  run: PayrollRun;
  payslips: Payslip[];
  totals: {
    gross: number;
    basic: number;
    pf: number;
    esi: number;
    pt: number;
    tds: number;
    net: number | string;
  };
};

const MONTHS = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    Draft: "badge bg-slate-100 text-slate-600",
    Locked: "badge bg-amber-50 text-amber-700",
    Paid: "badge bg-emerald-50 text-emerald-700",
  };
  return <span className={cls[status] || "badge"}>{status}</span>;
}

function moneyOrMasked(v: number | string) {
  return typeof v === "number" ? inrLakh(v) : String(v);
}

export function PayrollPage() {
  const [rows, setRows] = useState<PayrollRun[] | null>(null);
  const [err, setErr] = useState("");
  const [running, setRunning] = useState(false);
  const [runErr, setRunErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<Record<string, string>>({});

  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  function load() {
    setErr("");
    apiGet<any>("/payroll/runs")
      .then((r) => setRows(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function runPayroll() {
    setRunning(true);
    setRunErr("");
    try {
      await apiPost("/payroll/runs/run");
      load();
    } catch (e: any) {
      setRunErr(e instanceof ApiError ? e.message : "Failed to run payroll.");
    } finally {
      setRunning(false);
    }
  }

  async function transition(id: string, action: "lock" | "pay") {
    setBusyId(id);
    setRowErr((m) => ({ ...m, [id]: "" }));
    try {
      await apiPost(`/payroll/runs/${id}/${action}`);
      load();
    } catch (e: any) {
      setRowErr((m) => ({ ...m, [id]: e instanceof ApiError ? e.message : "Action failed." }));
    } finally {
      setBusyId(null);
    }
  }

  async function openRegister(id: string) {
    setDetailLoadingId(id);
    setDetailErr("");
    setDetail(null);
    try {
      const d = await apiGet<RunDetail>(`/payroll/runs/${id}`);
      setDetail(d);
    } catch (e: any) {
      setDetailErr(e instanceof ApiError ? e.message : "Failed to load payslip register.");
    } finally {
      setDetailLoadingId(null);
    }
  }

  const totalGross = (rows || []).reduce((s, r) => s + Number(r.gross_total || 0), 0);
  const totalNet = (rows || []).reduce((s, r) => s + Number(r.net_total || 0), 0);

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle={rows ? `${rows.length} run${rows.length === 1 ? "" : "s"}` : undefined}
        action={
          <button className="btn" onClick={runPayroll} disabled={running}>
            {running ? "Running…" : "▶ Run payroll"}
          </button>
        }
      />

      {runErr && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{runErr}</div>}

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <StatCard label="Total Gross (all runs)" value={inrLakh(totalGross)} accent="brand" />
          <StatCard label="Total Net (all runs)" value={inrLakh(totalNet)} accent="green" />
        </div>
      )}

      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Period</th>
              <th className="th">Status</th>
              <th className="th">Gross</th>
              <th className="th">Net</th>
              <th className="th">PF</th>
              <th className="th">ESI</th>
              <th className="th">TDS</th>
              <th className="th">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td className="td text-slate-400" colSpan={8}>
                  Loading…
                </td>
              </tr>
            )}
            {rows !== null && rows.length === 0 && (
              <tr>
                <td className="td text-slate-400" colSpan={8}>
                  No payroll runs yet. Click "Run payroll" to draft one.
                </td>
              </tr>
            )}
            {(rows || []).map((r) => (
              <tr key={r.id}>
                <td className="td">
                  <button
                    className="font-medium text-brand-700 hover:underline"
                    onClick={() => openRegister(r.id)}
                    disabled={detailLoadingId === r.id}
                  >
                    {detailLoadingId === r.id ? "Loading…" : `${MONTHS[r.month] || r.month} ${r.year}`}
                  </button>
                </td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td">{inrLakh(Number(r.gross_total || 0))}</td>
                <td className="td">{inrLakh(Number(r.net_total || 0))}</td>
                <td className="td">{inrLakh(Number(r.pf_total || 0))}</td>
                <td className="td">{inrLakh(Number(r.esi_total || 0))}</td>
                <td className="td">{inrLakh(Number(r.tds_total || 0))}</td>
                <td className="td">
                  <div className="flex flex-col gap-1">
                    <div className="flex gap-2">
                      {r.status === "Draft" && (
                        <button
                          className="btn-ghost text-xs py-1"
                          disabled={busyId === r.id}
                          onClick={() => transition(r.id, "lock")}
                        >
                          {busyId === r.id ? "…" : "Lock"}
                        </button>
                      )}
                      {r.status === "Locked" && (
                        <button
                          className="btn-ghost text-emerald-700 text-xs py-1"
                          disabled={busyId === r.id}
                          onClick={() => transition(r.id, "pay")}
                        >
                          {busyId === r.id ? "…" : "Pay"}
                        </button>
                      )}
                      {r.status === "Paid" && <span className="text-slate-300 text-xs">—</span>}
                    </div>
                    {rowErr[r.id] && <div className="text-xs text-rose-600">{rowErr[r.id]}</div>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(detail || detailErr) && (
        <Modal
          title={detail ? `Payslip Register — ${MONTHS[detail.run.month] || detail.run.month} ${detail.run.year}` : "Payslip Register"}
          onClose={() => {
            setDetail(null);
            setDetailErr("");
          }}
          wide
        >
          {detailErr && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{detailErr}</div>}
          {detail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Gross" value={inrLakh(detail.totals.gross)} accent="brand" />
                <StatCard label="Net" value={moneyOrMasked(detail.totals.net)} accent="green" />
                <StatCard label="PF" value={inrLakh(detail.totals.pf)} accent="blue" />
                <StatCard label="ESI" value={inrLakh(detail.totals.esi)} accent="amber" />
                <StatCard label="PT" value={inrLakh(detail.totals.pt)} accent="slate" />
                <StatCard label="TDS" value={inrLakh(detail.totals.tds)} accent="red" />
              </div>
              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="th">Employee</th>
                      <th className="th">Gross</th>
                      <th className="th">Basic</th>
                      <th className="th">PF</th>
                      <th className="th">ESI</th>
                      <th className="th">PT</th>
                      <th className="th">TDS</th>
                      <th className="th">LOP</th>
                      <th className="th">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payslips.length === 0 && (
                      <tr>
                        <td className="td text-slate-400" colSpan={9}>
                          No payslips in this run.
                        </td>
                      </tr>
                    )}
                    {detail.payslips.map((p) => (
                      <tr key={p.id}>
                        <td className="td font-medium text-slate-800">
                          {p.employee ? `${p.employee.name} (${p.employee.code})` : "—"}
                        </td>
                        <td className="td">{inrLakh(p.gross)}</td>
                        <td className="td">{inrLakh(p.basic)}</td>
                        <td className="td">{inrLakh(p.pfEmployee + p.pfEmployer)}</td>
                        <td className="td">{inrLakh(p.esiEmployee + p.esiEmployer)}</td>
                        <td className="td">{inrLakh(p.pt)}</td>
                        <td className="td">{inrLakh(p.tds)}</td>
                        <td className="td">{inrLakh(p.lossOfPay)}</td>
                        <td className="td font-medium">{moneyOrMasked(p.netPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
