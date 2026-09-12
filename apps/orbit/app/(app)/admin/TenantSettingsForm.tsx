"use client";

import { useState, useTransition } from "react";
import { updateTenantAction } from "./actions";

export function TenantSettingsForm({
  name,
  gstin,
  aato,
}: {
  name: string;
  gstin: string;
  aato: number;
}) {
  const [pending, start] = useTransition();
  const [nameVal, setNameVal] = useState(name);
  const [gstinVal, setGstinVal] = useState(gstin);
  const [aatoVal, setAatoVal] = useState(String(aato));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    start(async () => {
      const res = await updateTenantAction(nameVal, gstinVal, parseFloat(aatoVal) || 0);
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="card p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
      <div>
        <label className="label">Company name</label>
        <input className="input" value={nameVal} onChange={(e) => setNameVal(e.target.value)} required />
      </div>
      <div>
        <label className="label">GSTIN</label>
        <input className="input" value={gstinVal} onChange={(e) => setGstinVal(e.target.value)} placeholder="22AAAAA0000A1Z5" />
      </div>
      <div>
        <label className="label">Annual aggregate turnover (₹)</label>
        <input className="input" type="number" min="0" step="1" value={aatoVal} onChange={(e) => setAatoVal(e.target.value)} />
      </div>
      <div className="md:col-span-3 flex items-center gap-3">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save company settings"}
        </button>
        {saved && <span className="text-sm text-emerald-700">Saved.</span>}
        {error && <span className="text-sm text-rose-700">{error}</span>}
      </div>
    </form>
  );
}
