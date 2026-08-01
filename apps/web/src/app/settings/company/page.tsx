'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { StickySaveButton } from '@/components/ui/StickySaveButton';

type Company = {
  id: string;
  name: string;
  legalName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  logoUrl?: string | null;
  gstin?: string | null;
  pan?: string | null;
  registrationNo?: string | null;
};

type Setting = {
  id: string;
  key: string;
  label: string | null;
  group: string;
  value: unknown;
};

type Policy = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  content: string | null;
  isEnabled: boolean;
};

const PROFILE_VISIBILITY_FIELDS: { key: string; label: string }[] = [
  { key: 'logo', label: 'Company Logo' },
  { key: 'name', label: 'Company Name' },
  { key: 'email', label: 'Company Email' },
  { key: 'phone', label: 'Contact Numbers' },
  { key: 'website', label: 'Website' },
  { key: 'gstin', label: 'GST Number' },
  { key: 'pan', label: 'PAN Number' },
  { key: 'cin', label: 'CIN Number' },
  { key: 'registrationNo', label: 'Registration Number' },
  { key: 'address', label: 'Address' },
  { key: 'branches', label: 'Branches' },
  { key: 'description', label: 'Company Description' },
  { key: 'industry', label: 'Industry' },
  { key: 'companyType', label: 'Company Type' },
  { key: 'foundedDate', label: 'Founded Date' },
  { key: 'socialLinks', label: 'Social Links' },
  { key: 'bankDetails', label: 'Bank Details' },
  { key: 'upi', label: 'UPI' },
];

export default function CompanySettingsPage() {
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [draftSettings, setDraftSettings] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    if (!u.roles.some((r) => r === 'CEO' || r === 'HR')) {
      router.replace('/dashboard');
      return;
    }
    Promise.all([
      api<Company>('/company'),
      api<Setting[]>('/company/settings'),
      api<Policy[]>('/company/policies'),
    ])
      .then(([c, s, p]) => {
        setCompany(c);
        setSettings(s);
        setPolicies(p);
        const draft: Record<string, string> = {};
        for (const row of s) {
          draft[row.key] =
            typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
        }
        setDraftSettings(draft);
        const visRaw = s.find((x) => x.key === 'company.field_visibility')?.value;
        const vis =
          visRaw && typeof visRaw === 'object' && !Array.isArray(visRaw)
            ? (visRaw as Record<string, boolean>)
            : {};
        const next: Record<string, boolean> = {};
        for (const f of PROFILE_VISIBILITY_FIELDS) {
          next[f.key] = vis[f.key] === undefined ? true : Boolean(vis[f.key]);
        }
        setVisibility(next);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [router]);

  const grouped = useMemo(() => {
    const map = new Map<string, Setting[]>();
    for (const s of settings) {
      if (s.key === 'company.field_visibility') continue;
      const list = map.get(s.group) ?? [];
      list.push(s);
      map.set(s.group, list);
    }
    return [...map.entries()];
  }, [settings]);

  async function saveCompany(e?: React.FormEvent) {
    e?.preventDefault();
    if (!company) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const updated = await api<Company>('/company', {
        method: 'PUT',
        body: JSON.stringify({
          name: company.name,
          legalName: company.legalName,
          email: company.email,
          phone: company.phone,
          website: company.website,
          addressLine1: company.addressLine1,
          addressLine2: company.addressLine2,
          city: company.city,
          state: company.state,
          country: company.country,
          pincode: company.pincode,
          logoUrl: company.logoUrl,
          gstin: company.gstin,
          pan: company.pan,
          registrationNo: company.registrationNo,
        }),
      });
      setCompany(updated);
      setMessage('Company profile saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(draftSettings)) {
        try {
          payload[key] = JSON.parse(raw);
        } catch {
          payload[key] = raw;
        }
      }
      payload['company.field_visibility'] = visibility;
      const updated = await api<Setting[]>('/company/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: payload }),
      });
      setSettings(updated);
      setMessage('Settings saved. Enabled fields are visible to employees; disabled fields are hidden.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settings save failed');
    } finally {
      setSaving(false);
    }
  }

  async function togglePolicy(code: string, isEnabled: boolean) {
    try {
      const updated = await api<Policy>(`/company/policies/${code}`, {
        method: 'PUT',
        body: JSON.stringify({ isEnabled }),
      });
      setPolicies((prev) => prev.map((p) => (p.code === code ? updated : p)));
      setMessage(`Policy “${code}” ${isEnabled ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Policy update failed');
    }
  }

  if (!company) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-ink/60">{error || 'Loading…'}</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <StickySaveButton saving={saving} onClick={() => void saveCompany()} />
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="font-display text-3xl text-brand-700 mt-2">Company Profile</h1>
          <p className="text-sm text-ink/60 mt-1">
            Super Admin & HR can edit. Use visibility switches to control what employees can see.
          </p>
        </div>
      </div>

      {message && <p className="mb-4 text-sm text-brand-700 bg-mist px-3 py-2 rounded">{message}</p>}
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      <form onSubmit={saveCompany} className="space-y-4 bg-white/80 border border-brand-100 rounded-lg p-6 mb-10">
        <h2 className="font-display text-xl text-ink mb-2">Core company details</h2>
        {(
          [
            ['logoUrl', 'Company Logo URL'],
            ['name', 'Company name'],
            ['legalName', 'Legal name'],
            ['email', 'Company Email'],
            ['phone', 'Contact Numbers'],
            ['website', 'Website'],
            ['addressLine1', 'Address line 1'],
            ['addressLine2', 'Address line 2'],
            ['city', 'City'],
            ['state', 'State'],
            ['pincode', 'Pincode'],
            ['country', 'Country'],
            ['gstin', 'GST Number'],
            ['pan', 'PAN Number'],
            ['registrationNo', 'Registration Number'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-ink/70">{label}</span>
            <input
              className="mt-1 w-full rounded border border-mist px-3 py-2"
              value={(company[key] as string | null | undefined) ?? ''}
              onChange={(e) => setCompany({ ...company, [key]: e.target.value })}
            />
          </label>
        ))}
        <button type="submit" disabled={saving} className="bg-brand-600 text-white px-4 py-2 rounded disabled:opacity-60">
          Save company profile
        </button>
      </form>

      <section className="bg-white/80 border border-brand-100 rounded-lg p-6 mb-10">
        <h2 className="font-display text-xl text-ink mb-2">Employee visibility</h2>
        <p className="text-sm text-ink/60 mb-4">
          Enabled = visible to employees. Disabled = hidden from employees.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {PROFILE_VISIBILITY_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2.5 text-sm">
              <span className="text-ink-700">{f.label}</span>
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={visibility[f.key] ?? true}
                onChange={(e) => setVisibility((v) => ({ ...v, [f.key]: e.target.checked }))}
              />
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={saveSettings}
          disabled={saving}
          className="mt-4 bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
        >
          Save visibility & settings
        </button>
      </section>

      <section className="bg-white/80 border border-brand-100 rounded-lg p-6 mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-ink">Policies, payroll & attendance rules</h2>
          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
          >
            Save all settings
          </button>
        </div>
        {grouped.map(([group, rows]) => (
          <div key={group} className="mb-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-600 mb-2">{group}</h3>
            <div className="space-y-3">
              {rows.map((row) => (
                <label key={row.key} className="grid sm:grid-cols-[1fr_1fr] gap-2 text-sm items-center">
                  <span className="text-ink/80">
                    {row.label ?? row.key}
                    <span className="block text-xs text-ink/40 font-mono">{row.key}</span>
                  </span>
                  <input
                    className="rounded border border-mist px-3 py-2 font-mono text-xs"
                    value={draftSettings[row.key] ?? ''}
                    onChange={(e) => setDraftSettings((d) => ({ ...d, [row.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="bg-white/80 border border-brand-100 rounded-lg p-6">
        <h2 className="font-display text-xl text-ink mb-4">HR Policies</h2>
        <ul className="space-y-4">
          {policies.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-4 border-b border-mist pb-3">
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-sm text-ink/60">{p.description}</p>
              </div>
              <label className="flex items-center gap-2 text-sm shrink-0">
                <input type="checkbox" checked={p.isEnabled} onChange={(e) => togglePolicy(p.code, e.target.checked)} />
                Enabled
              </label>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
