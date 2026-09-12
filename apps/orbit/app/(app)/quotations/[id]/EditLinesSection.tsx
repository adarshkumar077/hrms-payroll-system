"use client";

import { useMemo, useState, useTransition } from "react";
import { computeQuote } from "@/lib/quote";
import { LineGrid, emptyLineRow, type LineRow, type ProductOption } from "../LineGrid";
import { QuoteTotalsPanel } from "../QuoteTotalsPanel";
import { updateQuotationLinesAction } from "../actions";

/**
 * "Edit lines" v1 — replace-all editor. Only line rows are editable here;
 * headerDiscount/charges/chargesTaxRate/adjustment are passed in read-only
 * from the current quotation (updateQuotationLinesAction recomputes totals
 * against those same stored values — see the comment there for why).
 */
export function EditLinesSection({
  quotationId,
  initialRows,
  products,
  headerDiscount,
  charges,
  chargesLabel,
  chargesTaxRate,
  adjustment,
  locked = false,
  lockedReason,
}: {
  quotationId: string;
  initialRows: LineRow[];
  products: ProductOption[];
  headerDiscount: number;
  charges: number;
  chargesLabel: string | null;
  chargesTaxRate: number;
  adjustment: number;
  /** convertedInvoiceId set, or stage in the won/lost category — see ../actions.ts's lock rule comment. */
  locked?: boolean;
  lockedReason?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<LineRow[]>(initialRows.length ? initialRows : [emptyLineRow()]);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(
    () =>
      computeQuote({
        lines: rows.map((r) => ({ qty: r.qty, unitPrice: r.unitPrice, discountPct: r.discountPct, taxRate: r.taxRate, optional: r.optional })),
        headerDiscount,
        charges,
        chargesTaxRate,
        adjustment,
      }),
    [rows, headerDiscount, charges, chargesTaxRate, adjustment]
  );

  if (locked) {
    return (
      <div className="card p-4 text-sm text-slate-400">{lockedReason || "Line editing is locked for this quotation."}</div>
    );
  }

  if (!editing) {
    return (
      <div className="card p-4 flex items-center justify-between">
        <span className="text-sm text-slate-500">Modify quantities, add or remove line items.</span>
        <button type="button" className="btn-ghost text-xs" onClick={() => setEditing(true)}>
          Edit lines
        </button>
      </div>
    );
  }

  function save() {
    const validRows = rows.filter((r) => r.description.trim());
    if (validRows.length === 0) {
      setError("Add at least one line item with a description.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("linesJson", JSON.stringify(validRows));
    start(async () => {
      const res = await updateQuotationLinesAction(quotationId, fd);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  function cancel() {
    setRows(initialRows.length ? initialRows : [emptyLineRow()]);
    setError(null);
    setEditing(false);
  }

  return (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-3">Edit lines</div>
      {error && <div className="rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700 mb-2">{error}</div>}
      <LineGrid rows={rows} onChange={setRows} products={products} />
      <div className="mt-3 max-w-sm">
        <QuoteTotalsPanel result={result} chargesLabel={chargesLabel ?? undefined} title="Preview totals" />
      </div>
      <div className="flex items-center gap-2 mt-3">
        <button type="button" className="btn text-sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save lines"}
        </button>
        <button type="button" className="btn-ghost text-sm" disabled={pending} onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
