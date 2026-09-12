"use client";

import { useState, useTransition } from "react";
import { draftFollowUpAction } from "./actions";

type LeadOption = { id: string; name: string; company: string | null };

export function FollowUpCard({ leads }: { leads: LeadOption[] }) {
  const [leadId, setLeadId] = useState<string>("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [context, setContext] = useState("");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const usingLead = leadId !== "";

  function generate() {
    start(async () => {
      const res = await draftFollowUpAction({
        leadId: usingLead ? leadId : undefined,
        name: usingLead ? undefined : name,
        company: usingLead ? undefined : company,
        channel,
        context: context || undefined,
      });
      setText(res.text);
    });
  }

  const canDraft = usingLead || name.trim().length > 0;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-slate-800">Follow-up Drafting</span>
        <span className="badge bg-blue-100 text-blue-700">AI-2</span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Pick a lead or type a name, choose a channel, and let AI draft the outreach.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">Lead</label>
          <select
            className="input"
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
          >
            <option value="">— Type manually below —</option>
            {leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.company ? ` · ${l.company}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Channel</label>
          <select
            className="input"
            value={channel}
            onChange={(e) => setChannel(e.target.value as "email" | "whatsapp")}
          >
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>

        {!usingLead && (
          <>
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="Contact name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Company (optional)</label>
              <input
                className="input"
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="md:col-span-2">
          <label className="label">Context (optional)</label>
          <input
            className="input"
            placeholder="e.g. Discussed pricing last week; wants a demo."
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-3">
        <button className="btn" disabled={pending || !canDraft} onClick={generate}>
          {pending ? "Drafting…" : "Draft with AI"}
        </button>
      </div>

      <textarea
        className="input min-h-[180px] font-mono text-sm mt-3"
        placeholder="Your AI-drafted follow-up will appear here. Edit before sending."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="mt-2 text-xs text-slate-400">
        Review before sending — Orbit never auto-sends.
      </p>
    </div>
  );
}
