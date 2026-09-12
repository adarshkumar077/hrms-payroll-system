"use client";

import { useRef, useState, useTransition } from "react";
import type { ImportResult } from "./actions";

export function ImportCard({
  title,
  icon,
  columns,
  sampleCsv,
  action,
}: {
  title: string;
  icon: string;
  columns: string[];
  sampleCsv: string;
  action: (prev: ImportResult | undefined, formData: FormData) => Promise<ImportResult>;
}) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ""));
    reader.readAsText(file);
  }

  function onSubmit() {
    const formData = new FormData();
    formData.set("csv", csv);
    start(async () => {
      const r = await action(undefined, formData);
      setResult(r);
      if (!r.error) setCsv("");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  function downloadSample() {
    const blob = new Blob([sampleCsv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase()}-sample.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div>
        <h3 className="font-semibold text-slate-900">
          {icon} {title}
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Columns: <code className="text-slate-600">{columns.join(", ")}</code>
        </p>
      </div>

      <textarea
        className="input font-mono text-xs h-28 resize-y"
        placeholder={`Paste ${title.toLowerCase()} CSV here…`}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="text-xs" />
        <button className="btn-ghost text-xs ml-auto" type="button" onClick={downloadSample}>
          ⬇ Sample CSV
        </button>
      </div>

      <button className="btn" disabled={pending || !csv.trim()} onClick={onSubmit}>
        {pending ? "Importing…" : "Preview & Import"}
      </button>

      {result && (
        <div className={`text-xs rounded-lg p-2 ${result.error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
          {result.error
            ? result.error
            : `Imported ${result.imported} of ${result.total} row${result.total === 1 ? "" : "s"}${
                result.skipped ? ` — skipped ${result.skipped} invalid row${result.skipped === 1 ? "" : "s"}` : ""
              }.`}
        </div>
      )}
    </div>
  );
}
