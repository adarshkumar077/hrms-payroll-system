'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isAdmin } from '@/lib/roles';
import { StickySaveButton } from '@/components/ui/StickySaveButton';

type Holiday = {
  id: string;
  name: string;
  date: string;
  type: string;
  scope: string;
  isOptional: boolean;
  isPaid: boolean;
  systemTag?: string | null;
};

const HOLIDAY_TYPES = [
  { value: 'FESTIVAL', label: 'Festival Holiday' },
  { value: 'OFFICE', label: 'Office Holiday' },
  { value: 'NATIONAL', label: 'National Holiday' },
  { value: 'COMPANY', label: 'Company Holiday' },
  { value: 'OPTIONAL', label: 'Optional Holiday' },
];

function typeLabel(t: string) {
  return HOLIDAY_TYPES.find((x) => x.value === t)?.label ?? t;
}

export default function HolidaysPage() {
  const router = useRouter();
  const [items, setItems] = useState<Holiday[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState({
    name: '',
    date: '',
    type: 'FESTIVAL',
    scope: 'ALL',
    isPaid: true,
    lastSaturdayOverride: false,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    date: '',
    type: '',
    scope: '',
    isPaid: true,
    lastSaturdayOverride: false,
  });

  function load(y = year) {
    api<Holiday[]>(`/holidays?year=${y}`)
      .then(setItems)
      .catch(async () => {
        try {
          const cal = await api<{ holidays: Holiday[] }>(`/me/holidays?year=${y}`);
          setItems(cal.holidays);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed');
        }
      });
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setCanManage(isAdmin(u));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function create(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim() || !form.date) {
      setError('Holiday name and date are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api('/holidays', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          date: form.date,
          type: form.type,
          scope: form.scope,
          isPaid: form.isPaid,
          lastSaturdayOverride: form.lastSaturdayOverride,
        }),
      });
      setForm({
        name: '',
        date: '',
        type: 'FESTIVAL',
        scope: 'ALL',
        isPaid: true,
        lastSaturdayOverride: false,
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this holiday?')) return;
    try {
      await api(`/holidays/${id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function startEdit(h: Holiday) {
    setEditingId(h.id);
    setEditForm({
      name: h.name,
      date: h.date.slice(0, 10),
      type: h.type,
      scope: h.scope,
      isPaid: h.isPaid,
      lastSaturdayOverride: h.systemTag === 'LAST_SATURDAY_OVERRIDE',
    });
  }

  async function saveEdit(id: string) {
    try {
      await api(`/holidays/${id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm),
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  const monthGroups = items.reduce<Record<string, Holiday[]>>((acc, h) => {
    const d = new Date(h.date);
    const key = d.toLocaleString('default', { month: 'long' });
    (acc[key] ??= []).push(h);
    return acc;
  }, {});

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {canManage && <StickySaveButton saving={saving} onClick={() => void create()} label="Save" />}
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">
        {canManage ? 'Holiday Manager' : 'Holiday Calendar'}
      </h1>
      <p className="text-sm text-ink/60 mt-1 mb-4">
        Sundays and the last Saturday of each month are automatic paid weekly offs. Add festival or
        office holidays in advance — they appear on every employee attendance sheet.
      </p>
      <div className="flex gap-2 my-4 items-center">
        <input
          type="number"
          className="w-28 rounded border border-mist px-2 py-1"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
        <button type="button" onClick={() => load()} className="text-sm bg-brand-600 text-white px-3 py-1 rounded">
          Load
        </button>
        <span className="text-sm text-ink/50 ml-auto">{items.length} holidays</span>
      </div>
      {error && <p className="text-red-700 text-sm mb-2">{error}</p>}

      {canManage && (
        <form onSubmit={create} className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 space-y-2">
          <input
            className="w-full rounded border border-mist px-3 py-2 text-sm"
            placeholder="Holiday name (e.g. Diwali)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            type="date"
            className="w-full rounded border border-mist px-3 py-2 text-sm"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="rounded border border-mist px-2 py-2 text-sm"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {HOLIDAY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm px-2">
              <input
                type="checkbox"
                checked={form.isPaid}
                onChange={(e) => setForm({ ...form, isPaid: e.target.checked })}
              />
              Paid
            </label>
            <label className="flex items-center gap-2 text-sm px-2">
              <input
                type="checkbox"
                checked={form.lastSaturdayOverride}
                onChange={(e) => setForm({ ...form, lastSaturdayOverride: e.target.checked })}
              />
              Override last Saturday WO for this month
            </label>
            <button type="submit" className="bg-brand-600 text-white px-4 py-2 rounded text-sm ml-auto">
              Add Holiday
            </button>
          </div>
        </form>
      )}

      {Object.keys(monthGroups).length > 0 ? (
        Object.entries(monthGroups).map(([month, holidays]) => (
          <div key={month} className="mb-4">
            <h3 className="text-sm font-medium text-brand-700 mb-1">{month}</h3>
            <ul className="bg-white/80 border border-brand-100 rounded-lg divide-y divide-mist">
              {holidays.map((h) => (
                <li key={h.id} className="p-3 text-sm">
                  {editingId === h.id ? (
                    <div className="space-y-2">
                      <input
                        className="w-full rounded border border-mist px-2 py-1 text-sm"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                      <input
                        type="date"
                        className="w-full rounded border border-mist px-2 py-1 text-sm"
                        value={editForm.date}
                        onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-2 items-center">
                        <select
                          className="rounded border border-mist px-2 py-1 text-sm"
                          value={editForm.type}
                          onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                        >
                          {HOLIDAY_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={editForm.isPaid}
                            onChange={(e) => setEditForm({ ...editForm, isPaid: e.target.checked })}
                          />
                          Paid
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={editForm.lastSaturdayOverride}
                            onChange={(e) =>
                              setEditForm({ ...editForm, lastSaturdayOverride: e.target.checked })
                            }
                          />
                          Last Sat override
                        </label>
                        <button
                          type="button"
                          className="bg-brand-600 text-white px-3 py-1 rounded text-xs"
                          onClick={() => saveEdit(h.id)}
                        >
                          Save
                        </button>
                        <button type="button" className="text-ink/50 text-xs" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{h.name}</p>
                        <p className="text-ink/60">
                          {new Date(h.date).toLocaleDateString()} · {typeLabel(h.type)}
                          {h.isPaid ? ' · Paid' : ' · Unpaid'}
                          {h.systemTag === 'LAST_SATURDAY_OVERRIDE' ? ' · Last Saturday override' : ''}
                        </p>
                      </div>
                      {canManage && (
                        <div className="flex gap-2 items-start shrink-0">
                          <button type="button" className="text-brand-600 text-xs underline" onClick={() => startEdit(h)}>
                            Edit
                          </button>
                          <button type="button" className="text-red-700 text-xs" onClick={() => remove(h.id)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <div className="bg-white/80 border border-brand-100 rounded-lg p-4 text-ink/50 text-sm">
          No holidays for this year — Sundays and last Saturdays still apply automatically.
        </div>
      )}
    </main>
  );
}
