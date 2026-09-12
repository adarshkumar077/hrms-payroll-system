'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { StickySaveButton } from '@/components/ui/StickySaveButton';

type Holiday = {
  id: string;
  name: string;
  date: string;
  type: string;
  scope: string;
  isOptional: boolean;
  isPaid: boolean;
};

export default function HolidaysPage() {
  const router = useRouter();
  const [items, setItems] = useState<Holiday[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState({
    name: '',
    date: '',
    type: 'COMPANY',
    scope: 'ALL',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [isHr, setIsHr] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', date: '', type: '', scope: '' });

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
    setIsHr(u.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r)));
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
      await api('/holidays', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', date: '', type: 'COMPANY', scope: 'ALL' });
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
      {isHr && <StickySaveButton saving={saving} onClick={() => void create()} label="Save" />}
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">
        {isHr ? 'Holiday Manager' : 'Holiday Calendar'}
      </h1>
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

      {isHr && (
        <form onSubmit={create} className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 space-y-2">
          <input
            className="w-full rounded border border-mist px-3 py-2 text-sm"
            placeholder="Holiday name"
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
          <div className="flex gap-2">
            <select
              className="rounded border border-mist px-2 py-2 text-sm"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {['NATIONAL', 'FESTIVAL', 'OPTIONAL', 'COMPANY'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <select
              className="rounded border border-mist px-2 py-2 text-sm"
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
            >
              {['ALL', 'DEPARTMENT', 'EMPLOYEES'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <button type="submit" className="bg-brand-600 text-white px-4 py-2 rounded text-sm">
              Add
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
                      <div className="flex gap-2">
                        <select
                          className="rounded border border-mist px-2 py-1 text-sm"
                          value={editForm.type}
                          onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                        >
                          {['NATIONAL', 'FESTIVAL', 'OPTIONAL', 'COMPANY'].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        <select
                          className="rounded border border-mist px-2 py-1 text-sm"
                          value={editForm.scope}
                          onChange={(e) => setEditForm({ ...editForm, scope: e.target.value })}
                        >
                          {['ALL', 'DEPARTMENT', 'EMPLOYEES'].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                        <button type="button" className="bg-brand-600 text-white px-3 py-1 rounded text-xs" onClick={() => saveEdit(h.id)}>
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
                          {new Date(h.date).toLocaleDateString()} · {h.type} · {h.scope}
                          {h.isOptional ? ' · optional' : ''}
                          {h.isPaid ? '' : ' · unpaid'}
                        </p>
                      </div>
                      {isHr && (
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
          No holidays for this year
        </div>
      )}
    </main>
  );
}
