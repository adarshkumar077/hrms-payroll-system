"use client";

import { useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import {
  addOptionAction,
  archiveOptionAction,
  moveOptionAction,
  restoreOptionAction,
  setDefaultAction,
  updateOptionAction,
} from "../actions";

export type OptionRowData = {
  id: string;
  value: string;
  label: string;
  tone: string | null;
  category: string | null;
  isDefault: boolean;
  archived: boolean;
};

const TONE_OPTIONS = ["slate", "blue", "amber", "green", "red", "brand"] as const;
type Tone = (typeof TONE_OPTIONS)[number];

const CATEGORY_TOOLTIP =
  "Category anchors business logic (revenue, scoring) — values and labels are yours to change; categories are not.";

function toneOrSlate(t: string | null): Tone {
  return (TONE_OPTIONS as readonly string[]).includes(t || "") ? (t as Tone) : "slate";
}

/** One editable row in a picklist editor table. Mirrors ModuleRow's save-on-blur style. */
export function OptionRow({
  option,
  canMoveUp = false,
  canMoveDown = false,
  canArchive = true,
  archivedView = false,
}: {
  option: OptionRowData;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  canArchive?: boolean;
  archivedView?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const toneRef = useRef<HTMLSelectElement>(null);

  const run = (fn: (fd: FormData) => Promise<void>, extra?: Record<string, string>) => {
    const fd = new FormData();
    fd.append("optionId", option.id);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    setError(null);
    start(async () => {
      try {
        await fn(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  };

  const saveEdit = () => {
    const fd = new FormData();
    fd.append("optionId", option.id);
    fd.append("label", labelRef.current?.value ?? option.label);
    fd.append("tone", toneRef.current?.value ?? option.tone ?? "slate");
    setError(null);
    start(async () => {
      try {
        await updateOptionAction(fd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  };

  if (archivedView) {
    return (
      <tr className={`text-slate-400 ${pending ? "opacity-50" : ""}`}>
        <td className="td font-mono text-xs">{option.value}</td>
        <td className="td">{option.label}</td>
        <td className="td">
          <Badge tone={toneOrSlate(option.tone)}>{option.tone || "slate"}</Badge>
        </td>
        <td className="td text-xs">
          {option.category ? (
            <span title={CATEGORY_TOOLTIP}>{option.category}</span>
          ) : (
            <span title={CATEGORY_TOOLTIP}>—</span>
          )}
        </td>
        <td className="td">
          <button type="button" className="btn-ghost text-xs py-1" disabled={pending} onClick={() => run(restoreOptionAction)}>
            {pending ? "…" : "Restore"}
          </button>
          {error && <div className="text-[11px] text-rose-600 mt-1">{error}</div>}
        </td>
      </tr>
    );
  }

  return (
    <tr className={pending ? "opacity-50" : ""}>
      <td className="td">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost text-xs px-1.5 py-0.5"
            disabled={pending || !canMoveUp}
            onClick={() => run(moveOptionAction, { direction: "up" })}
            aria-label={`Move ${option.label} up`}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn-ghost text-xs px-1.5 py-0.5"
            disabled={pending || !canMoveDown}
            onClick={() => run(moveOptionAction, { direction: "down" })}
            aria-label={`Move ${option.label} down`}
          >
            ↓
          </button>
        </div>
      </td>
      <td className="td font-mono text-xs text-slate-500">{option.value}</td>
      <td className="td">
        <input
          ref={labelRef}
          defaultValue={option.label}
          onBlur={saveEdit}
          disabled={pending}
          className="input py-1 text-sm w-40"
          aria-label={`${option.value} label`}
        />
      </td>
      <td className="td">
        <select
          ref={toneRef}
          defaultValue={toneOrSlate(option.tone)}
          onChange={saveEdit}
          disabled={pending}
          className="input py-1 text-sm w-28"
          aria-label={`${option.value} tone`}
        >
          {TONE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td className="td">
        {option.category ? (
          <span title={CATEGORY_TOOLTIP}>
            <Badge tone="slate">{option.category}</Badge>
          </span>
        ) : (
          <span className="text-slate-300 text-xs" title={CATEGORY_TOOLTIP}>
            —
          </span>
        )}
      </td>
      <td className="td text-center">
        <input
          type="radio"
          checked={option.isDefault}
          disabled={pending || option.isDefault}
          onChange={() => run(setDefaultAction)}
          aria-label={option.isDefault ? `${option.label} is the default` : `Set ${option.label} as default`}
          title={option.isDefault ? "Default option" : "Set as default"}
        />
      </td>
      <td className="td">
        <button
          type="button"
          className="btn-ghost text-xs py-1"
          disabled={pending || !canArchive}
          title={!canArchive ? "Cannot archive — reassign the default, or this is the last active option of a system list" : undefined}
          onClick={() => run(archiveOptionAction)}
        >
          {pending ? "…" : "Archive"}
        </button>
        {error && <div className="text-[11px] text-rose-600 mt-1">{error}</div>}
      </td>
    </tr>
  );
}

/** "Add option" form — value is derived server-side from the label and is never user-editable. */
export function AddOptionForm({ pklKey, isSystem }: { pklKey: string; isSystem: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    setError(null);
    start(async () => {
      try {
        await addOptionAction(data);
        form.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add option");
      }
    });
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="key" value={pklKey} />
      <div>
        <label className="label" htmlFor="new-option-label">
          Label
        </label>
        <input
          id="new-option-label"
          name="label"
          required
          disabled={pending}
          className="input py-1.5 text-sm w-48"
          placeholder="e.g. On Hold"
        />
      </div>
      <div>
        <label className="label" htmlFor="new-option-tone">
          Tone
        </label>
        <select id="new-option-tone" name="tone" defaultValue="slate" disabled={pending} className="input py-1.5 text-sm w-32">
          {TONE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {!isSystem && (
        <div>
          <label className="label" htmlFor="new-option-category">
            Category (optional)
          </label>
          <input
            id="new-option-category"
            name="category"
            disabled={pending}
            className="input py-1.5 text-sm w-40"
            placeholder="e.g. open"
          />
        </div>
      )}
      <button type="submit" className="btn py-1.5" disabled={pending}>
        {pending ? "Adding…" : "Add option"}
      </button>
      {isSystem && (
        <span className="text-[11px] text-slate-400 max-w-xs">
          New options on system lists get no category and are excluded from category-driven metrics.
        </span>
      )}
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </form>
  );
}
