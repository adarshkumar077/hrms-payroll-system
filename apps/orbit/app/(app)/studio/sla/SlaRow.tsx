"use client";

import { useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { updateSlaHoursAction } from "./actions";

export type SlaRowData = {
  id: string;
  value: string;
  label: string;
  tone: string | null;
  category: string | null;
  slaHours: number | null; // null = not configured (falls back to the legacy hardcoded map at read time)
};

const TONE_ALIAS: Record<string, string> = { rose: "red", emerald: "green" };
function badgeTone(tone: string | null): string {
  if (!tone) return "slate";
  return TONE_ALIAS[tone] ?? tone;
}

/** One editable row: priority label + its SLA-hours input, saved on blur. */
export function SlaRow({ option }: { option: SlaRowData }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const save = () => {
    const value = inputRef.current?.value ?? "";
    const fd = new FormData();
    fd.append("optionId", option.id);
    fd.append("slaHours", value);
    setError(null);
    start(async () => {
      const result = await updateSlaHoursAction(fd);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <tr className={pending ? "opacity-50" : ""}>
      <td className="td">
        <Badge tone={badgeTone(option.tone)}>{option.label}</Badge>
      </td>
      <td className="td font-mono text-xs text-slate-500">{option.value}</td>
      <td className="td">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="number"
            min={1}
            step="1"
            defaultValue={option.slaHours ?? ""}
            onBlur={save}
            disabled={pending}
            className="input py-1 text-sm w-24"
            aria-label={`${option.label} SLA hours`}
          />
          <span className="text-xs text-slate-400">hours</span>
        </div>
        {error && <div className="text-[11px] text-rose-600 mt-1">{error}</div>}
      </td>
    </tr>
  );
}
