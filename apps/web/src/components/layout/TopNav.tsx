'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SessionUser, clearSession, api } from '@/lib/api';
import { getAllSearchableRoutes } from '@/lib/navigation';
import { isAdmin, isCeo, ViewMode, getPersonaLabel } from '@/lib/roles';
import { applyTheme, readStoredTheme, saveTheme, ThemeMode } from '@/lib/theme';
import { BellIcon, ChevronIcon, LogoutIcon, MenuIcon, MoonIcon, SearchIcon, SunIcon } from '@/components/ui/Icons';

type TopNavProps = {
  user: SessionUser;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onToggleSidebar: () => void;
  onToggleCollapse: () => void;
  collapsed: boolean;
};

export function TopNav({
  user,
  viewMode,
  onViewModeChange,
  onToggleSidebar,
  onToggleCollapse,
}: TopNavProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<
    { id: string; title: string; body?: string; createdAt?: string; readAt?: string | null }[]
  >([]);
  const [theme, setTheme] = useState<ThemeMode>('light');
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const routes = useMemo(() => getAllSearchableRoutes(user, viewMode), [user, viewMode]);
  const results = search.trim()
    ? routes.filter((r) => r.label.toLowerCase().includes(search.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    const mode = readStoredTheme(user.id);
    setTheme(mode);
    applyTheme(mode);
  }, [user.id]);

  useEffect(() => {
    api<{ id: string; title: string; body?: string; createdAt?: string; readAt?: string | null }[]>(
      '/notifications/mine',
    )
      .then((items) => setNotifications(items ?? []))
      .catch(() => setNotifications([]));
  }, [user.id]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      if (!key) return;
      if ((e.ctrlKey || e.metaKey) && key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      if (key === 'escape') {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function onToggleTheme() {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    saveTheme(next, user.id);
    setTheme(next);
  }

  const initials = (user.displayName || user.loginId || user.email || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const profileHref = isAdmin(user) ? '/settings/company' : '/me/profile';
  const profileLabel = isAdmin(user) ? 'Company Profile' : 'My Profile';
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <header className="sticky top-0 z-30 h-[var(--topnav-height)] bg-white/90 dark:bg-ink-900/90 backdrop-blur-xl border-b border-ink-200/80 dark:border-ink-700/80 flex items-center gap-4 px-4 lg:px-6">
      <button type="button" onClick={onToggleSidebar} className="btn-ghost p-2 lg:hidden" aria-label="Open menu">
        <MenuIcon />
      </button>
      <button type="button" onClick={onToggleCollapse} className="btn-ghost p-2 hidden lg:flex" aria-label="Toggle sidebar">
        <MenuIcon />
      </button>

      <div ref={searchRef} className="flex-1 max-w-xl relative">
        <div className="relative">
          <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search modules, reports, settings…"
            className="input pl-10 bg-ink-50/50 border-transparent focus:bg-white dark:focus:bg-ink-900"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
          />
        </div>
        {searchOpen && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-ink-900 rounded-2xl border border-ink-200 dark:border-ink-700 shadow-elevated overflow-hidden animate-slide-in z-50">
            {results.map((r) => (
              <Link
                key={r.id}
                href={r.href!}
                onClick={() => { setSearchOpen(false); setSearch(''); }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-brand-50/60 dark:hover:bg-ink-800 transition-colors text-sm"
              >
                <span className="font-medium text-ink-800 dark:text-ink-100">{r.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isAdmin(user) && !isCeo(user) && (
          <div className="hidden md:flex items-center rounded-xl border border-ink-200 dark:border-ink-700 overflow-hidden mr-1">
            <button
              type="button"
              onClick={() => onViewModeChange('admin')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'admin'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-ink-900 text-ink-500 dark:text-ink-300'
              }`}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('employee')}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                viewMode === 'employee'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white dark:bg-ink-900 text-ink-500 dark:text-ink-300'
              }`}
            >
              Employee
            </button>
          </div>
        )}
        <button type="button" className="btn-ghost p-2.5 relative hidden sm:flex" aria-label="Notifications" onClick={() => setNotifOpen(!notifOpen)}>
          <BellIcon />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2 h-2 bg-danger rounded-full ring-2 ring-white dark:ring-ink-900" />
          )}
        </button>

        <button
          type="button"
          className="btn-ghost p-2.5 hidden sm:flex"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2.5 rounded-xl pl-1 pr-2 py-1 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-xl bg-brand-600 text-white flex items-center justify-center text-xs font-bold">
              {initials}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-semibold text-ink-800 dark:text-ink-100 leading-tight">{user.displayName}</p>
              <p className="text-[11px] text-ink-400">{getPersonaLabel(user, viewMode)}</p>
            </div>
            <ChevronIcon className="w-4 h-4 text-ink-400 hidden md:block" />
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-ink-900 rounded-2xl border border-ink-200 dark:border-ink-700 shadow-elevated py-2 z-50 animate-slide-in">
                <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-800">
                  <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">{user.displayName}</p>
                  <p className="text-xs text-ink-400 truncate">{user.email ?? user.mobile}</p>
                </div>
                <Link href={profileHref} className="block px-4 py-2.5 text-sm text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800" onClick={() => setUserMenuOpen(false)}>
                  {profileLabel}
                </Link>
                <Link href="/account/password" className="block px-4 py-2.5 text-sm text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800" onClick={() => setUserMenuOpen(false)}>
                  Change password
                </Link>
                <button
                  type="button"
                  className="w-full text-left px-4 py-2.5 text-sm text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800 sm:hidden"
                  onClick={() => { onToggleTheme(); setUserMenuOpen(false); }}
                >
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <Link href="/notifications" className="block px-4 py-2.5 text-sm text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800" onClick={() => setUserMenuOpen(false)}>
                  Notifications
                </Link>
                <Link href="/help" className="block px-4 py-2.5 text-sm text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-800" onClick={() => setUserMenuOpen(false)}>
                  Help & Support
                </Link>
                <hr className="my-1 border-ink-100 dark:border-ink-800" />
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-danger-light/50"
                  onClick={() => { clearSession(); router.push('/'); }}
                >
                  <LogoutIcon className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <div className="absolute right-4 top-[calc(var(--topnav-height)+8px)] w-80 bg-white dark:bg-ink-900 rounded-2xl border border-ink-200 dark:border-ink-700 shadow-elevated z-50 animate-slide-in">
            <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
              <p className="font-semibold text-sm text-ink-800 dark:text-ink-100">Notifications</p>
              <Link href="/notifications" className="text-xs text-brand-600 hover:underline" onClick={() => setNotifOpen(false)}>View all</Link>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length ? (
                notifications.slice(0, 6).map((item) => (
                  <div key={item.id} className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 last:border-0">
                    <p className="text-sm font-medium text-ink-800 dark:text-ink-100">{item.title}</p>
                    {item.body && <p className="text-xs text-ink-500 mt-1 line-clamp-2">{item.body}</p>}
                    <p className="text-[11px] text-ink-400 mt-1">
                      {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                    </p>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-ink-400">No new notifications</div>
              )}
            </div>
          </div>
        </>
      )}
    </header>
  );
}
