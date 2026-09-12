"use client";

import { useRef, useState, useTransition } from "react";
import { createProductAction } from "./actions";
import { CustomFieldInputs, type CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

export function CreateProductForm({ customFields }: { customFields: CustomFieldSpec[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        + New Product
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          const result = await createProductAction(fd);
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
        <input name="name" required className="input" placeholder="Ceramic Coating 1L" />
      </div>
      <div>
        <label className="label">SKU</label>
        <input name="sku" className="input" placeholder="CC-1L-001" />
      </div>
      <div>
        <label className="label">HSN</label>
        <input name="hsn" className="input" placeholder="3208" />
      </div>
      <div>
        <label className="label">Unit price (₹)</label>
        <input name="unitPrice" type="number" min={0} step="0.01" className="input" placeholder="1500" />
      </div>
      <div>
        <label className="label">Tax rate (%)</label>
        <input name="taxRate" type="number" min={0} max={28} step="0.01" className="input" defaultValue={18} />
      </div>
      <CustomFieldInputs fields={customFields} />
      <div className="md:col-span-3 flex items-center gap-2">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Create product"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
