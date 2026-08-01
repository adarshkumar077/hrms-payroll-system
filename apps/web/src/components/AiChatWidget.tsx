'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError, api, getStoredUser } from '@/lib/api';
import {
  CATEGORIES,
  FlowOption,
  WELCOME_MESSAGE,
  getFlowNode,
  searchCategories,
  searchFaq,
} from '@/lib/hr-assistant-flows';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  options?: FlowOption[];
};

type TicketForm = {
  category: 'HR' | 'IT' | 'FINANCE' | 'ADMIN';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  subject: string;
  description: string;
};

const STORAGE_KEY = 'eitf_hr_assistant_chat_v2';

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function AiChatWidget() {
  const user = getStoredUser();
  const displayName = user?.displayName?.split(' ')[0] ?? 'Employee';

  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<'home' | 'chat' | 'ticket' | 'search'>('home');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [flowStack, setFlowStack] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketForm, setTicketForm] = useState<TicketForm>({
    category: 'HR',
    priority: 'MEDIUM',
    subject: '',
    description: '',
  });
  const [ticketDone, setTicketDone] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const welcomeText = useMemo(
    () => WELCOME_MESSAGE.replace('Hello, Employee!', `Hello, ${displayName}!`),
    [displayName],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { messages: ChatMessage[]; flowStack: string[] };
        if (parsed.messages?.length) {
          setMessages(parsed.messages);
          setFlowStack(parsed.flowStack ?? []);
          setScreen('chat');
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing, open, screen]);

  const persist = useCallback((msgs: ChatMessage[], stack: string[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: msgs, flowStack: stack }));
    } catch {
      /* ignore */
    }
  }, []);

  const pushAssistant = useCallback(
    (content: string, options?: FlowOption[], stack = flowStack) => {
      const msg: ChatMessage = { id: uid(), role: 'assistant', content, ts: Date.now(), options };
      setMessages((prev) => {
        const next = [...prev, msg];
        persist(next, stack);
        return next;
      });
    },
    [flowStack, persist],
  );

  const pushUser = useCallback(
    (content: string, stack = flowStack) => {
      const msg: ChatMessage = { id: uid(), role: 'user', content, ts: Date.now() };
      setMessages((prev) => {
        const next = [...prev, msg];
        persist(next, stack);
        return next;
      });
    },
    [flowStack, persist],
  );

  const simulateTyping = useCallback(
    async (fn: () => void) => {
      setTyping(true);
      await new Promise((r) => setTimeout(r, 450 + Math.random() * 400));
      setTyping(false);
      fn();
    },
    [],
  );

  const goHome = useCallback(() => {
    setScreen('home');
    setFlowStack([]);
    setSearch('');
    setError(null);
    setTicketDone(null);
  }, []);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setFlowStack([]);
    setScreen('home');
    setSearch('');
    setError(null);
    setTicketDone(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const enterFlow = useCallback(
    (nodeId: string, label?: string) => {
      const node = getFlowNode(nodeId);
      if (!node) return;
      const stack = [...flowStack, nodeId];
      setFlowStack(stack);
      setScreen('chat');
      if (label) pushUser(label, stack);
      simulateTyping(() => pushAssistant(node.message, node.options, stack));
      if (node.allowFreeText) setTimeout(() => inputRef.current?.focus(), 300);
    },
    [flowStack, pushAssistant, pushUser, simulateTyping],
  );

  const ESCALATE_OPTIONS: FlowOption[] = useMemo(
    () => [
      { label: 'Contact HR', action: 'escalate' },
      { label: 'Raise Support Ticket', action: 'ticket' },
      { label: 'Back to Home', action: 'home' },
    ],
    [],
  );

  const handleOption = useCallback(
    async (opt: FlowOption) => {
      setError(null);
      pushUser(opt.label);

      if (opt.action === 'home') {
        simulateTyping(() => {
          goHome();
          pushAssistant(welcomeText, undefined, []);
        });
        return;
      }
      if (opt.action === 'ticket') {
        setScreen('ticket');
        return;
      }
      if (opt.action === 'escalate') {
        simulateTyping(() =>
          pushAssistant(
            'Still need help?\n\n• Contact your HR representative during business hours\n• Raise a support ticket for tracked resolution\n• Email HR with your employee code and issue summary',
            [
              { label: 'Raise Support Ticket', action: 'ticket' },
              { label: 'Back to Home', action: 'home' },
            ],
          ),
        );
        return;
      }
      if (opt.link) {
        simulateTyping(() =>
          pushAssistant(`Open ${opt.label} in the app:`, [
            { label: `Go to ${opt.label}`, link: opt.link },
            { label: 'Back to Home', action: 'home' },
          ]),
        );
        return;
      }
      if (opt.reply) {
        simulateTyping(() => pushAssistant(opt.reply!, ESCALATE_OPTIONS));
        return;
      }
      if (opt.nextId) {
        const node = getFlowNode(opt.nextId);
        if (!node) return;
        const stack = [...flowStack, opt.nextId];
        setFlowStack(stack);
        simulateTyping(() => pushAssistant(node.message, node.options, stack));
        if (node.allowFreeText) setTimeout(() => inputRef.current?.focus(), 300);
        return;
      }
    },
    [flowStack, goHome, pushAssistant, pushUser, simulateTyping, welcomeText, ESCALATE_OPTIONS],
  );

  async function sendFreeText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput('');
    setError(null);
    pushUser(trimmed);
    setBusy(true);
    setTyping(true);
    try {
      const res = await api<{ reply: string }>('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: trimmed }),
      });
      setTyping(false);
      pushAssistant(res.reply, ESCALATE_OPTIONS);
    } catch (e) {
      setTyping(false);
      const msg = e instanceof ApiError ? e.message : 'Something went wrong. Please try again.';
      setError(msg);
      pushAssistant(msg, [
        { label: 'Retry', nextId: flowStack[flowStack.length - 1] ?? 'home' },
        { label: 'Raise Support Ticket', action: 'ticket' },
        { label: 'Back to Home', action: 'home' },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function submitTicket() {
    if (!ticketForm.subject.trim() || !ticketForm.description.trim()) {
      setError('Subject and description are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ticket = await api<{ ticketNo: string; id: string; status: string }>('/tickets', {
        method: 'POST',
        body: JSON.stringify({
          category: ticketForm.category,
          priority: ticketForm.priority,
          subject: ticketForm.subject.trim(),
          description: ticketForm.description.trim(),
        }),
      });
      setTicketDone(ticket.ticketNo);
      setScreen('chat');
      pushAssistant(
        `Your support ticket **${ticket.ticketNo}** has been created.\n\nTrack status under Tickets → My Tickets. HR will update you as the ticket progresses.`,
        [
          { label: 'View My Tickets', link: '/tickets' },
          { label: 'Back to Home', action: 'home' },
        ],
      );
      setTicketForm({ category: 'HR', priority: 'MEDIUM', subject: '', description: '' });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create ticket. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    if (flowStack.length <= 1) {
      goHome();
      return;
    }
    const next = flowStack.slice(0, -1);
    const prevId = next[next.length - 1];
    setFlowStack(next);
    const node = prevId ? getFlowNode(prevId) : null;
    if (node) {
      pushAssistant(node.message, node.options, next);
    }
  }

  function copyMessage(text: string) {
    void navigator.clipboard?.writeText(text);
  }

  const faqResults = search ? searchFaq(search, 6) : [];
  const categoryResults = search ? searchCategories(search) : CATEGORIES;

  const currentNode = flowStack.length ? getFlowNode(flowStack[flowStack.length - 1]) : null;
  const allowInput = currentNode?.allowFreeText || screen === 'chat';

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open && (
        <div className="mb-3 w-[min(100vw-2rem,24rem)] h-[min(85vh,32rem)] flex flex-col rounded-2xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 shadow-elevated overflow-hidden animate-slide-in">
          <div className="px-4 py-3 gradient-brand text-white text-sm font-semibold flex items-center gap-2 shrink-0">
            <span className="flex-1">HR Assistant</span>
            {screen !== 'home' && (
              <button type="button" onClick={goBack} className="opacity-90 hover:opacity-100 text-xs px-2 py-1 rounded-lg bg-white/15" title="Back">
                ← Back
              </button>
            )}
            <button type="button" onClick={goHome} className="opacity-90 hover:opacity-100 text-xs px-2 py-1 rounded-lg bg-white/15" title="Home">
              Home
            </button>
            <button type="button" onClick={() => setOpen(false)} className="opacity-80 hover:opacity-100" title="Close">
              ✕
            </button>
          </div>

          <div className="px-3 py-2 border-b border-ink-100 dark:border-ink-800 shrink-0">
            <input
              className="input w-full py-2 text-sm bg-ink-50/50 dark:bg-ink-800/50"
              placeholder="Search attendance, salary, leave…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                if (e.target.value) setScreen('search');
              }}
              onFocus={() => search && setScreen('search')}
            />
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm scrollbar-thin">
            {screen === 'home' && (
              <div className="space-y-3 animate-fade-in">
                <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-indigo-50 dark:from-ink-800 dark:to-ink-800/80 p-4 text-ink-700 dark:text-ink-200 whitespace-pre-wrap leading-relaxed shadow-sm">
                  {welcomeText}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => enterFlow(cat.nextId, cat.label)}
                      className={`text-left rounded-xl p-3 bg-gradient-to-br ${cat.gradient} border border-ink-100 dark:border-ink-700 hover:shadow-md hover:scale-[1.02] transition-all duration-200`}
                    >
                      <span className="text-lg">{cat.icon}</span>
                      <div className="text-xs font-semibold text-ink-800 dark:text-ink-100 mt-1 leading-tight">
                        {cat.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {screen === 'search' && search && (
              <div className="space-y-2 animate-fade-in">
                {faqResults.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-ink-400 mb-2">FAQ</p>
                    {faqResults.map((f) => (
                      <button
                        key={f.question}
                        type="button"
                        className="w-full text-left rounded-xl px-3 py-2 mb-1 bg-ink-50 dark:bg-ink-800 hover:bg-brand-50 dark:hover:bg-ink-700 transition-colors"
                        onClick={() => {
                          setScreen('chat');
                          pushUser(f.question);
                          simulateTyping(() => pushAssistant(`${f.question}\n\n${f.answer}`, ESCALATE_OPTIONS));
                          setSearch('');
                        }}
                      >
                        {f.question}
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-ink-400 mb-2">Topics</p>
                  {categoryResults.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className="w-full text-left rounded-xl px-3 py-2 mb-1 bg-ink-50 dark:bg-ink-800 hover:bg-brand-50 dark:hover:bg-ink-700"
                      onClick={() => {
                        setSearch('');
                        enterFlow(cat.nextId, cat.label);
                      }}
                    >
                      {cat.icon} {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {screen === 'ticket' && (
              <div className="space-y-3 animate-fade-in">
                <p className="font-semibold text-ink-800 dark:text-ink-100">Raise Support Ticket</p>
                {ticketDone ? (
                  <p className="text-ink-600 dark:text-ink-300">Ticket {ticketDone} created.</p>
                ) : (
                  <>
                    <label className="block text-xs text-ink-500">
                      Category
                      <select
                        className="input mt-1 w-full py-2"
                        value={ticketForm.category}
                        onChange={(e) =>
                          setTicketForm((f) => ({ ...f, category: e.target.value as TicketForm['category'] }))
                        }
                      >
                        <option value="HR">HR</option>
                        <option value="IT">IT</option>
                        <option value="FINANCE">Finance</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <label className="block text-xs text-ink-500">
                      Priority
                      <select
                        className="input mt-1 w-full py-2"
                        value={ticketForm.priority}
                        onChange={(e) =>
                          setTicketForm((f) => ({ ...f, priority: e.target.value as TicketForm['priority'] }))
                        }
                      >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                      </select>
                    </label>
                    <label className="block text-xs text-ink-500">
                      Subject
                      <input
                        className="input mt-1 w-full py-2"
                        value={ticketForm.subject}
                        onChange={(e) => setTicketForm((f) => ({ ...f, subject: e.target.value }))}
                      />
                    </label>
                    <label className="block text-xs text-ink-500">
                      Description
                      <textarea
                        className="input mt-1 w-full py-2 min-h-[80px]"
                        value={ticketForm.description}
                        onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))}
                      />
                    </label>
                    {error && <p className="text-danger text-xs">{error}</p>}
                    <div className="flex gap-2">
                      <button type="button" disabled={busy} onClick={submitTicket} className="btn-primary flex-1 py-2 text-sm">
                        Submit Ticket
                      </button>
                      <button type="button" onClick={() => setScreen('chat')} className="btn-secondary py-2 text-sm px-3">
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {(screen === 'chat' || (screen === 'search' && !search)) &&
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`group animate-fade-in ${m.role === 'user' ? 'ml-6' : 'mr-2'}`}
                >
                  <div
                    className={`rounded-2xl px-3 py-2 whitespace-pre-wrap shadow-sm ${
                      m.role === 'user'
                        ? 'bg-brand-500 text-white ml-auto max-w-[90%]'
                        : 'bg-ink-50 dark:bg-ink-800 text-ink-700 dark:text-ink-200 max-w-[95%]'
                    }`}
                  >
                    {m.content.replace(/\*\*(.*?)\*\*/g, '$1')}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 px-1">
                    <span className="text-[10px] text-ink-400">{formatTime(m.ts)}</span>
                    {m.role === 'assistant' && (
                      <button
                        type="button"
                        className="text-[10px] text-ink-400 opacity-0 group-hover:opacity-100"
                        onClick={() => copyMessage(m.content)}
                      >
                        Copy
                      </button>
                    )}
                  </div>
                  {m.options && m.role === 'assistant' && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.options.map((opt) =>
                        opt.link ? (
                          <Link
                            key={opt.label}
                            href={opt.link}
                            className="text-xs px-3 py-1.5 rounded-full border border-brand-200 dark:border-brand-700 text-brand-700 dark:text-brand-300 bg-brand-50/80 dark:bg-brand-900/30 hover:bg-brand-100 transition-colors"
                          >
                            {opt.label}
                          </Link>
                        ) : (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => handleOption(opt)}
                            className="text-xs px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-600 bg-white dark:bg-ink-800 hover:bg-brand-50 dark:hover:bg-ink-700 transition-colors"
                          >
                            {opt.label}
                          </button>
                        ),
                      )}
                    </div>
                  )}
                </div>
              ))}

            {typing && (
              <div className="flex gap-1 px-3 py-2 rounded-2xl bg-ink-50 dark:bg-ink-800 w-fit animate-pulse">
                <span className="w-2 h-2 rounded-full bg-ink-300 dark:bg-ink-500" />
                <span className="w-2 h-2 rounded-full bg-ink-300 dark:bg-ink-500 animation-delay-150" />
                <span className="w-2 h-2 rounded-full bg-ink-300 dark:bg-ink-500 animation-delay-300" />
              </div>
            )}

            {error && screen === 'chat' && (
              <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger flex items-center justify-between gap-2">
                <span>{error}</span>
                <button type="button" className="underline shrink-0" onClick={() => setError(null)}>
                  Dismiss
                </button>
              </div>
            )}
          </div>

          <div className="p-2 border-t border-ink-100 dark:border-ink-800 shrink-0 space-y-2">
            <div className="flex gap-1.5 text-[10px] text-ink-400 px-1">
              <button type="button" onClick={startNewChat} className="hover:text-brand-600">
                New chat
              </button>
              <span>·</span>
              <button type="button" onClick={() => messages.length && setScreen('chat')} className="hover:text-brand-600">
                History ({messages.length})
              </button>
              <span>·</span>
              <button type="button" onClick={startNewChat} className="hover:text-brand-600">
                Clear
              </button>
            </div>
            {(allowInput || screen === 'home') && screen !== 'ticket' && (
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  className="input flex-1 py-2 text-sm"
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendFreeText(input)}
                  placeholder={currentNode?.allowFreeText ? 'Describe your issue…' : 'Type a question…'}
                />
                <button
                  type="button"
                  disabled={busy || !input.trim()}
                  onClick={() => sendFreeText(input)}
                  className="btn-primary px-4 py-2 text-sm shrink-0"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-2xl gradient-brand text-white px-5 py-3.5 text-sm font-medium shadow-elevated hover:shadow-glow transition-all duration-200 flex items-center gap-2"
      >
        <span aria-hidden>💬</span>
        {open ? 'Close' : 'HR Assistant'}
      </button>
    </div>
  );
}
