// Pure quotation totals engine. NO db imports, NO React — safe to import from
// server actions, client components, and tests alike.
//
// ── Order of operations (documented, do not reorder without updating tests) ──
//   1. Per line: gross = qty * unitPrice; discountAmt = gross * discountPct%;
//      net = gross - discountAmt. `optional: true` lines are excluded from every
//      quote-level total (gross/discountAmt/net/taxAmt/total all report as 0 in
//      the roll-up) but their real numbers are still exposed via a `preview`
//      sub-object, so the UI can show "would cost ₹X" for optional add-ons
//      without them affecting the quoted price.
//   2. headerDiscount is an absolute ₹ amount (not a %), entered once on the
//      quotation header. It is clamped to [0, subtotal] — you cannot discount
//      more than the line items are worth — then spread proportionally across
//      the non-optional, non-zero-net lines by each line's share of subtotal.
//      This happens BEFORE tax, matching GST practice: a discount known at the
//      time of supply reduces the taxable value, so tax is charged on the
//      post-discount base, not the gross line price.
//   3. Tax is computed per line, at that line's own taxRate, on that line's
//      post-header-discount taxable base (mixed 5%/18% lines each keep their
//      own rate — there is no single "quote tax rate").
//   4. `charges` (e.g. freight/packing, entered once on the header) are taxed
//      separately at `chargesTaxRate` and added alongside the line items.
//   5. `adjustment` (round-off / goodwill / manual correction) is applied last,
//      untaxed, and may be negative.
//   6. grandTotal is rounded to 2dp. Because every intermediate amount (line
//      gross/discount/net/tax, header-discount allocation, charges, charges
//      tax) is already rounded to 2dp at the point it's produced, summing them
//      never re-introduces drift — grandTotal always equals the exact sum of
//      the rounded parts. `roundOff` exists to surface any residual float
//      error from summing already-2dp numbers (normally 0.00) rather than to
//      paper over a "round the raw sum" strategy, which we deliberately do not
//      use (that would make Σparts != grandTotal, which callers should be able
//      to rely on).
//
// Money helper: round only at the boundaries described above — never carry
// unrounded fractions across a line/quote boundary.
function r2(n: number): number {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return v === 0 ? 0 : v; // normalize -0 -> 0
}

export type LineInput = {
  qty?: number;
  unitPrice?: number;
  discountPct?: number;
  taxRate?: number;
  optional?: boolean;
};

export type LineComputed = {
  gross: number;
  discountAmt: number;
  net: number;
  taxAmt: number;
  total: number;
  optional: boolean;
  /** Present only when optional === true: the real (would-be) values, not rolled into any quote total. */
  preview?: {
    gross: number;
    discountAmt: number;
    net: number;
    taxAmt: number;
    total: number;
  };
};

/** Compute one line in isolation: gross -> per-line discount -> net -> tax on net -> total. */
export function computeLine(input: LineInput): LineComputed {
  const qty = input.qty ?? 0;
  const unitPrice = input.unitPrice ?? 0;
  const discountPct = input.discountPct ?? 0;
  const taxRate = input.taxRate ?? 0;
  const optional = !!input.optional;

  const gross = r2(qty * unitPrice);
  const discountAmt = r2(gross * (discountPct / 100));
  const net = r2(gross - discountAmt);
  const taxAmt = r2(net * (taxRate / 100));
  const total = r2(net + taxAmt);

  if (optional) {
    return {
      gross: 0,
      discountAmt: 0,
      net: 0,
      taxAmt: 0,
      total: 0,
      optional: true,
      preview: { gross, discountAmt, net, taxAmt, total },
    };
  }
  return { gross, discountAmt, net, taxAmt, total, optional: false };
}

export type QuoteInput = {
  lines: LineInput[];
  /** Absolute ₹ amount, clamped to [0, subtotal]. */
  headerDiscount?: number;
  charges?: number;
  chargesTaxRate?: number;
  /** Untaxed, applied last, may be negative. */
  adjustment?: number;
};

export type QuoteLineResult = LineComputed & {
  /** This line's share of the header discount (0 for optional / zero-net lines). */
  headerDiscountAlloc: number;
  /** net - headerDiscountAlloc: the base tax is actually charged on. */
  taxableBase: number;
  /** Tax on taxableBase at this line's own taxRate (post header-discount, so may differ from taxAmt). */
  tax: number;
  /** taxableBase + tax: this line's contribution to taxableTotal + taxTotal. */
  lineGrandTotal: number;
};

export type QuoteResult = {
  /** Sum of non-optional line nets, before header discount. */
  subtotal: number;
  /** Sum of non-optional per-line discount amounts. */
  lineDiscountTotal: number;
  /** Applied (clamped) header discount amount. */
  headerDiscount: number;
  /** subtotal - headerDiscount: the base GST is charged on. */
  taxableTotal: number;
  taxTotal: number;
  chargesTotal: number;
  chargesTax: number;
  adjustment: number;
  grandTotal: number;
  /** Residual float drift, if any, from summing already-rounded parts. Normally 0. */
  roundOff: number;
  lines: QuoteLineResult[];
};

/** Roll up a full quotation: per-line discount+tax, proportional header discount, charges, adjustment. */
export function computeQuote(input: QuoteInput): QuoteResult {
  const rawLines = input.lines ?? [];
  const headerDiscountInput = r2(input.headerDiscount ?? 0);
  const charges = r2(input.charges ?? 0);
  const chargesTaxRate = input.chargesTaxRate ?? 0;
  const adjustment = r2(input.adjustment ?? 0);

  // Step 1: per-line discount -> net (computeLine also handles optional zeroing/preview).
  const computed = rawLines.map((l) => computeLine(l));

  const subtotal = r2(computed.reduce((a, l) => a + l.net, 0));
  const lineDiscountTotal = r2(computed.reduce((a, l) => a + l.discountAmt, 0));

  // Step 2: header discount clamp + proportional allocation across non-optional,
  // non-zero-net lines, by each line's share of subtotal. The last eligible line
  // absorbs the rounding remainder so Σ allocations === appliedHeaderDiscount exactly.
  const appliedHeaderDiscount = Math.min(Math.max(headerDiscountInput, 0), subtotal);

  const eligible = computed.map((l, i) => i).filter((i) => !computed[i].optional && computed[i].net > 0);

  const allocByIndex = new Map<number, number>();
  let allocatedSoFar = 0;
  eligible.forEach((i, idx) => {
    const isLast = idx === eligible.length - 1;
    const alloc = isLast ? r2(appliedHeaderDiscount - allocatedSoFar) : r2(appliedHeaderDiscount * (computed[i].net / subtotal));
    allocByIndex.set(i, alloc);
    allocatedSoFar = r2(allocatedSoFar + alloc);
  });

  // Step 3: tax per line, on its post-header-discount taxable base, at its own rate.
  let taxableTotal = 0;
  let taxTotal = 0;
  const lines: QuoteLineResult[] = computed.map((l, i) => {
    const alloc = allocByIndex.get(i) ?? 0;
    const taxableBase = l.optional ? 0 : r2(l.net - alloc);
    const taxRate = rawLines[i]?.taxRate ?? 0;
    const tax = l.optional ? 0 : r2(taxableBase * (taxRate / 100));
    taxableTotal = r2(taxableTotal + taxableBase);
    taxTotal = r2(taxTotal + tax);
    return { ...l, headerDiscountAlloc: alloc, taxableBase, tax, lineGrandTotal: r2(taxableBase + tax) };
  });

  // Step 4: charges taxed separately at chargesTaxRate.
  const chargesTax = r2(charges * (chargesTaxRate / 100));

  // Step 5 + 6: adjustment applied last, untaxed, may be negative; final round + roundOff.
  const grandTotalRaw = taxableTotal + taxTotal + charges + chargesTax + adjustment;
  const grandTotal = r2(grandTotalRaw);
  const roundOff = r2(grandTotal - grandTotalRaw);

  return {
    subtotal,
    lineDiscountTotal,
    headerDiscount: appliedHeaderDiscount,
    taxableTotal,
    taxTotal,
    chargesTotal: charges,
    chargesTax,
    adjustment,
    grandTotal,
    roundOff,
    lines,
  };
}

/** A valid, all-zeroed QuoteInput — starting point for quote builders. */
export function emptyQuoteInput(): QuoteInput {
  return { lines: [], headerDiscount: 0, charges: 0, chargesTaxRate: 0, adjustment: 0 };
}
