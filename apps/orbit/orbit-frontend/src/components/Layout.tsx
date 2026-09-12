import { NavLink, Outlet } from "react-router-dom";
import { useState } from "react";
import { NAV } from "../nav";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {!open && (
        <button onClick={() => setOpen(true)} className="md:hidden fixed top-3 left-3 z-40 w-9 h-9 rounded-lg border border-slate-200 bg-white shadow-sm">☰</button>
      )}
      {open && <div className="md:hidden fixed inset-0 z-40 bg-slate-900/40" onClick={() => setOpen(false)} />}
      <aside className={`w-60 shrink-0 border-r border-slate-200 bg-white h-screen overflow-y-auto fixed top-0 left-0 z-50 transition-transform md:sticky md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="px-5 py-4 flex items-center gap-2 border-b border-slate-100">
          <span className="text-2xl">🛰️</span>
          <div>
            <div className="font-bold text-brand-700 leading-tight">Orbit</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Business OS</div>
          </div>
        </div>
        <nav className="p-3 space-y-4">
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{g.group}</div>
              <div className="space-y-0.5">
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.to === "/"} onClick={() => setOpen(false)}
                    className={({ isActive }) => `flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${isActive ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}>
                    <span className="text-base">{it.icon}</span>{it.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between pl-16 pr-4 md:px-6 sticky top-0 z-10">
          <div className="text-sm text-slate-500">Orbit — Business OS</div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-right">
              <div className="font-medium text-slate-800">{user?.name}</div>
              <div className="text-xs text-slate-400">{user?.is_ceo ? "CEO" : "Member"}</div>
            </div>
            <button onClick={logout} className="btn-ghost text-xs py-1.5">Sign out</button>
          </div>
        </header>
        <main className="flex-1 p-6 max-w-[1400px] w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Small shared UI bits
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function StatCard({ label, value, hint, accent = "brand" }: { label: string; value: string; hint?: string; accent?: string }) {
  const c: Record<string, string> = { brand: "border-l-brand-600", green: "border-l-emerald-500", red: "border-l-rose-500", amber: "border-l-amber-500", slate: "border-l-slate-400", blue: "border-l-blue-500" };
  return (
    <div className={`card border-l-4 ${c[accent] || c.brand} p-4`}>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
