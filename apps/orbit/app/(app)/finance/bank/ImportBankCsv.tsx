"use client";

import { useState, useTransition } from "react";
import { importAction } from "./actions";

export function ImportBankCsv() {
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + Import bank statement
      </button>
    );
  }

  return (
    <div className="card p-4 w-full max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Import bank statement CSV</h3>
        <button className="btn-ghost text-xs py-1" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <p className="mb-2 text-xs text-slate-500">
        Paste CSV with columns <code>date, description, amount, direction</code> — or signed amounts
        (negative = debit / money out) and omit the direction column.
      </p>

      <textarea
        className="input min-h-[160px] font-mono text-xs"
        placeholder={"date,description,amount,direction\n2026-07-01,ACME Corp NEFT,25000,credit\n2026-07-02,Office Rent,-18000,debit"}
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
      />

      {result && <div className="mt-2 text-sm text-emerald-700">{result}</div>}

      <div className="mt-3 flex justify-end">
        <button
          className="btn"
          disabled={pending || !csvText.trim()}
          onClick={() =>
            start(async () => {
              setResult(null);
              const res = await importAction(csvText);
              setResult(`Imported ${res.imported} transaction${res.imported === 1 ? "" : "s"}.`);
              setCsvText("");
            })
          }
        >
          {pending ? "Importing…" : "Import"}
        </button>
      </div>
    </div>
  );
}
