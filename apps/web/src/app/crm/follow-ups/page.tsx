'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import {
  ModuleAlert,
  ModuleButton,
  ModuleInput,
  ModuleList,
  ModuleListItem,
  ModulePage,
  ModuleSecondaryButton,
  ModuleSection,
  StatusPill,
} from '@/components/layout/ModulePage';

type FollowUp = {
  id: string;
  title: string;
  type: string;
  dueAt: string;
  completedAt?: string | null;
  notes?: string;
  owner?: { firstName: string; lastName: string };
};

export default function CrmFollowUpsPage() {
  const router = useRouter();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');

  function load() {
    api<FollowUp[]>('/crm/follow-ups')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    if (!getStoredUser()) {
      router.replace('/');
      return;
    }
    load();
  }, [router]);

  async function create() {
    if (!title.trim() || !dueAt) return;
    try {
      await api('/crm/follow-ups', {
        method: 'POST',
        body: JSON.stringify({ title, dueAt: new Date(dueAt).toISOString(), type: 'CALL' }),
      });
      setTitle('');
      setDueAt('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function complete(id: string) {
    await api(`/crm/follow-ups/${id}/complete`, { method: 'POST', body: '{}' });
    load();
  }

  return (
    <ModulePage title="Follow-ups" subtitle="Schedule calls, meetings, and reminders">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      <ModuleSection>
        <div className="grid gap-2 md:grid-cols-2">
          <ModuleInput placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <ModuleInput type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <ModuleButton type="button" onClick={create}>
          Schedule follow-up
        </ModuleButton>
      </ModuleSection>

      <ModuleList>
        {items.map((f) => (
          <ModuleListItem key={f.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{f.title}</p>
                <p className="text-ink/50">
                  {new Date(f.dueAt).toLocaleString()} · {f.type}
                  {f.owner ? ` · ${f.owner.firstName} ${f.owner.lastName}` : ''}
                </p>
              </div>
              {!f.completedAt ? (
                <ModuleSecondaryButton type="button" onClick={() => complete(f.id)}>
                  Mark done
                </ModuleSecondaryButton>
              ) : (
                <StatusPill tone="success">Completed</StatusPill>
              )}
            </div>
          </ModuleListItem>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No follow-ups scheduled</li>
        )}
      </ModuleList>
    </ModulePage>
  );
}
