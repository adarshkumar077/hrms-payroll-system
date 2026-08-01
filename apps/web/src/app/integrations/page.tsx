'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Cfg = {
  id: string;
  provider: string;
  isEnabled: boolean;
  configJson: Record<string, unknown>;
};

type Ev = { id: string; provider: string; eventType: string; status: string; createdAt: string };

export default function IntegrationsPage() {
  const router = useRouter();
  const [configs, setConfigs] = useState<Cfg[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [deviceName, setDeviceName] = useState('ESSL Main');
  const [deviceCode, setDeviceCode] = useState('ESSL-001');

  function load() {
    api<Cfg[]>('/integrations/configs')
      .then(setConfigs)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    api<Ev[]>('/integrations/events?limit=20')
      .then(setEvents)
      .catch(() => undefined);
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => ['CEO', 'HR', 'ADMIN'].includes(r))) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [router]);

  async function toggle(provider: string, isEnabled: boolean) {
    setError('');
    try {
      await api(`/integrations/configs/${provider}`, {
        method: 'PUT',
        body: JSON.stringify({ isEnabled }),
      });
      setMsg(`${provider} ${isEnabled ? 'enabled' : 'disabled'}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function syncCalendar() {
    try {
      const r = await api<{ synced: number }>('/integrations/google-calendar/sync', {
        method: 'POST',
        body: '{}',
      });
      setMsg(`Calendar stub synced ${r.synced} holidays`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    }
  }

  async function exportAccounting() {
    try {
      const r = await api<{ journal: unknown[] }>('/integrations/accounting/export');
      setMsg(`Accounting export stub: ${r.journal?.length ?? 0} journal lines`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  async function registerDevice() {
    try {
      await api('/integrations/biometric/devices', {
        method: 'POST',
        body: JSON.stringify({ name: deviceName, deviceCode }),
      });
      setMsg('Biometric device saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Device save failed');
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Integrations</h1>
      <p className="text-sm text-ink/60 mb-6">
        Email / SMS / WhatsApp / ESSL / Google Calendar / Accounting (gateway stubs)
      </p>
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
      {msg && <p className="text-sm text-brand-700 mb-2">{msg}</p>}

      <section className="space-y-2 mb-8">
        {configs.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-3 p-3 border border-brand-100 rounded-lg bg-white/80"
          >
            <div>
              <p className="font-medium text-brand-700">{c.provider}</p>
              <p className="text-xs text-ink/50">{c.isEnabled ? 'Enabled' : 'Disabled'}</p>
            </div>
            <button
              type="button"
              className="text-sm px-3 py-1.5 rounded border border-brand-300"
              onClick={() => toggle(c.provider, !c.isEnabled)}
            >
              {c.isEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
        ))}
      </section>

      <section className="flex flex-wrap gap-2 mb-8 text-sm">
        <button type="button" onClick={() => syncCalendar()} className="px-3 py-1.5 rounded bg-brand-600 text-white">
          Sync Google Calendar (holidays)
        </button>
        <button
          type="button"
          onClick={() => exportAccounting()}
          className="px-3 py-1.5 rounded border border-brand-300"
        >
          Export payroll → Accounting
        </button>
      </section>

      <section className="mb-8">
        <h2 className="font-display text-xl text-brand-700 mb-2">ESSL biometric device</h2>
        <div className="flex flex-wrap gap-2 text-sm mb-2">
          <input
            className="border border-brand-200 rounded px-2 py-1"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="border border-brand-200 rounded px-2 py-1"
            value={deviceCode}
            onChange={(e) => setDeviceCode(e.target.value)}
            placeholder="Device code"
          />
          <button type="button" onClick={() => registerDevice()} className="px-3 py-1.5 rounded bg-brand-600 text-white">
            Save device
          </button>
        </div>
        <p className="text-xs text-ink/50">
          Webhook: POST /api/v1/integrations/biometric/:companyId/webhook
        </p>
      </section>

      <section>
        <h2 className="font-display text-xl text-brand-700 mb-2">Recent events</h2>
        <ul className="text-xs space-y-1">
          {events.map((e) => (
            <li key={e.id} className="border-b border-brand-50 py-1">
              {new Date(e.createdAt).toLocaleString()} · {e.provider} · {e.eventType} · {e.status}
            </li>
          ))}
          {!events.length && <p className="text-ink/50">No events yet</p>}
        </ul>
      </section>
    </main>
  );
}
