"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inr } from "@/lib/format";
import { postJournalAction } from "../actions";

type AccountOpt = { code: string; name: string };

type Line = { code: string; debit: string; credit: string };

const emptyLine = (code: string): Line => ({ code, debit: "", credit: "" });

export function NewJournalForm({ accounts }: { accounts: AccountOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine(accounts[0]?.code ?? ""), emptyLine(accounts[1]?.code ?? accounts[0]?.code ?? "")]);

  const drTotal = round2(lines.reduce((a, l) => a + (Number(l.debit) || 0), 0));
  const crTotal = round2(lines.reduce((a, l) => a + (Number(l.credit) || 0), 0));
  const diff = round2(drTotal - crTotal);
  const balanced = diff === 0 && drTotal > 0;

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine(accounts[0]?.code ?? "")]);
  }

  function removeLine(i: number) {
    setLines((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("narration", narration);
    fd.set("reference", reference);
    for (const l of lines) {
      fd.append("lineCode", l.code);
      fd.append("lineDebit", l.debit || "0");
      fd.append("lineCredit", l.credit || "0");
    }
    start(async () => {
      const res = await postJournalAction(fd);
      if (res?.error) setError(res.error);
      else router.push("/finance/ledger");
    });
  }

  return (
    <form onSubmit={onSubmit} className="card p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Narration</label>
          <input
            className="input"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="e.g. Owner capital contribution"
            required
          />
        </div>
        <div>
          <label className="label">Reference (optional)</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. REF-001" />
        </div>
      </div>

      <div>
        <label className="label">Lines</label>
        <div className="overflow-hidden rounded-md border border-slate-200">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Account</th>
                <th className="th text-right">Debit</th>
                <th className="th text-right">Credit</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="td">
                    <select className="input" value={l.code} onChange={(e) => updateLine(i, { code: e.target.value })}>
                      {accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="td text-right">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="input text-right"
                      value={l.debit}
                      onChange={(e) => updateLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="td text-right">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="input text-right"
                      value={l.credit}
                      onChange={(e) => updateLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                      placeholder="0.00"
                    />
                  </td>
                  <td className="td text-right">
                    <button
                      type="button"
                      className="btn-ghost text-xs py-1"
                      disabled={lines.length <= 2}
                      onClick={() => removeLine(i)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-ghost text-xs py-1 mt-2" onClick={addLine}>
          + Add line
        </button>
      </div>

      <div className="rounded-md bg-slate-50 p-3 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Dr total</span>
          <span>{inr(drTotal)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Cr total</span>
          <span>{inr(crTotal)}</span>
        </div>
        <div className={`mt-1 flex justify-between border-t border-slate-200 pt-1 font-semibold ${diff === 0 ? "text-emerald-700" : "text-rose-600"}`}>
          <span>Difference</span>
          <span>{inr(diff)}</span>
        </div>
      </div>

      {error && <div className="text-sm text-rose-600">{error}</div>}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => router.push("/finance/ledger")}>
          Cancel
        </button>
        <button className="btn" disabled={pending || !balanced}>
          {pending ? "Posting…" : "Post journal entry"}
        </button>
      </div>
    </form>
  );
}

function round2(n: number) {
  return Math.round((n || 0) * 100) / 100;
}
