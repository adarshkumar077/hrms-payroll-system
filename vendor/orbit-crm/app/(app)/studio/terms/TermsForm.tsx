"use client";

import { useState, useTransition } from "react";
import { createTermsAction } from "./actions";

/**
 * Form to create a new QuoteTerms template. One kind per form submission.
 * Toggles between "Create Terms" and "Create Payment Terms" via state.
 */
export function TermsForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"terms" | "payment">("terms");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", name);
    fd.set("kind", kind);
    fd.set("body", body);
    if (isDefault) fd.set("isDefault", "on");

    start(async () => {
      const res = await createTermsAction(fd);
      if (!res?.error) {
        setName("");
        setBody("");
        setIsDefault(false);
        setError(null);
      } else {
        setError(res.error);
      }
    });
  };

  const label = kind === "terms" ? "Create Terms & Conditions" : "Create Payment Terms";
  const placeholder = kind === "terms"
    ? "e.g., Prices valid for the period stated. Payment terms net 30 days from invoice date."
    : "e.g., 50% advance, balance on delivery. Payment via NEFT/UPI.";

  return (
    <div className="card p-6">
      <div className="font-semibold text-slate-800 mb-4">{label}</div>
      <form onSubmit={submit} className="space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Template Type</label>
            <select
              className="input"
              value={kind}
              disabled={pending}
              onChange={(e) => setKind(e.target.value as "terms" | "payment")}
            >
              <option value="terms">Terms & Conditions</option>
              <option value="payment">Payment Terms</option>
            </select>
          </div>
          <div>
            <label className="label">
              Template Name
              <span className="text-slate-500 text-xs ml-2">
                ({name.length}/60)
              </span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g., Standard Terms, GST Applicable, etc."
              value={name}
              maxLength={60}
              disabled={pending}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        </div>

        <div>
          <label className="label">
            Template Body
            <span className="text-slate-500 text-xs ml-2">
              ({body.length}/5000)
            </span>
          </label>
          <textarea
            className="input font-mono text-xs"
            placeholder={placeholder}
            rows={6}
            value={body}
            maxLength={5000}
            disabled={pending}
            onChange={(e) => setBody(e.target.value)}
            required
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isDefault"
            checked={isDefault}
            disabled={pending}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          <label htmlFor="isDefault" className="label cursor-pointer">
            Set as default for this type
          </label>
        </div>

        {error && (
          <div className="text-sm text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
            {error}
          </div>
        )}

        <button type="submit" className="btn mt-2" disabled={pending || !name || !body}>
          {pending ? "Creating…" : "Create Template"}
        </button>
      </form>
    </div>
  );
}
