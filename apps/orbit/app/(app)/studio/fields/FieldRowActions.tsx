"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { archiveFieldAction, restoreFieldAction, updateFieldAction } from "./actions";

export type FieldRowData = {
  id: string;
  label: string;
  code: string;
  type: string;
  system: boolean;
  required: boolean;
  helpText: string | null;
  archived: boolean;
};

/**
 * One row of the Custom Fields table. Renders as a set of <td>s (no wrapping
 * <form> — table rows can't nest one across cells) so the parent page can
 * spread it directly inside a <tr>. Label/required/helpText save on
 * blur/change; code and type are read-only everywhere (server enforces this
 * too — see updateFieldAction). System rows never show Archive/Restore.
 */
export function FieldRowActions({
  field,
  typeBadge,
  picklistCell,
}: {
  field: FieldRowData;
  typeBadge: React.ReactNode;
  picklistCell: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(field.label);
  const [required, setRequired] = useState(field.required);
  const [helpText, setHelpText] = useState(field.helpText ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = (overrides?: Partial<{ label: string; required: boolean; helpText: string }>) => {
    const fd = new FormData();
    fd.set("id", field.id);
    fd.set("label", overrides?.label ?? label);
    if (overrides?.required ?? required) fd.set("required", "on");
    fd.set("helpText", overrides?.helpText ?? helpText);
    start(async () => {
      const res = await updateFieldAction(fd);
      setError(res?.error ?? null);
    });
  };

  const toggleArchive = () => {
    start(async () => {
      const res = field.archived ? await restoreFieldAction(field.id) : await archiveFieldAction(field.id);
      setError(res?.error ?? null);
    });
  };

  return (
    <>
      <td className="td">
        <input
          className="input py-1 text-sm"
          value={label}
          disabled={pending}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => save()}
          aria-label={`${field.code} label`}
        />
        <input
          className="input py-1 text-xs mt-1 text-slate-500"
          value={helpText}
          placeholder="Help text (optional)"
          disabled={pending}
          onChange={(e) => setHelpText(e.target.value)}
          onBlur={() => save()}
          aria-label={`${field.code} help text`}
        />
        {error && <div className="text-xs text-rose-600 mt-1">{error}</div>}
      </td>
      <td className="td font-mono text-xs text-slate-500">{field.code}</td>
      <td className="td">{typeBadge}</td>
      <td className="td">
        <input
          type="checkbox"
          checked={required}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setRequired(next);
            save({ required: next });
          }}
          aria-label={`${field.code} required`}
        />
      </td>
      <td className="td">{picklistCell}</td>
      <td className="td">
        {field.system && <Badge tone="blue">system</Badge>}
        {!field.system && field.archived && <Badge tone="red">archived</Badge>}
        {!field.system && !field.archived && <Badge tone="green">custom</Badge>}
      </td>
      <td className="td text-right">
        {!field.system && (
          <button className="btn-ghost text-xs py-1" disabled={pending} onClick={toggleArchive}>
            {pending ? "…" : field.archived ? "Restore" : "Archive"}
          </button>
        )}
      </td>
    </>
  );
}
