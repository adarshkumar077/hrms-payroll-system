"use client";

import { useState, useTransition } from "react";
import { updateDedupeRuleAction } from "./actions";
import { DEDUPE_FIELD_LABELS, type DedupeField } from "./constants";

/**
 * Duplicate rule editor for one module (leads or contacts): OR of AND-field
 * groups + warn/block mode. `module` + `fields` parameterize which module
 * this instance saves to and which fields it offers — the matching engine
 * (lib/studio/dedupe.ts MODULES table) is the source of truth for what each
 * module actually supports.
 */
export function DedupeEditor({
  module,
  moduleLabel,
  fields,
  initialEnabled,
  initialMode,
  initialGroups,
}: {
  module: string;
  moduleLabel: string;
  fields: readonly DedupeField[];
  initialEnabled: boolean;
  initialMode: "warn" | "block";
  initialGroups: string[][];
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [mode, setMode] = useState<"warn" | "block">(initialMode);
  const [groups, setGroups] = useState<string[][]>(initialGroups.length > 0 ? initialGroups : [[]]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggleField(groupIdx: number, field: DedupeField) {
    setSaved(false);
    setGroups((gs) =>
      gs.map((g, i) => {
        if (i !== groupIdx) return g;
        return g.includes(field) ? g.filter((f) => f !== field) : [...g, field];
      })
    );
  }

  function addGroup() {
    setSaved(false);
    setGroups((gs) => [...gs, []]);
  }

  function removeGroup(idx: number) {
    setSaved(false);
    setGroups((gs) => gs.filter((_, i) => i !== idx));
  }

  function save() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("module", module);
    fd.set("enabled", enabled ? "on" : "off");
    fd.set("mode", mode);
    fd.set("fields", JSON.stringify(groups.filter((g) => g.length > 0)));
    start(async () => {
      const res = await updateDedupeRuleAction(fd);
      if (res?.error) setError(res.error);
      else setSaved(true);
    });
  }

  const activeGroups = groups.filter((g) => g.length > 0);
  const preview =
    activeGroups.length === 0
      ? "No match groups configured — duplicate detection has nothing to check."
      : `Match when: ${activeGroups.map((g) => `(${g.map((f) => DEDUPE_FIELD_LABELS[f as DedupeField] ?? f).join(" and ")})`).join(" OR ")}`;

  return (
    <div className={`card p-4 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-slate-800">{moduleLabel}</div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setSaved(false); }} />
            Enabled
          </label>
          <label className="flex items-center gap-1.5">
            Mode
            <select
              className="input py-1 text-xs"
              value={mode}
              onChange={(e) => { setMode(e.target.value === "block" ? "block" : "warn"); setSaved(false); }}
            >
              <option value="warn">Warn (allow, flag)</option>
              <option value="block">Block (reject)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {groups.map((g, idx) => (
          <div key={idx} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <span className="text-xs text-slate-400 w-14">Group {idx + 1}</span>
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {fields.map((f) => (
                <label key={f} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={g.includes(f)} onChange={() => toggleField(idx, f)} />
                  {DEDUPE_FIELD_LABELS[f]}
                </label>
              ))}
            </div>
            {groups.length > 1 && (
              <button type="button" className="btn-ghost text-xs py-1" onClick={() => removeGroup(idx)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" className="btn-ghost text-xs py-1" onClick={addGroup}>
          + Add match group
        </button>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-rose-600">{error}</span>}
          {saved && !error && <span className="text-xs text-emerald-600">Saved</span>}
          <button type="button" className="btn text-xs py-1.5" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 mt-3 font-mono">{preview}</p>
    </div>
  );
}
