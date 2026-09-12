"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { askAction } from "./actions";
import type { CopilotResult } from "@/lib/copilot";
import { inrLakh } from "@/lib/format";

const EXAMPLES = [
  "What's my cash position?",
  "Show pipeline by stage",
  "How many open leads?",
  "What revenue have we won?",
  "How much is outstanding in receivables?",
  "Show my top opportunities",
  "Leads by source?",
  "What's my headcount?",
  "What's the payroll liability?",
  "Which items are low on stock?",
  "How much GST have we collected?",
  "How many open tickets?",
];

type Turn = { role: "user"; text: string } | { role: "assistant"; result: CopilotResult };

export function CopilotChat() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, startAsk] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns.length, pending]);

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text: q }]);
    startAsk(async () => {
      const result = await askAction(q);
      setTurns((prev) => [...prev, { role: "assistant", result }]);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      {/* Conversation column */}
      <div className="card flex flex-col p-0 overflow-hidden">
        <div className="flex-1 min-h-[360px] max-h-[560px] overflow-y-auto p-5 space-y-4">
          {turns.length === 0 && (
            <div className="text-center text-sm text-slate-400 py-12">
              Ask a question below, or tap a suggestion on the right.
            </div>
          )}

          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2 text-sm text-white">
                  {turn.text}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="max-w-[85%] space-y-2">
                  <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-slate-800">
                    {turn.result.answer}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge bg-slate-100 text-slate-500 font-mono text-[10px]">
                      {turn.result.intent}
                    </span>
                    <span
                      className={`badge text-[10px] ${
                        turn.result.source === "model"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                      title={
                        turn.result.source === "model"
                          ? "Classified by the live LLM"
                          : "Estimated by local keyword matching (no LLM configured, or the model call failed)"
                      }
                    >
                      {turn.result.source === "model" ? "AI" : "estimated"}
                    </span>
                  </div>
                  <DataView result={turn.result} />
                </div>
              </div>
            )
          )}

          {pending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-slate-400">
                Thinking…
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex gap-2 border-t border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            className="input flex-1"
            placeholder="Ask about revenue, cash, pipeline, leads, stock…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={pending}
          />
          <button className="btn" type="submit" disabled={pending || input.trim().length === 0}>
            {pending ? "…" : "Ask"}
          </button>
        </form>
      </div>

      {/* Suggestions column */}
      <div className="card p-4 h-fit">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">
          Try asking
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="btn-ghost text-xs"
              disabled={pending}
              onClick={() => ask(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Renders the optional `data` payload as a compact list/table per intent shape.
function DataView({ result }: { result: CopilotResult }) {
  const d = result.data;
  if (!d) return null;

  if (Array.isArray(d.stages) && d.stages.length) {
    return <KvTable rows={d.stages.map((s: any) => [s.stage, `${inrLakh(s.amount)} · ${s.count}`])} />;
  }
  if (Array.isArray(d.rows) && d.rows.length) {
    return <KvTable rows={d.rows.map((r: any) => [r.name, `${inrLakh(r.amount)} · ${r.stage}`])} />;
  }
  if (Array.isArray(d.sources) && d.sources.length) {
    return <KvTable rows={d.sources.map((s: any) => [s.source, String(s.count)])} />;
  }
  if (Array.isArray(d.low) && d.low.length) {
    return <KvTable rows={d.low.map((i: any) => [i.name, `${i.onHand} / ${i.reorderLevel} ${i.uom}`])} />;
  }
  if (Array.isArray(d.byPriority) && d.byPriority.length) {
    return <KvTable rows={d.byPriority.map((p: any) => [p.priority, String(p.count)])} />;
  }
  return null;
}

function KvTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i}>
              <td className="td text-slate-600">{k}</td>
              <td className="td text-right font-medium text-slate-800">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
