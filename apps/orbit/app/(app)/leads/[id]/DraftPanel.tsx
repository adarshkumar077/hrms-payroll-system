"use client";

import { useState, useTransition } from "react";
import { draftFollowUpAction } from "./draftActions";

export function DraftPanel({ leadId }: { leadId: string }) {
  const [channel, setChannel] = useState<"email" | "whatsapp">("email");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function generate() {
    start(async () => {
      const res = await draftFollowUpAction(leadId, channel);
      setText(res.text);
    });
  }

  return (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-3 flex items-center gap-2">✨ Draft follow-up</div>

      <div className="flex items-center gap-2 mb-3">
        <select
          className="input py-1 text-sm w-auto"
          value={channel}
          onChange={(e) => setChannel(e.target.value as "email" | "whatsapp")}
        >
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <button className="btn" disabled={pending} onClick={generate}>
          {pending ? "Drafting…" : "Draft with AI"}
        </button>
      </div>

      <textarea
        className="input min-h-[180px] font-mono text-sm"
        placeholder="Your AI-drafted follow-up will appear here. Edit before sending."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="mt-2 text-xs text-slate-400">
        Human-in-the-loop: review and edit the draft. Nothing is sent automatically.
      </p>
    </div>
  );
}
