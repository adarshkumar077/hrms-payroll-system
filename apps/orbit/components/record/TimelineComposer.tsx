"use client";

import { useState, useTransition } from "react";

/**
 * Orbit Studio — Universal Record Page "add note" composer (WS5).
 *
 * Generic textarea + button; caller passes in the (already record-bound)
 * server action to call with a FormData containing just `note`.
 */
export function TimelineComposer({
  action,
}: {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    const note = text.trim();
    if (!note) return;
    const fd = new FormData();
    fd.set("note", note);
    start(async () => {
      const res = await action(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setText("");
      setError(null);
    });
  }

  return (
    <div className="card p-3">
      <textarea
        className="input min-h-[70px] text-sm"
        placeholder="Add a note…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
      />
      <div className="flex items-center justify-between mt-2">
        {error ? <span className="text-xs text-rose-600">{error}</span> : <span />}
        <button type="button" className="btn text-sm" disabled={pending || !text.trim()} onClick={submit}>
          {pending ? "Adding…" : "Add note"}
        </button>
      </div>
    </div>
  );
}
