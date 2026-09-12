"use client";

import { useRef, useState, useTransition } from "react";
import { createOpportunityAction } from "./actions";
import { CustomFieldInputs, type CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export function CreateOpportunityForm({
  accountOptions,
  customFields,
}: {
  accountOptions: { id: string; name: string }[];
  customFields: CustomFieldSpec[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New Deal
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const result = await createOpportunityAction(fd);
          if (result?.error) {
            setError(result.error);
            return;
          }
          setError(null);
          formRef.current?.reset();
          setOpen(false);
        })
      }
      className="card p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      {error && <div className="md:col-span-3 rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700">{error}</div>}
      <div>
        <label className="label">Deal name *</label>
        <input name="name" required className="input" placeholder="Acme — annual AMC" />
      </div>
      <div>
        <label className="label">Amount (₹)</label>
        <input name="amount" type="number" min={0} step="0.01" className="input" placeholder="250000" />
      </div>
      <div>
        <label className="label">Account</label>
        <select name="accountId" className="input" defaultValue="">
          <option value="">— None —</option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Expected close date</label>
        <input name="closeDate" type="date" className="input" />
      </div>
      <CustomFieldInputs fields={customFields} />
      <div className="md:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Create deal"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setError(null);
            setOpen(false);
          }}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
