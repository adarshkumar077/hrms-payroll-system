"use client";

import { useState, useTransition } from "react";
import { sendWhatsAppAction } from "./actions";

// v1 send surface (docs/ai/design/wave-d-contracts.md §Adapter interfaces):
// free-form body, optional templateKey, and — for record pages to deep-link
// here later — optional entity/entityId carried through as hidden fields,
// pre-filled from ?to=&entity=&entityId= if the page was opened with them.
export function SendMessageForm({
  initialTo = "",
  initialEntity = null,
  initialEntityId = null,
}: {
  initialTo?: string;
  initialEntity?: string | null;
  initialEntityId?: string | null;
}) {
  const [open, setOpen] = useState(Boolean(initialTo));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Send WhatsApp
      </button>
    );
  }

  return (
    <div className="card p-4 w-full max-w-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">Send WhatsApp message</h3>
        <button className="btn-ghost text-xs py-1" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <form
        action={(fd) =>
          start(async () => {
            setError(null);
            const res = await sendWhatsAppAction(fd);
            if (res?.error) setError(res.error);
            else setOpen(false);
          })
        }
        className="grid grid-cols-1 gap-3"
      >
        <div>
          <label className="label">To (phone)</label>
          <input name="to" defaultValue={initialTo} placeholder="+91XXXXXXXXXX" className="input" required />
        </div>

        <div>
          <label className="label">Message</label>
          <textarea name="body" rows={4} className="input" placeholder="Message body…" required />
        </div>

        <div>
          <label className="label">Template key (optional)</label>
          <input name="templateKey" className="input" placeholder="e.g. order_update" />
        </div>

        {initialEntity && <input type="hidden" name="entity" value={initialEntity} />}
        {initialEntityId && <input type="hidden" name="entityId" value={initialEntityId} />}

        {error && <p className="text-xs text-rose-600">{error}</p>}

        <div className="flex justify-end">
          <button className="btn" disabled={pending}>
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
