"use client";

import { useState, useTransition } from "react";
import { updateConvertMapAction } from "./actions";
import type { ConvertTarget } from "./constants";

export type FieldOption = { value: string; label: string };
export type MappingRow = { source: string; target: string };

/** One target's convert-map editor (account / contact / opportunity). Save is per-card. */
export function ConvertMapEditor({
  target,
  targetLabel,
  sourceFields,
  targetFields,
  initialEnabled,
  initialRequired,
  initialMappings,
  note,
}: {
  target: ConvertTarget;
  targetLabel: string;
  sourceFields: FieldOption[];
  targetFields: FieldOption[];
  initialEnabled: boolean;
  initialRequired: boolean;
  initialMappings: MappingRow[];
  note?: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [required, setRequired] = useState(initialRequired);
  const [rows, setRows] = useState<MappingRow[]>(
    initialMappings.length > 0 ? initialMappings : []
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const defaultSource = sourceFields[0]?.value ?? "";
  const defaultTarget = targetFields[0]?.value ?? "";

  function addRow() {
    setSaved(false);
    setRows((r) => [...r, { source: defaultSource, target: defaultTarget }]);
  }

  function removeRow(idx: number) {
    setSaved(false);
    setRows((r) => r.filter((_, i) => i !== idx));
  }

  function updateRow(idx: number, patch: Partial<MappingRow>) {
    setSaved(false);
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("target", target);
    fd.set("enabled", enabled ? "on" : "off");
    fd.set("required", required ? "on" : "off");
    fd.set("mappings", JSON.stringify(rows.filter((r) => r.source && r.target)));
    start(async () => {
      const res = await updateConvertMapAction(fd);
      if (res?.error) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className={`card p-4 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-slate-800">{targetLabel}</div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }} />
            Enabled
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={required} onChange={(e) => { setRequired(e.target.checked); setSaved(false); }} />
            Required
          </label>
        </div>
      </div>

      {note && <p className="text-xs text-slate-400 mb-3">{note}</p>}

      {rows.length === 0 ? (
        <div className="text-xs text-slate-400 mb-2">No field mappings yet — add one below.</div>
      ) : (
        <table className="w-full text-sm mb-2">
          <thead>
            <tr>
              <th className="th">Lead field</th>
              <th className="th">{targetLabel} field</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                <td className="td">
                  <select
                    className="input py-1 text-sm"
                    value={row.source}
                    onChange={(e) => updateRow(idx, { source: e.target.value })}
                  >
                    {sourceFields.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="td">
                  <select
                    className="input py-1 text-sm"
                    value={row.target}
                    onChange={(e) => updateRow(idx, { target: e.target.value })}
                  >
                    {targetFields.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="td text-right">
                  <button type="button" className="btn-ghost text-xs py-1" onClick={() => removeRow(idx)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between">
        <button type="button" className="btn-ghost text-xs py-1" onClick={addRow}>
          + Add row
        </button>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-rose-600">{error}</span>}
          {saved && !error && <span className="text-xs text-emerald-600">Saved</span>}
          <button type="button" className="btn text-xs py-1.5" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
