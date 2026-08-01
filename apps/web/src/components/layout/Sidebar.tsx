'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { NavItem, getNavigation } from '@/lib/navigation';
import { SessionUser } from '@/lib/api';
import { ViewMode, formatRoleList } from '@/lib/roles';
import { NavIconSvg, ChevronIcon } from '@/components/ui/Icons';

type SidebarProps = {
  user: SessionUser;
  viewMode: ViewMode;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

function SidebarBrandLogo() {
  return (
    <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-white ring-1 ring-ink-200/60 shadow-sm dark:bg-ink-900 dark:ring-ink-700/50">
      <img
        src="/brand/bk-infotech-logo.png"
        alt="BkInfotech"
        width={36}
        height={36}
        className="w-[170%] max-w-none -ml-[17%] -mt-[4%] mix-blend-screen contrast-[1.04] dark:mix-blend-normal dark:brightness-110"
      />
    </div>
  );
}

function NavLink({
  item,
  collapsed,
  pathname,
  depth = 0,
}: {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = !!item.children?.length;
  const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href + '/') : false;
  const childActive = item.children?.some(
    (c) => c.href && (pathname === c.href || pathname.startsWith(c.href + '/')),
  );

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  if (hasChildren) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-full nav-item ${childActive ? 'text-brand-700 bg-brand-50/60' : ''}`}
          style={{ paddingLeft: collapsed ? undefined : `${12 + depth * 12}px` }}
        >
          <NavIconSvg name={item.icon} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left truncate">{item.label}</span>
              <ChevronIcon className="w-4 h-4" direction={open ? 'down' : 'right'} />
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="mt-1 space-y-0.5 animate-fade-in">
            {item.children!.map((child) => (
              <NavLink key={child.id} item={child} collapsed={collapsed} pathname={pathname} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!item.href) return null;

  return (
    <Link
      href={item.href}
      className={isActive ? 'nav-item-active' : 'nav-item'}
      style={{ paddingLeft: collapsed ? undefined : `${12 + depth * 12}px` }}
      title={collapsed ? item.label : undefined}
    >
      <NavIconSvg name={item.icon} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar({ user, viewMode, collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const pathname = usePathname();
  const groups = useMemo(() => getNavigation(user, viewMode), [user, viewMode]);

  const initials = (user.displayName || user.loginId || user.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-sm lg:hidden" onClick={onCloseMobile} />
      )}
      <aside
        className={`fixed top-0 left-0 z-50 h-full flex flex-col bg-white border-r border-ink-200/80 transition-all duration-300 ease-out shadow-elevated lg:shadow-none lg:static lg:z-auto ${
          collapsed ? 'w-[var(--sidebar-collapsed)]' : 'w-[var(--sidebar-width)]'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className={`flex items-center gap-3 px-4 h-[var(--topnav-height)] border-b border-ink-100 ${collapsed ? 'justify-center' : ''}`}>
          <SidebarBrandLogo />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="font-display font-bold text-ink-900 text-sm truncate">EITF</p>
              <p className="text-[11px] text-ink-400 truncate">Enhancing IT Infrastructure</p>
              <p className="text-[10px] text-ink-400/80 truncate">BkInfotech</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-6">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.id} item={item} collapsed={collapsed} pathname={pathname} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={`border-t border-ink-100 p-3 ${collapsed ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center gap-3 rounded-2xl bg-ink-50/80 p-2.5 ${collapsed ? 'p-2' : ''}`}>
            <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-800 truncate">{user.displayName}</p>
                <p className="text-[11px] text-ink-400 truncate">{formatRoleList(user.roles)}</p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
