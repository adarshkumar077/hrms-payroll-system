"use client";

import { useState, useTransition } from "react";
import { summarizeCallAction, saveCallActivityAction } from "./actions";

export function CallSummarizerCard() {
  const [transcript, setTranscript] = useState("");
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [saved, setSaved] = useState(false);
  const [summarizing, startSummarize] = useTransition();
  const [saving, startSave] = useTransition();

  function summarize() {
    setSaved(false);
    startSummarize(async () => {
      const res = await summarizeCallAction(transcript);
      setSummary(res.summary);
    });
  }

  function save() {
    startSave(async () => {
      const res = await saveCallActivityAction({ subject, summary });
      if (res.ok) setSaved(true);
    });
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-slate-800">Call Summarizer</span>
        <span className="badge bg-brand-50 text-brand-700">AI-3</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Paste a call transcript. AI returns 2 bullets + a next step you can save as an activity.
      </p>

      <label className="label">Transcript</label>
      <textarea
        className="input min-h-[140px] text-sm"
        placeholder="Paste the call transcript here…"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />

      <div className="mt-3">
        <button
          className="btn"
          disabled={summarizing || transcript.trim().length === 0}
          onClick={summarize}
        >
          {summarizing ? "Summarizing…" : "Summarize call"}
        </button>
      </div>

      {summary && (
        <div className="mt-4">
          <label className="label">Summary (editable)</label>
          <textarea
            className="input min-h-[120px] font-mono text-sm"
            value={summary}
            onChange={(e) => {
              setSummary(e.target.value);
              setSaved(false);
            }}
          />

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <label className="label">Activity subject</label>
              <input
                className="input"
                placeholder="e.g. Discovery call — Acme Traders"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <button
              className="btn"
              disabled={saving || summary.trim().length === 0}
              onClick={save}
            >
              {saving ? "Saving…" : "Save as Activity"}
            </button>
          </div>

          {saved && (
            <p className="mt-2 text-xs text-emerald-600">
              Saved as a Call activity — event <span className="font-mono">call.summarized</span> emitted.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-400">
            Human-confirmed: nothing is written until you click Save as Activity.
          </p>
        </div>
      )}
    </div>
  );
}
