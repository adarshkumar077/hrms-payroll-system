"use client";

import { useRef, useState, useTransition } from "react";
import { createAccountAction } from "./actions";
import { CustomFieldInputs, type CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export function CreateAccountForm({ customFields = [] }: { customFields?: CustomFieldSpec[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New Account
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const result = await createAccountAction(fd);
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
        <input name="name" required className="input" placeholder="Acme Traders Pvt Ltd" />
      </div>
      <div>
        <label className="label">Industry</label>
        <input name="industry" className="input" placeholder="Manufacturing" />
      </div>
      <div>
        <label className="label">GSTIN</label>
        <input name="gstin" className="input" placeholder="27ABCDE1234F1Z5" />
      </div>
      <div>
        <label className="label">City</label>
        <input name="city" className="input" placeholder="Pune" />
      </div>
      <div>
        <label className="label">State</label>
        <input name="state" className="input" placeholder="Maharashtra" />
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" className="input" placeholder="hello@acme.in" />
      </div>
      <CustomFieldInputs fields={customFields} />
      <div className="md:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Create account"}
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
