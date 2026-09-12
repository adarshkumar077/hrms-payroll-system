import { useState } from "react";
import { apiPost } from "../../lib/api";
import { PageHeader } from "../../components/Layout";

type ChatMsg = { role: "user" | "assistant"; text: string; intent?: string; source?: "model" | "fallback" };

const SUGGESTIONS = ["What's my cash position?", "How many open leads?", "Payroll liability?"];

// "Chat with your data" — the LLM only classifies the question into a fixed intent;
// our own tenant-scoped queries produce the answer, so this is always safe and
// always demoable (Copilot::ask degrades to keyword matching with no LLM key).
export function CopilotPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    setErr("");
    try {
      const res = await apiPost<{ answer: string; intent: string; source: "model" | "fallback" }>("/copilot/ask", { question: q });
      setMessages((m) => [...m, { role: "assistant", text: res.answer, intent: res.intent, source: res.source }]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Copilot" subtitle="Ask a question about your business data." />

      <div className="flex flex-wrap gap-2 mb-4">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="btn-ghost text-xs py-1.5" disabled={busy} onClick={() => send(s)}>
            {s}
          </button>
        ))}
      </div>

      <div className="card p-4 mb-4 min-h-[320px] max-h-[520px] overflow-y-auto flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="text-sm text-slate-400 m-auto">Ask a question, or tap a suggestion above.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] ${m.role === "user" ? "self-end" : "self-start"}`}>
            <div
              className={`rounded-xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-800"
              }`}
            >
              {m.text}
            </div>
            {m.role === "assistant" && m.intent && (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="badge">{m.intent}</span>
                {m.source && <span className="text-[10px] text-slate-400 uppercase tracking-wide">{m.source === "model" ? "AI" : "local"}</span>}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="self-start text-sm text-slate-400">Thinking…</div>}
      </div>

      {err && <div className="mb-3 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className="input"
          placeholder="Ask about revenue, cash, pipeline, payroll, stock…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button type="submit" className="btn" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
