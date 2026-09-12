'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isAdmin } from '@/lib/roles';
import {
  ModuleAlert,
  ModuleButton,
  ModuleInput,
  ModuleList,
  ModuleListItem,
  ModulePage,
  ModuleSecondaryButton,
  ModuleSection,
  ModuleSelect,
  ModuleTextarea,
  StatusPill,
} from '@/components/layout/ModulePage';

type Employee = { id: string; employeeCode: string; firstName: string; lastName: string };

type Task = {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  dueAt?: string | null;
  assignedTo?: { employeeCode: string; firstName: string; lastName: string };
  assignedBy?: { employeeCode: string; firstName: string; lastName: string };
  comments?: { id: string; content: string; createdAt: string }[];
};

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'REOPENED'] as const;

export default function CrmTasksPage() {
  const router = useRouter();
  const [items, setItems] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isMgr, setIsMgr] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [comment, setComment] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  function load() {
    api<Task[]>('/crm/tasks')
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/');
      return;
    }
    setIsMgr(isAdmin(u));
    load();
    if (isAdmin(u)) {
      api<Employee[]>('/employees')
        .then(setEmployees)
        .catch(() => setEmployees([]));
    }
  }, [router]);

  async function create() {
    if (!title.trim() || !assigneeId) return;
    await api('/crm/tasks', {
      method: 'POST',
      body: JSON.stringify({ title, description, dueAt: dueAt || undefined, assignedToEmployeeId: assigneeId }),
    });
    setTitle('');
    setDescription('');
    setDueAt('');
    load();
  }

  async function updateStatus(id: string, status: string) {
    await api(`/crm/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }

  async function verify(id: string) {
    await api(`/crm/tasks/${id}/verify`, { method: 'POST', body: '{}' });
    load();
  }

  async function addComment(taskId: string) {
    const content = comment[taskId]?.trim();
    if (!content) return;
    await api(`/crm/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
    setComment((c) => ({ ...c, [taskId]: '' }));
    load();
  }

  return (
    <ModulePage title="Tasks" subtitle="Assign, track, and verify CRM work items">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}

      {isMgr && (
        <ModuleSection>
          <p className="font-medium text-ink/80">Assign task</p>
          <ModuleInput placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <ModuleTextarea rows={2} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid gap-2 md:grid-cols-2">
            <ModuleInput type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            <ModuleSelect value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Assign to…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employeeCode} · {e.firstName} {e.lastName}
                </option>
              ))}
            </ModuleSelect>
          </div>
          <ModuleButton type="button" onClick={create}>
            Create task
          </ModuleButton>
        </ModuleSection>
      )}

      <ModuleList>
        {items.map((t) => (
          <ModuleListItem key={t.id}>
            <div className="space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-medium">{t.title}</p>
                  {t.description && <p className="text-ink/60 text-xs">{t.description}</p>}
                  <p className="text-ink/50 text-xs">
                    {t.priority} · {t.dueAt ? new Date(t.dueAt).toLocaleString() : 'No due date'}
                    {t.assignedTo ? ` · To: ${t.assignedTo.firstName} ${t.assignedTo.lastName}` : ''}
                    {t.assignedBy ? ` · By: ${t.assignedBy.firstName}` : ''}
                  </p>
                </div>
                <StatusPill tone={t.status === 'VERIFIED' ? 'success' : 'neutral'}>{t.status}</StatusPill>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.filter((s) => s !== 'VERIFIED' || isMgr).map((s) => (
                  <ModuleSecondaryButton
                    key={s}
                    type="button"
                    className="text-xs"
                    onClick={() => updateStatus(t.id, s)}
                  >
                    {s.replace('_', ' ')}
                  </ModuleSecondaryButton>
                ))}
                {isMgr && t.status === 'COMPLETED' && (
                  <ModuleSecondaryButton type="button" className="text-xs" onClick={() => verify(t.id)}>
                    Verify
                  </ModuleSecondaryButton>
                )}
              </div>
              {t.comments && t.comments.length > 0 && (
                <ul className="text-xs text-ink/60 border-t border-mist pt-2 space-y-1">
                  {t.comments.map((c) => (
                    <li key={c.id}>
                      {c.content} · {new Date(c.createdAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <ModuleInput
                  className="text-xs"
                  placeholder="Add comment…"
                  value={comment[t.id] ?? ''}
                  onChange={(e) => setComment((m) => ({ ...m, [t.id]: e.target.value }))}
                />
                <ModuleSecondaryButton type="button" className="text-xs shrink-0" onClick={() => addComment(t.id)}>
                  Comment
                </ModuleSecondaryButton>
              </div>
            </div>
          </ModuleListItem>
        ))}
        {items.length === 0 && (
          <li className="text-ink/50 p-4 border border-dashed border-mist rounded-lg">No tasks</li>
        )}
      </ModuleList>
    </ModulePage>
  );
}
