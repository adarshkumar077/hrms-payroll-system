"use client";

import { useState, useTransition } from "react";

/**
 * Orbit Studio — Universal Record Page inline-editable field (WS5).
 *
 * Generic, dependency-free (React only): renders a label + value; clicking
 * the value swaps it for an input/select + Save/Cancel. On save it builds a
 * plain FormData ({ id, field: name, value }) and hands it to whatever
 * server action the caller passed in — this component has no idea what
 * module or record it belongs to. Errors returned by the action are shown
 * inline without discarding the edit.
 */

export type InlineFieldOption = { value: string; label: string };

export function InlineField({
  name,
  label,
  value,
  type = "text",
  options,
  action,
  recordId,
  readOnly = false,
}: {
  name: string;
  label: string;
  value: string;
  type?: "text" | "email" | "tel" | "select" | "date";
  options?: InlineFieldOption[];
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  recordId: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function beginEdit() {
    if (readOnly) return;
    setDraft(current);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function save() {
    const fd = new FormData();
    fd.set("id", recordId);
    fd.set("field", name);
    fd.set("value", draft);
    start(async () => {
      const res = await action(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setCurrent(draft);
      setEditing(false);
      setError(null);
    });
  }

  const displayLabel = options?.find((o) => o.value === current)?.label ?? current;

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500 text-sm shrink-0">{label}</span>

        {editing ? (
          <div className="flex items-center gap-1">
            {type === "select" ? (
              <select
                className="input py-1 text-sm w-auto"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                disabled={pending}
              >
                {(options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input py-1 text-sm w-auto"
                type={type}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                disabled={pending}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") cancel();
                }}
              />
            )}
            <button type="button" className="btn-ghost text-xs py-1 px-2" disabled={pending} onClick={save}>
              {pending ? "…" : "Save"}
            </button>
            <button type="button" className="btn-ghost text-xs py-1 px-2" disabled={pending} onClick={cancel}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`text-sm text-right truncate max-w-[60%] ${
              readOnly ? "cursor-default text-slate-800" : "text-slate-800 hover:text-brand-700 hover:underline"
            }`}
            onClick={beginEdit}
            disabled={readOnly}
          >
            {displayLabel || "—"}
          </button>
        )}
      </div>
      {error && <div className="text-xs text-rose-600 mt-1 text-right">{error}</div>}
    </div>
  );
}
