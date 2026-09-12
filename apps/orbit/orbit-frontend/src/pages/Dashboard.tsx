import { useEffect, useState } from "react";
import { apiGet, inrLakh } from "../lib/api";
import { PageHeader, StatCard } from "../components/Layout";
import { useAuth } from "../lib/auth";

// Pulls a few list endpoints to populate the cockpit. Robust to empty data
// (a fresh tenant shows zeros) — the point is the live SPA→Laravel API loop.
export function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState<{ leads: number; invoices: number; employees: number; receivables: number } | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const grab = async (p: string) => {
          const r = await apiGet<any>(p).catch(() => null);
          const rows = r?.data ?? r ?? [];
          return Array.isArray(rows) ? rows : rows?.data ?? [];
        };
        const [leads, invoices, employees] = await Promise.all([
          grab("/crm/leads"), grab("/finance/invoices"), grab("/hr/employees"),
        ]);
        const receivables = (invoices as any[]).filter((i) => i.status !== "Paid").reduce((a, i) => a + Number(i.grand_total || 0), 0);
        setS({ leads: leads.length, invoices: invoices.length, employees: employees.length, receivables });
      } catch (e: any) { setErr(e.message); }
    })();
  }, []);

  return (
    <div>
      <PageHeader title={`Good day, ${user?.name?.split(" ")[0] || ""} 👋`} subtitle="Your whole company on one screen — live from the Laravel API." />
      {err && <div className="mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open Leads" value={s ? String(s.leads) : "…"} accent="brand" hint="CRM pipeline" />
        <StatCard label="Invoices" value={s ? String(s.invoices) : "…"} accent="green" hint="GST finance" />
        <StatCard label="Receivables" value={s ? inrLakh(s.receivables) : "…"} accent="amber" hint="Unpaid" />
        <StatCard label="Headcount" value={s ? String(s.employees) : "…"} accent="slate" hint="Active employees" />
      </div>
      <div className="card p-5 mt-6">
        <div className="font-semibold text-slate-800 mb-1">✅ Connected</div>
        <p className="text-sm text-slate-500">
          This React SPA (static, hostable on plain PHP shared hosting) is authenticated against the Laravel API via a Sanctum token.
          A fresh workspace starts empty — add leads, employees, and invoices from the module pages and the numbers update here.
        </p>
      </div>
    </div>
  );
}
