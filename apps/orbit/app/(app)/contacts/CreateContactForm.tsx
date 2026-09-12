"use client";

import { useRef, useState, useTransition } from "react";
import { createContactAction } from "./actions";
import { CustomFieldInputs, type CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export function CreateContactForm({
  accountOptions,
  customFields,
}: {
  accountOptions: { id: string; name: string }[];
  customFields: CustomFieldSpec[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Non-blocking duplicate notice from createContactAction (actions.ts): the
  // contact was still created, but a possible dupe was detected. Same pattern
  // as CreateLeadForm.tsx — keep the form open with the amber notice until
  // the user dismisses it themselves.
  const [warning, setWarning] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New Contact
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const result = await createContactAction(fd);
          if (result?.error) {
            setError(result.error);
            setWarning(null);
            return;
          }
          setError(null);
          formRef.current?.reset();
          if (result?.warning) {
            setWarning(result.warning);
            return;
          }
          setOpen(false);
        })
      }
      className="card p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      {error && <div className="md:col-span-3 rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700">{error}</div>}
      {warning && (
        <div className="md:col-span-3 flex items-center justify-between gap-2 rounded-lg text-sm px-3 py-2 bg-amber-50 text-amber-700">
          <span>Contact created — {warning}</span>
          <button
            type="button"
            className="text-xs font-medium text-amber-700 hover:underline shrink-0"
            onClick={() => {
              setWarning(null);
              setOpen(false);
            }}
          >
            Dismiss
          </button>
        </div>
      )}
      <div>
        <label className="label">Name *</label>
        <input name="name" required className="input" placeholder="Priya Mehta" />
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
        <label className="label">Title</label>
        <input name="title" className="input" placeholder="Procurement Manager" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" className="input" placeholder="priya@acme.in" />
      </div>
      <div>
        <label className="label">Phone</label>
        <input name="phone" className="input" placeholder="98765 43210" />
      </div>
      <CustomFieldInputs fields={customFields} />
      <div className="md:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Create contact"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setError(null);
            setWarning(null);
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
