'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import {
  ModuleAlert,
  ModuleButton,
  ModuleList,
  ModuleListItem,
  ModulePage,
  ModuleSection,
  ModuleTextarea,
} from '@/components/layout/ModulePage';

type Note = {
  id: string;
  content: string;
  createdAt: string;
  author?: { firstName: string; lastName: string };
  lead?: { title: string };
  deal?: { title: string };
  customer?: { name: string };
};

export default function CrmNotesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Note[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  function load() {
    api<Note[]>('/crm/notes').then(setItems).catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    load();
  }, [router]);

  async function create() {
    if (!content.trim()) return;
    try {
      await api('/crm/notes', { method: 'POST', body: JSON.stringify({ content }) });
      setContent('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <ModulePage title="Notes" subtitle="Activity notes linked to leads, deals, and customers">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <ModuleSection>
        <ModuleTextarea rows={4} placeholder="Write a note…" value={content} onChange={(e) => setContent(e.target.value)} />
        <ModuleButton type="button" onClick={create}>
          Save note
        </ModuleButton>
      </ModuleSection>

      <ModuleList>
        {items.map((n) => (
          <ModuleListItem key={n.id}>
            <p className="whitespace-pre-wrap">{n.content}</p>
            <p className="text-xs text-ink/50 mt-2">
              {n.author ? `${n.author.firstName} ${n.author.lastName}` : 'System'} · {new Date(n.createdAt).toLocaleString()}
              {n.lead ? ` · Lead: ${n.lead.title}` : ''}
              {n.deal ? ` · Deal: ${n.deal.title}` : ''}
              {n.customer ? ` · Customer: ${n.customer.name}` : ''}
            </p>
          </ModuleListItem>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No notes yet</li>
        )}
      </ModuleList>
    </ModulePage>
  );
}
