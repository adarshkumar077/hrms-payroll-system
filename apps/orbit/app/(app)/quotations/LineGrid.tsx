"use client";

/**
 * Orbit Studio — quotation line-item grid (Wave B).
 *
 * Shared, presentational-but-interactive editor for a QuotationLine[]
 * working set. Used by both `new/QuoteBuilderForm.tsx` (create) and
 * `[id]/EditLinesSection.tsx` (line editing v1) — kept here (not under
 * components/quotations/) so it never collides with the parallel
 * ConvertToInvoice build, which owns that directory.
 *
 * Controlled from the parent: the parent owns `rows` state and passes an
 * `onChange` — this component never has its own state, so both callers can
 * feed the same rows straight into lib/quote.ts's computeQuote() for a live
 * totals preview.
 */

export type LineRow = {
  key: string;
  productId: string;
  description: string;
  qty: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
  uom: string;
  optional: boolean;
};

export type ProductOption = { id: string; name: string; unitPrice: number; taxRate: number };

let seq = 0;
/** Stable-enough React key generator — no crypto.randomUUID dependency needed. */
function newKey(): string {
  seq += 1;
  return `line-${Date.now()}-${seq}`;
}

export function emptyLineRow(defaultTaxRate = 18): LineRow {
  return {
    key: newKey(),
    productId: "",
    description: "",
    qty: 1,
    unitPrice: 0,
    discountPct: 0,
    taxRate: defaultTaxRate,
    uom: "",
    optional: false,
  };
}

export function LineGrid({
  rows,
  onChange,
  products,
}: {
  rows: LineRow[];
  onChange: (rows: LineRow[]) => void;
  products: ProductOption[];
}) {
  function patch(i: number, changes: Partial<LineRow>) {
    const next = rows.slice();
    next[i] = { ...next[i], ...changes };
    onChange(next);
  }

  function pickProduct(i: number, productId: string) {
    const p = products.find((pp) => pp.id === productId);
    if (!p) {
      patch(i, { productId });
      return;
    }
    // Autofill description/unitPrice/taxRate from the product master. Product
    // has no `uom` column (checked prisma/schema.prisma) so uom is never
    // autofilled — left for the user to type per-line.
    patch(i, {
      productId,
      description: rows[i].description || p.name,
      unitPrice: p.unitPrice,
      taxRate: p.taxRate,
    });
  }

  function addRow() {
    onChange([...rows, emptyLineRow()]);
  }

  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="th">Product</th>
            <th className="th">Description</th>
            <th className="th text-right">Qty</th>
            <th className="th">UoM</th>
            <th className="th text-right">Unit Price</th>
            <th className="th text-right">Disc %</th>
            <th className="th text-right">Tax %</th>
            <th className="th text-center">Optional</th>
            <th className="th"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={r.optional ? "opacity-60" : undefined}>
              <td className="td">
                <select
                  className="input py-1 text-xs min-w-[130px]"
                  value={r.productId}
                  onChange={(e) => pickProduct(i, e.target.value)}
                >
                  <option value="">— Custom —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="td">
                <input
                  className="input py-1 text-xs min-w-[160px]"
                  value={r.description}
                  onChange={(e) => patch(i, { description: e.target.value })}
                  placeholder="Line description"
                />
              </td>
              <td className="td">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="input py-1 text-xs w-20 text-right"
                  value={r.qty}
                  onChange={(e) => patch(i, { qty: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="td">
                <input
                  className="input py-1 text-xs w-16"
                  value={r.uom}
                  onChange={(e) => patch(i, { uom: e.target.value })}
                  placeholder="pcs"
                />
              </td>
              <td className="td">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="input py-1 text-xs w-24 text-right"
                  value={r.unitPrice}
                  onChange={(e) => patch(i, { unitPrice: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="td">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  className="input py-1 text-xs w-16 text-right"
                  value={r.discountPct}
                  onChange={(e) => patch(i, { discountPct: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="td">
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="input py-1 text-xs w-16 text-right"
                  value={r.taxRate}
                  onChange={(e) => patch(i, { taxRate: Number(e.target.value) || 0 })}
                />
              </td>
              <td className="td text-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={r.optional}
                  onChange={(e) => patch(i, { optional: e.target.checked })}
                />
              </td>
              <td className="td">
                <button
                  type="button"
                  className="btn-ghost text-xs py-1 px-2 text-rose-600"
                  onClick={() => removeRow(i)}
                  disabled={rows.length <= 1}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn-ghost text-xs mt-2" onClick={addRow}>
        + Add line
      </button>
    </div>
  );
}
