"use client";

import { useRef, useState } from "react";

type ItemOpt = { id: string; name: string; sku: string | null; onHand: number; uom: string };

export function AdjustStockForm({
  action,
  items,
}: {
  action: (formData: FormData) => void;
  items: ItemOpt[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [dir, setDir] = useState<"in" | "out">("in");

  return (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-3">Adjust stock</div>
      <form
        ref={formRef}
        action={(fd) => {
          // Encode +/- direction into qty so the server records a signed StockMove.
          const mag = Math.abs(Number(fd.get("qty") || 0));
          fd.set("qty", String(dir === "out" ? -mag : mag));
          action(fd);
          formRef.current?.reset();
        }}
        className="grid gap-3 md:grid-cols-[2fr_auto_1fr_2fr_auto] md:items-end"
      >
        <div>
          <label className="label">Item</label>
          <select name="itemId" className="input" required defaultValue="">
            <option value="" disabled>
              Select an item…
            </option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.sku ? ` (${i.sku})` : ""} — {i.onHand} {i.uom}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Direction</label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setDir("in")}
              className={dir === "in" ? "btn" : "btn-ghost"}
            >
              + In
            </button>
            <button
              type="button"
              onClick={() => setDir("out")}
              className={dir === "out" ? "btn" : "btn-ghost"}
            >
              − Out
            </button>
          </div>
        </div>

        <div>
          <label className="label">Qty</label>
          <input name="qty" type="number" min="0" step="any" className="input" placeholder="0" required />
        </div>

        <div>
          <label className="label">Reason</label>
          <input name="reason" type="text" className="input" placeholder="e.g. Cycle count, Damage" />
        </div>

        <button type="submit" className="btn">
          Record
        </button>
      </form>
    </div>
  );
}
