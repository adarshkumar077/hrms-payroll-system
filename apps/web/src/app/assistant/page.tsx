'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, getStoredUser } from '@/lib/api';
import { ModuleAlert, ModuleButton, ModulePage, ModuleSecondaryButton, ModuleSection } from '@/components/layout/ModulePage';

type Msg = { id: string; role: string; content: string };
type Conv = { id: string; title: string; updatedAt: string };

export default function AssistantPage() {
  const [conversations, setConversations] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [suggested, setSuggested] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lastUser = useRef('');

  const loadHistory = useCallback(() => {
    api<Conv[]>('/ai/history').then(setConversations).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!getStoredUser()) return;
    loadHistory();
  }, [loadHistory]);

  async function openConv(id: string) {
    setActiveId(id);
    const conv = await api<{ messages: Msg[] }>(`/ai/history/${id}`);
    setMessages(conv.messages ?? []);
  }

  async function send(text?: string, regenerate = false) {
    const message = (text ?? input).trim();
    if (!message && !regenerate) return;
    const payload = regenerate ? lastUser.current : message;
    if (!payload) return;
    lastUser.current = payload;
    setInput('');
    setBusy(true);
    setError('');
    if (!regenerate) setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', content: payload }]);
    try {
      const res = await api<{ reply: string; conversationId: string; suggested?: string[] }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: payload, conversationId: activeId, regenerate }),
      });
      setActiveId(res.conversationId);
      setSuggested(res.suggested ?? []);
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: res.reply }]);
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chat failed');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/ai/history/${id}`, { method: 'DELETE' });
    if (activeId === id) {
      setActiveId(undefined);
      setMessages([]);
    }
    loadHistory();
  }

  function copy(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  return (
    <ModulePage title="EITF AI Assistant" subtitle="Context-aware HR, leave, attendance, and payroll help for Enhance IT Infrastructure (EITF)">
      {error && <ModuleAlert type="error">{error}</ModuleAlert>}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <ModuleSection>
          <p className="font-medium">Conversations</p>
          <ModuleSecondaryButton type="button" onClick={() => { setActiveId(undefined); setMessages([]); }}>
            New chat
          </ModuleSecondaryButton>
          <ul className="space-y-1 mt-2 max-h-[60vh] overflow-y-auto">
            {conversations.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <button type="button" className={`flex-1 text-left text-xs px-2 py-1 rounded ${activeId === c.id ? 'bg-brand-50 text-brand-700' : ''}`} onClick={() => openConv(c.id)}>
                  {c.title}
                </button>
                <button type="button" className="text-[10px] text-ink-400" onClick={() => remove(c.id)}>✕</button>
              </li>
            ))}
          </ul>
        </ModuleSection>
        <ModuleSection>
          <div className="min-h-[320px] space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={m.role === 'user' ? 'ml-8' : 'mr-4'}>
                <div className={`rounded-xl px-3 py-2 whitespace-pre-wrap text-sm ${m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-ink-50'}`}>
                  {m.content}
                </div>
                {m.role === 'assistant' && (
                  <div className="flex gap-2 mt-1">
                    <button type="button" className="text-[11px] text-ink-400" onClick={() => copy(m.content)}>Copy</button>
                    <button type="button" className="text-[11px] text-ink-400" onClick={() => send(undefined, true)}>Regenerate</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          {suggested.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {suggested.map((s) => (
                <button key={s} type="button" className="text-xs border border-ink-200 rounded-full px-3 py-1" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input className="input flex-1" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask about leave, payroll, attendance…" />
            <ModuleButton type="button" disabled={busy} onClick={() => send()}>{busy ? '…' : 'Send'}</ModuleButton>
          </div>
        </ModuleSection>
      </div>
    </ModulePage>
  );
}
