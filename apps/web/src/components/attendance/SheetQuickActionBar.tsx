'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { isSuperAdmin } from '@/lib/roles';
import { notifyAttendanceChanged } from '@/lib/attendance-sync';

export type HolidayListItem = {
  id: string;
  name: string;
  date: string;
  type: string;
  isPaid: boolean;
  dayStatus?: string | null;
  systemTag?: string | null;
  repeatYearly?: boolean;
  payment?: string;
  statusLabel?: string;
  createdByName?: string;
  createdAt?: string;
};

type Props = {
  year: number;
  month: number;
  onChanged: () => void;
};

const STATUS_OPTIONS = [
  { value: 'PH', label: 'Paid Holiday (PH)' },
  { value: 'WO', label: 'Weekly Off (WO)' },
  { value: 'FESTIVAL', label: 'Festival Holiday' },
  { value: 'OFFICE', label: 'Office Holiday' },
  { value: 'HD', label: 'Half Day (HD)' },
  { value: 'WORK', label: 'Working Day' },
];

function rowTone(h: HolidayListItem) {
  if (!h.isPaid) return 'bg-red-50 text-red-800';
  if (h.dayStatus === 'WO' || h.statusLabel?.includes('Weekly')) return 'bg-blue-50 text-blue-800';
  if (h.type === 'OFFICE') return 'bg-orange-50 text-orange-800';
  if (h.dayStatus === 'HD') return 'bg-amber-50 text-amber-900';
  return 'bg-emerald-50 text-emerald-800';
}

export function SheetQuickActionBar({ year, month, onChanged }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(
    `${year}-${String(month).padStart(2, '0')}-${String(Math.min(new Date().getDate(), 28)).padStart(2, '0')}`,
  );
  const [status, setStatus] = useState('FESTIVAL');
  const [title, setTitle] = useState('');
  const [payment, setPayment] = useState<'Paid' | 'Unpaid'>('Paid');
  const [repeat, setRepeat] = useState<'ONE_TIME' | 'YEARLY'>('ONE_TIME');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [items, setItems] = useState<HolidayListItem[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPaid, setFilterPaid] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [audit, setAudit] = useState<
    { id: string; userName: string; role: string; date: string; time: string; action: string }[]
  >([]);
  const [showAudit, setShowAudit] = useState(false);
  const canAudit = useMemo(() => isSuperAdmin(getStoredUser()), []);

  const loadList = useCallback(async () => {
    try {
      const q = new URLSearchParams({ year: String(year), month: String(month) });
      if (filterStatus) q.set('status', filterStatus);
      if (filterPaid) q.set('paid', filterPaid);
      if (filterQ.trim()) q.set('q', filterQ.trim());
      const rows = await api<HolidayListItem[]>(`/holidays?${q}`);
      setItems(rows);
    } catch {
      setItems([]);
    }
  }, [year, month, filterStatus, filterPaid, filterQ]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setDate((prev) => {
      const day = prev.slice(8, 10);
      return `${year}-${String(month).padStart(2, '0')}-${day}`;
    });
  }, [year, month]);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setStatus('FESTIVAL');
    setPayment('Paid');
    setRepeat('ONE_TIME');
    setDate(today.startsWith(`${year}-${String(month).padStart(2, '0')}`) ? today : date);
  }

  /** WO / Festival / Office / PH default Paid; HD/WORK keep current selection. */
  function onStatusChange(next: string) {
    setStatus(next);
    if (['WO', 'FESTIVAL', 'OFFICE', 'PH'].includes(next)) {
      setPayment('Paid');
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await api<{ message: string; holiday: HolidayListItem }>('/holidays/quick', {
        method: 'POST',
        body: JSON.stringify({
          id: editingId ?? undefined,
          date,
          status,
          title,
          payment,
          repeat,
        }),
      });
      setMessage(res.message || 'Attendance entry saved successfully.');
      notifyAttendanceChanged({ date, source: 'holiday-quick' });
      resetForm();
      await loadList();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(h: HolidayListItem) {
    setEditingId(h.id);
    setDate(String(h.date).slice(0, 10));
    setTitle(h.name);
    setPayment(h.isPaid ? 'Paid' : 'Unpaid');
    setRepeat(h.repeatYearly ? 'YEARLY' : 'ONE_TIME');
    if (h.dayStatus === 'WO') setStatus('WO');
    else if (h.dayStatus === 'HD') setStatus('HD');
    else if (h.dayStatus === 'WORK' || h.systemTag === 'WORKING_DAY') setStatus('WORK');
    else if (h.type === 'OFFICE') setStatus('OFFICE');
    else if (h.type === 'FESTIVAL') setStatus('FESTIVAL');
    else setStatus('PH');
    setMessage('');
    setError('');
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this attendance calendar entry?')) return;
    setError('');
    try {
      await api(`/holidays/${id}`, { method: 'DELETE' });
      setMessage('Attendance entry saved successfully.');
      notifyAttendanceChanged({ source: 'holiday-delete' });
      if (editingId === id) resetForm();
      await loadList();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function onImportFile(file: File) {
    setError('');
    setMessage('');
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) throw new Error('CSV needs a header and at least one row');
      const header = lines[0].toLowerCase();
      const rows = lines.slice(1).map((line) => {
        const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
        // Date, Title, Status, Payment [, Repeat]
        return {
          date: parts[0],
          title: parts[1],
          status: parts[2],
          payment: parts[3] || 'Paid',
          repeat: parts[4] || 'ONE_TIME',
        };
      });
      if (!header.includes('date')) {
        // still try first columns
      }
      const res = await api<{ message: string; imported: number; failed: number }>(
        '/holidays/import',
        { method: 'POST', body: JSON.stringify({ rows }) },
      );
      setMessage(
        `${res.message} Imported ${res.imported}${res.failed ? `, failed ${res.failed}` : ''}.`,
      );
      notifyAttendanceChanged({ source: 'holiday-import' });
      await loadList();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  }

  async function loadAudit() {
    try {
      const rows = await api<typeof audit>('/holidays/audit?limit=50');
      setAudit(rows);
      setShowAudit(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Audit load failed');
    }
  }

  return (
    <section className="mb-6 space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-display text-lg text-brand-700">Quick Attendance Action</h2>
          <p className="text-xs text-ink/50">
            Super Admin / Admin / HR only · updates sheet, payroll display &amp; holiday calendar
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-xs text-ink/60">
            Date
            <input
              type="date"
              className="rounded border border-mist px-3 py-2 text-sm"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/60">
            Status
            <select
              className="rounded border border-mist px-3 py-2 text-sm min-w-[180px]"
              value={status}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/60 flex-1 min-w-[180px]">
            Title (Holiday / Event)
            <input
              className="rounded border border-mist px-3 py-2 text-sm"
              placeholder="e.g. Gandhi Jayanti"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/60">
            Payment
            <select
              className="rounded border border-mist px-3 py-2 text-sm"
              value={payment}
              onChange={(e) => setPayment(e.target.value as 'Paid' | 'Unpaid')}
            >
              <option value="Paid">Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink/60">
            Repeat
            <select
              className="rounded border border-mist px-3 py-2 text-sm"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as 'ONE_TIME' | 'YEARLY')}
            >
              <option value="ONE_TIME">One Time</option>
              <option value="YEARLY">Repeat Every Year</option>
            </select>
          </label>
          <button
            type="button"
            disabled={saving || !title.trim() || !date}
            onClick={() => void save()}
            className="bg-brand-600 text-white px-4 py-2 rounded text-sm disabled:opacity-60"
          >
            {saving ? 'Saving…' : editingId ? 'Update Existing' : 'Save'}
          </button>
          {editingId && (
            <>
              <button
                type="button"
                onClick={() => void remove(editingId)}
                className="text-sm px-3 py-2 rounded border border-red-300 text-red-700"
              >
                Delete Entry
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="text-sm px-3 py-2 rounded border border-mist"
              >
                Cancel
              </button>
            </>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-3 items-center text-sm">
          <label className="text-xs text-ink/60">
            Bulk import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="block text-xs mt-1"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = '';
              }}
            />
          </label>
          <span className="text-[11px] text-ink/40">
            CSV columns: Date, Title, Status, Payment, Repeat
          </span>
          {canAudit && (
            <button type="button" className="text-brand-600 text-xs underline ml-auto" onClick={() => void loadAudit()}>
              View audit log
            </button>
          )}
        </div>

        {message && (
          <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 rounded px-3 py-2">{message}</p>
        )}
        {error && <p className="mt-3 text-sm text-red-700 bg-red-50 rounded px-3 py-2">{error}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex flex-wrap gap-2 items-end mb-3">
          <h3 className="font-medium text-brand-700 mr-auto">Holiday List</h3>
          <input
            className="rounded border border-mist px-2 py-1.5 text-sm"
            placeholder="Search title"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
          />
          <select
            className="rounded border border-mist px-2 py-1.5 text-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-mist px-2 py-1.5 text-sm"
            value={filterPaid}
            onChange={(e) => setFilterPaid(e.target.value)}
          >
            <option value="">Paid &amp; Unpaid</option>
            <option value="Paid">Paid</option>
            <option value="Unpaid">Unpaid</option>
          </select>
          <button
            type="button"
            className="text-sm px-3 py-1.5 rounded border border-brand-300"
            onClick={() => void loadList()}
          >
            Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Created By</th>
                <th className="px-3 py-2">Created Date</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((h) => (
                <tr key={h.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">{String(h.date).slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    {h.name}
                    {h.repeatYearly ? (
                      <span className="ml-1 text-[10px] text-ink/50">yearly</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded ${rowTone(h)}`}>
                      {h.statusLabel ?? h.dayStatus ?? h.type}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs font-medium ${
                        h.isPaid ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {h.isPaid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink/70">{h.createdByName ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-ink/70">
                    {h.createdAt ? String(h.createdAt).slice(0, 10) : '—'}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      className="text-brand-600 text-xs underline mr-2"
                      onClick={() => startEdit(h)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-700 text-xs"
                      onClick={() => void remove(h.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-ink/50">
                    No holiday entries for this filter. Sundays and last Saturdays still apply
                    automatically.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAudit && (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm p-4">
          <div className="flex justify-between mb-2">
            <h3 className="font-medium text-brand-700">Holiday Audit Log (Super Admin)</h3>
            <button type="button" className="text-xs text-ink/50" onClick={() => setShowAudit(false)}>
              Close
            </button>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="px-2 py-1">User</th>
                  <th className="px-2 py-1">Role</th>
                  <th className="px-2 py-1">Date</th>
                  <th className="px-2 py-1">Time</th>
                  <th className="px-2 py-1">Action</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id} className="border-t border-mist">
                    <td className="px-2 py-1">{a.userName}</td>
                    <td className="px-2 py-1">{a.role}</td>
                    <td className="px-2 py-1">{a.date}</td>
                    <td className="px-2 py-1">{a.time}</td>
                    <td className="px-2 py-1">{a.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
