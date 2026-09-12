'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getStoredUser, SessionUser, api } from '@/lib/api';
import { canAccessPath } from '@/lib/navigation';
import { isAdmin, ViewMode } from '@/lib/roles';
import { Sidebar } from './Sidebar';
import { TopNav } from './TopNav';
import { AiChatWidget } from '@/components/AiChatWidget';

const PUBLIC_PATHS = ['/'];
const VIEW_MODE_KEY = 'eitf-hrms-view-mode';

function readStoredViewMode(user: SessionUser): ViewMode {
  if (!isAdmin(user)) return 'employee';
  try {
    const stored = sessionStorage.getItem(`${VIEW_MODE_KEY}:${user.id}`);
    if (stored === 'admin' || stored === 'employee') return stored;
  } catch {
    /* ignore */
  }
  return 'admin';
}

function persistViewMode(user: SessionUser, mode: ViewMode) {
  try {
    sessionStorage.setItem(`${VIEW_MODE_KEY}:${user.id}`, mode);
  } catch {
    /* ignore */
  }
}

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
    if (!user) return;
    setViewMode(readStoredViewMode(user));
  }, [user?.id]);

  function onViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    if (user) persistViewMode(user, mode);
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) return;
    api<{
      primaryColor?: string;
      secondaryColor?: string;
      faviconUrl?: string | null;
      displayName?: string;
    }>('/studio/branding')
      .then((b) => {
        if (b.primaryColor) document.documentElement.style.setProperty('--brand', b.primaryColor);
        if (b.secondaryColor) document.documentElement.style.setProperty('--brand-light', b.secondaryColor);
        if (b.faviconUrl) {
          let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = b.faviconUrl;
        }
      })
      .catch(() => undefined);
  }, [user]);

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
          onViewModeChange={onViewModeChange}
          onToggleSidebar={() => setMobileOpen(true)}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          collapsed={collapsed}
        />
        <div className="portal-content flex-1 p-4 md:p-6 lg:p-8 animate-fade-in">
          {children}
        </div>
      </div>
      <AiChatWidget />
    </div>
  );
}
