'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';

type Notif = {
  id: string;
  title: string;
  body: string;
  category: string;
  status: string;
  readAt?: string | null;
  createdAt: string;
  sender?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
};

type Ann = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  createdBy?: { firstName?: string; lastName?: string } | null;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [anns, setAnns] = useState<Ann[]>([]);
  const [isHr, setIsHr] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function load() {
    api<Notif[]>('/notifications/mine')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    api<Ann[]>('/announcements')
      .then(setAnns)
      .catch(() => undefined);
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setIsHr(u.roles.some((r) => ['SUPER_ADMIN', 'HR'].includes(r)));
    load();
  }, [router]);

  async function announce() {
    try {
      await api('/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, body }),
      });
      setMessage('Announcement published');
      setTitle('');
      setBody('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function readAll() {
    try {
      await api('/notifications/read-all', { method: 'POST', body: '{}' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function wishes() {
    try {
      const r = await api<{ birthdays: number; anniversaries: number }>(
        '/notifications/wishes/run',
        { method: 'POST', body: '{}' },
      );
      setMessage(`Wishes: ${r.birthdays} birthdays, ${r.anniversaries} anniversaries`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  function formatDateTime(iso: string) {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString(),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  function senderName(sender?: { firstName?: string; lastName?: string; employeeCode?: string } | null): string {
    if (!sender) return 'System';
    const parts = [sender.firstName, sender.lastName].filter(Boolean).join(' ');
    return parts || sender.employeeCode || 'System';
  }

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-3xl text-brand-700 mt-2">Notifications</h1>
      {message && <p className="text-sm text-brand-700 mb-2">{message}</p>}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}

      {isHr && (
        <section className="bg-white/80 border border-brand-100 rounded-lg p-4 mb-6 text-sm space-y-2">
          <h2 className="font-display text-lg text-brand-700">New announcement</h2>
          <input className="border border-mist rounded px-2 py-2 w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <textarea className="border border-mist rounded px-2 py-2 w-full" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Body" />
          <div className="flex gap-3">
            <button type="button" onClick={announce} className="bg-brand-600 text-white px-4 py-2 rounded">
              Publish
            </button>
            <button type="button" onClick={wishes} className="text-sm underline text-brand-600">
              Run birthday/anniversary job
            </button>
          </div>
        </section>
      )}

      <div className="flex justify-between items-center mb-2">
        <h2 className="font-display text-lg text-brand-700">
          Inbox {unreadCount > 0 && <span className="text-xs bg-brand-600 text-white px-2 py-0.5 rounded-full ml-2">{unreadCount}</span>}
        </h2>
        <button type="button" onClick={readAll} className="text-xs underline text-brand-600">
          Mark all read
        </button>
      </div>
      <ul className="space-y-2 text-sm mb-8">
        {items.map((n) => {
          const dt = formatDateTime(n.createdAt);
          return (
            <li key={n.id} className={`border rounded-lg p-3 ${n.readAt ? 'bg-white/50 border-mist' : 'bg-white border-brand-100'}`}>
              <div className="flex justify-between items-start gap-2">
                <p className="font-medium">{n.title}</p>
                {!n.readAt && <span className="shrink-0 w-2 h-2 rounded-full bg-brand-600 mt-1.5" />}
              </div>
              <p className="text-ink/70 mt-1">{n.body}</p>
              <div className="flex flex-wrap gap-x-3 text-xs text-ink/40 mt-2">
                <span>{n.category}</span>
                <span>{dt.date}</span>
                <span>{dt.time}</span>
                <span>From: {senderName(n.sender)}</span>
              </div>
            </li>
          );
        })}
        {items.length === 0 && <li className="text-ink/50">No notifications</li>}
      </ul>

      <h2 className="font-display text-lg text-brand-700 mb-2">Announcements</h2>
      <ul className="space-y-2 text-sm">
        {anns.map((a) => {
          const dt = formatDateTime(a.publishedAt);
          return (
            <li key={a.id} className="bg-white/80 border border-brand-100 rounded-lg p-3">
              <p className="font-medium">{a.title}</p>
              <p className="text-ink/70 mt-1">{a.body}</p>
              <div className="flex flex-wrap gap-x-3 text-xs text-ink/40 mt-2">
                <span>{dt.date}</span>
                <span>{dt.time}</span>
                {a.createdBy && (
                  <span>
                    By: {[a.createdBy.firstName, a.createdBy.lastName].filter(Boolean).join(' ') || 'HR'}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {anns.length === 0 && <li className="text-ink/50">No announcements</li>}
      </ul>
    </main>
  );
}
