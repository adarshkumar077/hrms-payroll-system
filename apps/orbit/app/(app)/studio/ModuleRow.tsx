"use client";

import { useRef, useTransition } from "react";
import { updateModuleConfigAction } from "./actions";

export type ModuleRowData = {
  module: string;
  labelSingular: string;
  labelPlural: string;
  enabled: boolean;
  inNav: boolean;
  inGlobalSearch: boolean;
};

/** One editable row of the Module Selection List. Saves on blur/toggle. */
export function ModuleRow({ m }: { m: ModuleRowData }) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const isStudio = m.module === "studio";

  const save = () => {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    start(async () => {
      await updateModuleConfigAction(data);
    });
  };

  return (
    <tr className={pending ? "opacity-50" : ""}>
      <td className="td font-mono text-xs text-slate-500">{m.module}</td>
      <td className="td" colSpan={5}>
        <form ref={formRef} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="module" value={m.module} />
          <input
            name="labelSingular"
            defaultValue={m.labelSingular}
            onBlur={save}
            className="input py-1 text-sm w-36"
            aria-label={`${m.module} singular label`}
          />
          <input
            name="labelPlural"
            defaultValue={m.labelPlural}
            onBlur={save}
            className="input py-1 text-sm w-36"
            aria-label={`${m.module} plural label`}
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" name="enabled" defaultChecked={m.enabled} onChange={save} disabled={isStudio} />
            Enabled
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" name="inNav" defaultChecked={m.inNav} onChange={save} disabled={isStudio} />
            In nav
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" name="inGlobalSearch" defaultChecked={m.inGlobalSearch} onChange={save} />
            Search
          </label>
          {isStudio && <span className="text-[10px] text-slate-400">always on — prevents lockout</span>}
        </form>
      </td>
    </tr>
  );
}
