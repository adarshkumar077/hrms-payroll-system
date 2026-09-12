"use client";

import { useState, useTransition } from "react";
import { createAccountAction } from "./actions";
import { ACCOUNT_TYPES } from "@/lib/gl-constants";

export function NewAccountForm() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New account
      </button>
    );
  }

  return (
    <div className="card p-4 w-full max-w-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">New Account</h3>
        <button className="btn-ghost text-xs py-1" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <form
        action={(fd) =>
          start(async () => {
            setError(null);
            const res = await createAccountAction(fd);
            if (res?.error) setError(res.error);
            else setOpen(false);
          })
        }
        className="grid grid-cols-2 gap-3"
      >
        <div>
          <label className="label">Code</label>
          <input name="code" className="input" placeholder="e.g. 1050" required />
        </div>
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue={ACCOUNT_TYPES[0]}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">Name</label>
          <input name="name" className="input" placeholder="e.g. Petty Cash" required />
        </div>

        {error && <div className="col-span-2 text-sm text-rose-600">{error}</div>}

        <div className="col-span-2 flex justify-end">
          <button className="btn" disabled={pending}>
            {pending ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}
