import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiEnabled, aiProviderLabel } from "@/lib/ai";
import { unreadCount } from "@/lib/notify";
import { allowedNav } from "@/lib/rbac-nav";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    // Unified HRMS login — bounce to in-repo SSO bridge (never C:\CRM, never a second product login).
    const hrms = (process.env.HRMS_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
    redirect(`${hrms}/sso/orbit?next=${encodeURIComponent('/orbit/dashboard')}`);
  }
  const s = session!;
  const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
  const unread = await unreadCount(s.tenantId, s.userId).catch(() => 0);
  const nav = await allowedNav(s);

  return (
    <div className="flex min-h-screen">
      <Sidebar nav={nav} />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between pl-16 pr-4 md:px-6 sticky top-0 z-10">
          <div className="text-sm text-slate-500">
            {tenant?.name} <span className="text-slate-300">·</span>{" "}
            <span className="text-xs">{tenant?.gstin}</span>
          </div>
          <div className="flex items-center gap-3">
            <form action="/search" className="hidden md:block">
              <input
                name="q"
                placeholder="Search everything…  (leads, invoices, people)"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-brand-100"
              />
            </form>
            <span
              className={`badge ${aiEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
              title={aiEnabled ? `Live: ${aiProviderLabel}` : "Local heuristic fallback — add a free LLM in .env to go live"}
            >
              ✨ AI {aiEnabled ? aiProviderLabel : "Local"}
            </span>
            <Link href="/notifications" className="relative text-lg" title="Notifications">
              🔔
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
            <Link href="/settings" className="text-lg" title="Settings">⚙️</Link>
            <div className="text-sm text-right">
              <div className="font-medium text-slate-800">{s.name}</div>
              <div className="text-xs text-slate-400">{s.isCeo ? "CEO" : "Member"}</div>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="btn-ghost text-xs py-1.5">Sign out</button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6 max-w-[1400px] w-full">{children}</main>
      </div>
    </div>
  );
}
