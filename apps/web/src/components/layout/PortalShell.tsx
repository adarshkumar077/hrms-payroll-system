'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getStoredUser, SessionUser } from '@/lib/api';
import { canAccessPath } from '@/lib/navigation';
import { isAdmin, isCeo, isEmployeeUser, ViewMode } from '@/lib/roles';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { AiChatWidget } from '@/components/AiChatWidget';

const PUBLIC_PATHS = ['/'];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('employee');

  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    const u = getStoredUser();
    if (!isPublic && !u) {
      router.replace('/');
      return;
    }
    setUser(u);
    if (u && isCeo(u)) setViewMode('admin');
    else if (u && isAdmin(u)) setViewMode('admin');
    else if (u) setViewMode('employee');

    if (u?.forcePasswordChange && !isPublic && pathname !== '/account/password') {
      setReady(true);
      router.replace('/account/password?required=true');
      return;
    }

    if (u && !isPublic && !canAccessPath(u, pathname)) {
      router.replace('/dashboard');
      return;
    }
    setReady(true);
  }, [isPublic, router, pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (isPublic) return <>{children}</>;
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
          <p className="text-sm text-ink-400">Loading…</p>
        </div>
      </div>
    );
  }
  if (!user) return <>{children}</>;

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <Sidebar
        user={user}
        viewMode={viewMode}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        <TopNav
          user={user}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onToggleSidebar={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          collapsed={collapsed}
        />
        <div className="portal-content flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">
          {children}
        </div>
      </div>
      {isEmployeeUser(user) && <AiChatWidget />}
    </div>
  );
}
