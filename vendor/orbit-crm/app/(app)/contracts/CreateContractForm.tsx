"use client";

import { useRef, useState, useTransition } from "react";
import { createContractAction } from "./actions";
import { CustomFieldInputs, type CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export function CreateContractForm({
  accountOptions,
  typeOptions,
  statusOptions,
  customFields,
}: {
  accountOptions: { id: string; name: string }[];
  typeOptions: { value: string; label: string }[];
  statusOptions: { value: string; label: string }[];
  customFields: CustomFieldSpec[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New Contract
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const result = await createContractAction(fd);
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
        <label className="label">Name *</label>
        <input name="name" required className="input" placeholder="Annual Maintenance — Tata Retail" />
      </div>
      <div>
        <label className="label">Account *</label>
        <select name="accountId" required className="input" defaultValue="">
          <option value="" disabled>
            Select an account…
          </option>
          {accountOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Type</label>
        <select name="type" className="input" defaultValue="">
          <option value="">— Default —</option>
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" className="input" defaultValue="">
          <option value="">— Default —</option>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Start Date *</label>
        <input name="startDate" type="date" required className="input" />
      </div>
      <div>
        <label className="label">End Date *</label>
        <input name="endDate" type="date" required className="input" />
      </div>
      <div>
        <label className="label">Value (₹)</label>
        <input name="value" type="number" step="0.01" min="0" className="input" placeholder="0" />
      </div>
      <div>
        <label className="label">Visit Quota</label>
        <input name="visitQuota" type="number" step="1" min="0" className="input" placeholder="0" />
      </div>
      <div>
        <label className="label">Renewal Notice (days)</label>
        <input name="renewalNoticeDays" type="number" step="1" min="0" className="input" placeholder="30" />
      </div>
      <div className="md:col-span-3">
        <label className="label">Notes</label>
        <textarea name="notes" className="input" rows={2} />
      </div>
      <CustomFieldInputs fields={customFields} />
      <div className="md:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Create contract"}
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
