"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavGroup } from "@/lib/nav";

export function Sidebar({ nav }: { nav: NavGroup[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="md:hidden fixed top-3 left-3 z-40 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white shadow-sm text-slate-600"
          aria-label="Open navigation"
          aria-expanded={open}
        >
          <span className="text-lg leading-none">☰</span>
        </button>
      )}

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-slate-900/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-60 shrink-0 border-r border-slate-200 bg-white h-screen overflow-y-auto fixed top-0 left-0 z-50 transition-transform duration-200 ease-in-out md:sticky md:translate-x-0 md:z-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-4 flex items-center justify-between gap-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛰️</span>
            <div>
              <div className="font-bold text-brand-700 leading-tight">Orbit</div>
              <div className="text-[10px] uppercase tracking-widest text-slate-400">Business OS</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="md:hidden text-slate-400 hover:text-slate-600 text-lg leading-none"
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>
        <nav className="p-3 space-y-4">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {g.group}
              </div>
              <div className="space-y-0.5">
                {g.items.map((it) => {
                  const active = path === it.href || (it.href !== "/dashboard" && path.startsWith(it.href));
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${
                        active ? "bg-brand-50 text-brand-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <span className="text-base">{it.icon}</span>
                      {it.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
