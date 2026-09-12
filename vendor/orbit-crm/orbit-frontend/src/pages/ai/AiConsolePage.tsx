import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import { PageHeader } from "../../components/Layout";

type Status = { enabled: boolean; provider: string };
type Lead = { id: string; name: string; company: string | null; score: number | null; score_reason: string | null };

// AI Console — status banner + Lead Scoring + Follow-up drafting + Call summarizer.
// Every action degrades gracefully server-side (AiService), so this always works,
// LLM key or not — the status banner just tells you which mode you're in.
export function AiConsolePage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    apiGet<Status>("/ai/status").then(setStatus).catch(() => setStatus({ enabled: false, provider: "Local" }));
  }, []);

  return (
    <div>
      <PageHeader title="AI Console" subtitle="Lead scoring, follow-up drafting, and call summarization." />

      <div className={`card p-4 mb-6 flex items-center gap-2 ${status?.enabled ? "border-l-4 border-l-emerald-500" : "border-l-4 border-l-slate-400"}`}>
        <span className="text-lg">{status?.enabled ? "🟢" : "⚪"}</span>
        <div className="text-sm">
          {status === null ? (
            <span className="text-slate-400">Checking AI status…</span>
          ) : status.enabled ? (
            <span className="font-medium text-slate-800">Live · {status.provider}</span>
          ) : (
            <span className="font-medium text-slate-600">Local fallback · {status.provider}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeadScoringCard />
        <FollowUpDraftCard />
      </div>

      <div className="mt-6">
        <CallSummarizerCard />
      </div>
    </div>
  );
}

function LeadScoringCard() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const loadLeads = () => {
    apiGet<any>("/crm/leads")
      .then((r) => setLeads(Array.isArray(r) ? r : r?.data ?? []))
      .catch((e) => setErr(e.message));
  };

  useEffect(() => { loadLeads(); }, []);

  async function scoreAll() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const res = await apiPost<{ total: number; scored: number }>("/ai/score-all");
      setMsg(`Scored ${res.scored} of ${res.total} leads.`);
      loadLeads();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-800">Lead Scoring</h2>
        <button className="btn" disabled={busy} onClick={scoreAll}>
          {busy ? "Scoring…" : "Score all leads"}
        </button>
      </div>
      {msg && <div className="mb-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm px-3 py-2">{msg}</div>}
      {err && <div className="mb-3 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Name</th>
              <th className="th">Company</th>
              <th className="th">Score</th>
              <th className="th">Reason</th>
            </tr>
          </thead>
          <tbody>
            {leads === null && (
              <tr><td className="td text-slate-400" colSpan={4}>Loading…</td></tr>
            )}
            {leads !== null && leads.length === 0 && (
              <tr><td className="td text-slate-400" colSpan={4}>No leads yet.</td></tr>
            )}
            {(leads || []).map((l) => (
              <tr key={l.id}>
                <td className="td">{l.name}</td>
                <td className="td">{l.company || <span className="text-slate-300">—</span>}</td>
                <td className="td">
                  {l.score != null ? <span className="badge">{l.score}</span> : <span className="text-slate-300">—</span>}
                </td>
                <td className="td text-slate-500">{l.score_reason || <span className="text-slate-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FollowUpDraftCard() {
  const [leadName, setLeadName] = useState("");
  const [company, setCompany] = useState("");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function generate() {
    if (!leadName.trim()) return;
    setBusy(true); setErr("");
    try {
      const res = await apiPost<{ draft: string }>("/ai/draft", { leadName, company: company || undefined, channel, context: context || undefined });
      setDraft(res.draft);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-800 mb-3">Follow-up Drafting</h2>
      <div className="space-y-3">
        <div>
          <label className="label">Lead name</label>
          <input className="input" value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="e.g. Rahul Sharma" />
        </div>
        <div>
          <label className="label">Company</label>
          <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="optional" />
        </div>
        <div>
          <label className="label">Channel</label>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as "email" | "whatsapp")}>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <div>
          <label className="label">Context</label>
          <textarea className="input" rows={2} value={context} onChange={(e) => setContext(e.target.value)} placeholder="optional — e.g. interested in the payroll module" />
        </div>
        {err && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
        <button className="btn" disabled={busy || !leadName.trim()} onClick={generate}>
          {busy ? "Drafting…" : "Draft follow-up"}
        </button>
        {draft && (
          <div>
            <label className="label">Result (editable)</label>
            <textarea className="input" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

function CallSummarizerCard() {
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function summarize() {
    if (!transcript.trim()) return;
    setBusy(true); setErr("");
    try {
      const res = await apiPost<{ summary: string }>("/ai/summarize", { transcript });
      setSummary(res.summary);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-slate-800 mb-3">Call Summarizer</h2>
      <label className="label">Call transcript</label>
      <textarea className="input" rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the call transcript here…" />
      {err && <div className="mt-3 rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{err}</div>}
      <div className="mt-3">
        <button className="btn" disabled={busy || !transcript.trim()} onClick={summarize}>
          {busy ? "Summarizing…" : "Summarize call"}
        </button>
      </div>
      {summary && (
        <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 whitespace-pre-line">
          {summary}
        </div>
      )}
    </div>
  );
}
