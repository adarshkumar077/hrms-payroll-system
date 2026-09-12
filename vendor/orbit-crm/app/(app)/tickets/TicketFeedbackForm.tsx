"use client";

import { useState, useTransition } from "react";
import { saveTicketFeedbackAction } from "./actions";

const RATING_OPTIONS = [1, 2, 3, 4, 5];

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5`}>
      {"★".repeat(rating)}
      <span className="text-slate-300">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

// Post-resolution feedback block (tickets/[id]/page.tsx). Renders a read-only
// summary once feedback has been recorded; otherwise a small form gated by
// the caller on the ticket already being in a "closed" category status.
export function TicketFeedbackForm({
  ticketId,
  feedback,
  rating,
}: {
  ticketId: string;
  feedback: string | null;
  rating: number | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draftFeedback, setDraftFeedback] = useState("");
  const [draftRating, setDraftRating] = useState("5");
  const [saved, setSaved] = useState<{ feedback: string | null; rating: number } | null>(
    rating != null ? { feedback, rating } : null
  );

  if (saved) {
    return (
      <div className="text-sm">
        <div className="flex items-center gap-2">
          <Stars rating={saved.rating} />
          <span className="text-slate-500 text-xs">{saved.rating}/5</span>
        </div>
        {saved.feedback && <p className="mt-2 text-slate-700 whitespace-pre-wrap">{saved.feedback}</p>}
      </div>
    );
  }

  return (
    <div>
      {error && <div className="rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700 mb-2">{error}</div>}
      <label className="label">Feedback</label>
      <textarea
        className="input mb-2"
        rows={3}
        value={draftFeedback}
        onChange={(e) => setDraftFeedback(e.target.value)}
        placeholder="How did we do?"
        disabled={pending}
      />
      <label className="label">Rating</label>
      <select
        className="input mb-2"
        value={draftRating}
        onChange={(e) => setDraftRating(e.target.value)}
        disabled={pending}
      >
        {RATING_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r} / 5
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("id", ticketId);
          fd.set("feedback", draftFeedback);
          fd.set("rating", draftRating);
          start(async () => {
            const res = await saveTicketFeedbackAction(fd);
            if (res?.error) {
              setError(res.error);
              return;
            }
            setError(null);
            setSaved({ feedback: draftFeedback.trim() || null, rating: Number(draftRating) });
          });
        }}
      >
        {pending ? "Saving…" : "Save feedback"}
      </button>
    </div>
  );
}
