import { inr } from "@/lib/format";
import type { QuoteResult } from "@/lib/quote";

/**
 * Orbit Studio — quotation totals display (Wave B).
 *
 * Pure presentational component (no "use client" — no hooks, no browser-only
 * APIs) so it renders identically whether it's fed a live client-side
 * computeQuote() result (QuoteBuilderForm / EditLinesSection) or a
 * server-computed one (the detail page's read-only panel).
 */
export function QuoteTotalsPanel({
  result,
  chargesLabel,
  title = "Totals",
}: {
  result: QuoteResult;
  chargesLabel?: string;
  title?: string;
}) {
  return (
    <div className="card p-4">
      <div className="font-semibold text-slate-800 mb-3">{title}</div>
      <dl className="space-y-1.5 text-sm">
        <Row label="Subtotal (line items)" value={inr(result.subtotal)} />
        <Row label="Line discounts" value={result.lineDiscountTotal > 0 ? `− ${inr(result.lineDiscountTotal)}` : inr(0)} />
        <Row label="Header discount" value={result.headerDiscount > 0 ? `− ${inr(result.headerDiscount)}` : inr(0)} />
        <Row label="Taxable value" value={inr(result.taxableTotal)} />
        <Row label="Tax" value={inr(result.taxTotal)} />
        <Row label={chargesLabel ? `Charges — ${chargesLabel}` : "Charges"} value={inr(result.chargesTotal)} />
        <Row label="Charges tax" value={inr(result.chargesTax)} />
        <Row label="Adjustment" value={result.adjustment !== 0 ? inr(result.adjustment) : inr(0)} />
        {result.roundOff !== 0 && <Row label="Round off" value={inr(result.roundOff)} />}
        <div className="border-t border-slate-100 pt-2 mt-2 flex items-center justify-between">
          <span className="font-semibold text-slate-800">Grand Total</span>
          <span className="font-bold text-lg text-slate-900">{inr(result.grandTotal)}</span>
        </div>
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{value}</dd>
    </div>
  );
}
