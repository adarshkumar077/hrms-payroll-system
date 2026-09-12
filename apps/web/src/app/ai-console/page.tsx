'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getStoredUser } from '@/lib/api';
import { isSuperAdmin } from '@/lib/roles';
import { ModuleAlert, ModuleButton, ModuleInput, ModulePage, ModuleSection, ModuleTextarea } from '@/components/layout/ModulePage';

type Prompt = { id: string; category: string; title: string; body: string; isActive: boolean };
type Log = { id: string; status: string; latencyMs: number; model: string | null; createdAt: string; errorMessage?: string | null };
type Usage = { day: string; requests: number; errorCount: number; avgLatencyMs: number };

export default function AiConsolePage() {
  const router = useRouter();
  const [data, setData] = useState<{
    model: string;
    systemPrompt: string;
    totals: { requests: number; errors: number; avgLatencyMs: number };
    logs: Log[];
    usage: Usage[];
    prompts: Prompt[];
  } | null>(null);
  const [model, setModel] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('HR');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const superAdmin = isSuperAdmin(getStoredUser());

  function load() {
    api<NonNullable<typeof data>>('/ai/console')
      .then((d) => {
        setData(d);
        setModel(d.model);
        setSystemPrompt(d.systemPrompt);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }

  useEffect(() => {
    const u = getStoredUser();
    if (!u) { router.replace('/'); return; }
    if (!u.roles.some((r) => ['SUPER_ADMIN', 'ADMIN'].includes(r))) { router.replace('/dashboard'); return; }
    load();
  }, [router]);

  return (
    <ModulePage title="AI Console" subtitle="Prompt library, usage, logs, and model settings for EITF Intelligence">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}
      {msg && <ModuleAlert type="success">{msg}</ModuleAlert>}
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <ModuleSection><p className="text-xs text-ink-400">Requests</p><p className="text-2xl font-display">{data?.totals.requests ?? 0}</p></ModuleSection>
        <ModuleSection><p className="text-xs text-ink-400">Errors</p><p className="text-2xl font-display">{data?.totals.errors ?? 0}</p></ModuleSection>
        <ModuleSection><p className="text-xs text-ink-400">Avg response</p><p className="text-2xl font-display">{data?.totals.avgLatencyMs ?? 0} ms</p></ModuleSection>
      </div>
      <ModuleSection>
        <p className="font-medium">Model & system prompt</p>
        <ModuleInput value={model} onChange={(e) => setModel(e.target.value)} disabled={!superAdmin} />
        <ModuleTextarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} disabled={!superAdmin} rows={4} />
        {superAdmin && (
          <ModuleButton type="button" onClick={async () => {
            await api('/ai/settings', { method: 'PUT', body: JSON.stringify({ model, systemPrompt }) });
            setMsg('AI settings saved');
            load();
          }}>Save settings</ModuleButton>
        )}
      </ModuleSection>
      <ModuleSection>
        <p className="font-medium">Prompt library</p>
        {superAdmin && (
          <div className="grid md:grid-cols-3 gap-2 mb-3">
            <ModuleInput placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
            <ModuleInput placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <ModuleInput placeholder="Body" value={body} onChange={(e) => setBody(e.target.value)} />
            <ModuleButton type="button" onClick={async () => {
              await api('/ai/prompts', { method: 'POST', body: JSON.stringify({ category, title, body }) });
              setTitle(''); setBody(''); load();
            }}>Add prompt</ModuleButton>
          </div>
        )}
        <ul className="text-sm space-y-2">
          {data?.prompts.map((p) => (
            <li key={p.id} className="border border-ink-100 rounded-lg p-2">
              <strong>{p.category}</strong> · {p.title}
              <p className="text-ink-500 text-xs">{p.body}</p>
            </li>
          ))}
        </ul>
      </ModuleSection>
      <ModuleSection>
        <p className="font-medium">Token / usage (daily)</p>
        <ul className="text-xs space-y-1">
          {(data?.usage ?? []).map((u) => (
            <li key={u.day}>{new Date(u.day).toLocaleDateString()} · {u.requests} req · {u.errorCount} err · {u.avgLatencyMs} ms</li>
          ))}
        </ul>
      </ModuleSection>
      <ModuleSection>
        <p className="font-medium">Error monitoring</p>
        <ul className="text-xs space-y-1 max-h-56 overflow-y-auto">
          {(data?.logs ?? []).map((l) => (
            <li key={l.id}>{new Date(l.createdAt).toLocaleString()} · {l.status} · {l.latencyMs}ms {l.errorMessage ?? ''}</li>
          ))}
        </ul>
      </ModuleSection>
    </ModulePage>
  );
}
