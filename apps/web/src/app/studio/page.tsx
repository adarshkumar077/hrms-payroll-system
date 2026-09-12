'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isSuperAdmin } from '@/lib/roles';
import { ModuleAlert, ModuleButton, ModuleInput, ModulePage, ModuleSection } from '@/components/layout/ModulePage';

type Settings = {
  displayName: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  gst?: string | null;
  pan?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  loginLogoUrl?: string | null;
  emailLogoUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  darkModeEnabled: boolean;
  dashboardWidgets?: Record<string, boolean>;
};

export default function StudioPage() {
  const router = useRouter();
  const [s, setS] = useState<Settings | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const canWrite = isSuperAdmin(getStoredUser());

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace('/'); return; }
    if (!u.roles.some((r) => ['SUPER_ADMIN', 'ADMIN'].includes(r))) { router.replace('/dashboard'); return; }
    api<Settings>('/studio/settings').then(setS).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, [router]);

  function applyTheme(next: Settings) {
    const root = document.documentElement;
    root.style.setProperty('--brand', next.primaryColor);
    root.style.setProperty('--brand-light', next.secondaryColor);
    document.dispatchEvent(new CustomEvent('eitf-branding', { detail: next }));
  }

  async function save() {
    if (!s) return;
    const next = await api<Settings>('/studio/settings', { method: 'PUT', body: JSON.stringify(s) });
    setS(next);
    applyTheme(next);
    setMsg('Studio settings applied across EITF');
  }

  if (!s) {
    return <ModulePage title="Studio">{error ? <ModuleAlert type="error">{error}</ModuleAlert> : <p>Loading…</p>}</ModulePage>;
  }

  const field = (key: keyof Settings, label: string, type = 'text') => (
    <label className="block text-sm">
      {label}
      <ModuleInput
        type={type}
        disabled={!canWrite}
        value={(s[key] as string) ?? ''}
        onChange={(e) => setS({ ...s, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <ModulePage title="Studio" subtitle="No-code branding, theme, dashboard, and organization details for Enhance IT Infrastructure (EITF)">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}
      {msg && <ModuleAlert type="success">{msg}</ModuleAlert>}
      <p className="text-sm text-ink-500 mb-4">Single organization · no company selector · all settings belong to EITF.</p>
      <ModuleSection>
        <p className="font-medium">Organization</p>
        <div className="grid md:grid-cols-2 gap-3">
          {field('displayName', 'Company name')}
          {field('legalName', 'Legal name')}
          {field('address', 'Address')}
          {field('phone', 'Contact number')}
          {field('email', 'Email')}
          {field('website', 'Website')}
          {field('gst', 'GST')}
          {field('pan', 'PAN')}
        </div>
      </ModuleSection>
      <ModuleSection>
        <p className="font-medium">Branding</p>
        <div className="grid md:grid-cols-2 gap-3">
          {field('logoUrl', 'Company logo URL')}
          {field('faviconUrl', 'Favicon URL')}
          {field('loginLogoUrl', 'Login logo URL')}
          {field('emailLogoUrl', 'Email logo URL')}
        </div>
      </ModuleSection>
      <ModuleSection>
        <p className="font-medium">Theme</p>
        <div className="grid md:grid-cols-3 gap-3">
          {field('primaryColor', 'Primary', 'color')}
          {field('secondaryColor', 'Secondary', 'color')}
          {field('accentColor', 'Accent', 'color')}
        </div>
        <label className="flex items-center gap-2 text-sm mt-2">
          <input type="checkbox" checked={s.darkModeEnabled} disabled={!canWrite} onChange={(e) => setS({ ...s, darkModeEnabled: e.target.checked })} />
          Dark mode support
        </label>
      </ModuleSection>
      <ModuleSection>
        <p className="font-medium">Dashboard widgets</p>
        {Object.entries(s.dashboardWidgets ?? { employeeCount: true, leaveQueue: true, calendar: true, quickActions: true }).map(([k, v]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(v)}
              disabled={!canWrite}
              onChange={(e) => setS({ ...s, dashboardWidgets: { ...(s.dashboardWidgets ?? {}), [k]: e.target.checked } })}
            />
            {k}
          </label>
        ))}
      </ModuleSection>
      {canWrite && <ModuleButton type="button" onClick={save}>Save & apply</ModuleButton>}
    </ModulePage>
  );
}
