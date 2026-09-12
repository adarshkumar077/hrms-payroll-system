"use client";

import { useRef } from "react";

export function CreatePoForm({ action }: { action: (formData: FormData) => void }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-3">Create purchase order</div>
      <form
        ref={formRef}
        action={(fd) => {
          action(fd);
          formRef.current?.reset();
        }}
        className="grid gap-3 md:grid-cols-[2fr_1fr_auto] md:items-end"
      >
        <div>
          <label className="label">Vendor</label>
          <input name="vendor" type="text" className="input" placeholder="e.g. Sharma Traders" required />
        </div>
        <div>
          <label className="label">Total (₹)</label>
          <input name="total" type="number" min="0" step="any" className="input" placeholder="0" />
        </div>
        <button type="submit" className="btn">
          Raise PO
        </button>
      </form>
    </div>
  );
}
