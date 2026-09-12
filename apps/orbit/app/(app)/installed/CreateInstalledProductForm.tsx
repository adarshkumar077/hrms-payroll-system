"use client";

import { useRef, useState, useTransition } from "react";
import { createInstalledProductAction } from "./actions";
import { CustomFieldInputs, type CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export function CreateInstalledProductForm({
  accountOptions,
  productOptions,
  customFields,
}: {
  accountOptions: { id: string; name: string }[];
  productOptions: { id: string; name: string }[];
  customFields: CustomFieldSpec[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New Installed Product
      </button>
    );
  }

  function handleProductChange(productId: string) {
    if (!productId) return;
    // Autofill name from the picked product, but only when the operator
    // hasn't already typed a name of their own.
    if (name.trim()) return;
    const product = productOptions.find((p) => p.id === productId);
    if (product) setName(product.name);
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const result = await createInstalledProductAction(fd);
          // On success the action redirects to /installed — nothing else to do here.
          if (result?.error) {
            setError(result.error);
            return;
          }
          setError(null);
        })
      }
      className="card p-4 mb-6 grid grid-cols-1 md:grid-cols-3 gap-3"
    >
      {error && <div className="md:col-span-3 rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700">{error}</div>}
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
        <label className="label">Product</label>
        <select name="productId" className="input" defaultValue="" onChange={(e) => handleProductChange(e.target.value)}>
          <option value="">— None —</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Name *</label>
        <input name="name" required className="input" placeholder="AC Unit — 1.5T Split" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="label">Serial No</label>
        <input name="serialNo" className="input" placeholder="SN-00123" />
      </div>
      <div>
        <label className="label">Installed on</label>
        <input name="installedAt" type="date" className="input" />
      </div>
      <div>
        <label className="label">Warranty until</label>
        <input name="warrantyUntil" type="date" className="input" />
      </div>
      <div>
        <label className="label">Location</label>
        <input name="location" className="input" placeholder="2nd floor, server room" />
      </div>
      <CustomFieldInputs fields={customFields} />
      <div className="md:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Create"}
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
