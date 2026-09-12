import { describe, it, expect } from "vitest";
import { computeLine, computeQuote, emptyQuoteInput, type LineInput } from "@/lib/quote";

describe("computeLine", () => {
  it("computes gross/net/tax for a plain line with no discount", () => {
    const r = computeLine({ qty: 2, unitPrice: 500, taxRate: 18 });
    expect(r).toEqual({ gross: 1000, discountAmt: 0, net: 1000, taxAmt: 180, total: 1180, optional: false });
  });

  it("applies discount off gross, then taxes the discounted net (not the gross)", () => {
    const r = computeLine({ qty: 1, unitPrice: 1000, discountPct: 10, taxRate: 18 });
    // gross 1000, discount 100 -> net 900, tax is 18% of 900 = 162, not 18% of 1000.
    expect(r).toEqual({ gross: 1000, discountAmt: 100, net: 900, taxAmt: 162, total: 1062, optional: false });
  });

  it("a 100% discount zeroes net, tax, and total but keeps gross/discountAmt visible", () => {
    const r = computeLine({ qty: 1, unitPrice: 1000, discountPct: 100, taxRate: 18 });
    expect(r).toEqual({ gross: 1000, discountAmt: 1000, net: 0, taxAmt: 0, total: 0, optional: false });
  });

  it("a qty:0 line is all zeros", () => {
    const r = computeLine({ qty: 0, unitPrice: 1000, taxRate: 18 });
    expect(r).toEqual({ gross: 0, discountAmt: 0, net: 0, taxAmt: 0, total: 0, optional: false });
  });

  it("an optional line reports zeros at the top level but exposes real numbers under preview", () => {
    const r = computeLine({ qty: 1, unitPrice: 1000, taxRate: 18, optional: true });
    expect(r).toEqual({
      gross: 0,
      discountAmt: 0,
      net: 0,
      taxAmt: 0,
      total: 0,
      optional: true,
      preview: { gross: 1000, discountAmt: 0, net: 1000, taxAmt: 180, total: 1180 },
    });
  });

  it("missing/undefined fields default to 0 (safe for partially-filled builder rows)", () => {
    const r = computeLine({});
    expect(r).toEqual({ gross: 0, discountAmt: 0, net: 0, taxAmt: 0, total: 0, optional: false });
  });
});

describe("emptyQuoteInput", () => {
  it("returns a valid zeroed input that computeQuote resolves to an all-zero result", () => {
    const input = emptyQuoteInput();
    expect(input).toEqual({ lines: [], headerDiscount: 0, charges: 0, chargesTaxRate: 0, adjustment: 0 });
    const result = computeQuote(input);
    expect(result).toEqual({
      subtotal: 0,
      lineDiscountTotal: 0,
      headerDiscount: 0,
      taxableTotal: 0,
      taxTotal: 0,
      chargesTotal: 0,
      chargesTax: 0,
      adjustment: 0,
      grandTotal: 0,
      roundOff: 0,
      lines: [],
    });
  });
});

// ── computeQuote edge cases ──────────────────────────────────────────────
// Each case below documents: setup -> hand-computed expectation -> what it proves.
describe("computeQuote", () => {
  it("1. zero lines -> everything zero", () => {
    const r = computeQuote({ lines: [] });
    expect(r.subtotal).toBe(0);
    expect(r.taxableTotal).toBe(0);
    expect(r.taxTotal).toBe(0);
    expect(r.grandTotal).toBe(0);
    expect(r.lines).toEqual([]);
  });

  it("2. single line, no discounts, no charges/adjustment", () => {
    const r = computeQuote({ lines: [{ qty: 2, unitPrice: 500, taxRate: 18 }] });
    expect(r.subtotal).toBe(1000);
    expect(r.taxableTotal).toBe(1000);
    expect(r.taxTotal).toBe(180);
    expect(r.grandTotal).toBe(1180);
    expect(r.lines[0]).toMatchObject({ net: 1000, taxableBase: 1000, tax: 180, lineGrandTotal: 1180 });
  });

  it("3. per-line discount reduces subtotal and the taxable base together", () => {
    const r = computeQuote({ lines: [{ qty: 1, unitPrice: 1000, discountPct: 10, taxRate: 18 }] });
    expect(r.subtotal).toBe(900);
    expect(r.lineDiscountTotal).toBe(100);
    expect(r.taxableTotal).toBe(900);
    expect(r.taxTotal).toBe(162);
    expect(r.grandTotal).toBe(1062);
  });

  it("4. header discount spreads proportionally across mixed 5%/18% lines before tax", () => {
    const lines: LineInput[] = [
      { qty: 1, unitPrice: 1000, taxRate: 5 },
      { qty: 1, unitPrice: 1000, taxRate: 18 },
    ];
    const r = computeQuote({ lines, headerDiscount: 300 });
    expect(r.subtotal).toBe(2000);
    expect(r.headerDiscount).toBe(300);
    // Equal nets (1000 each) -> discount splits 50/50 = 150 each.
    expect(r.lines[0]).toMatchObject({ headerDiscountAlloc: 150, taxableBase: 850, tax: 42.5, lineGrandTotal: 892.5 });
    expect(r.lines[1]).toMatchObject({ headerDiscountAlloc: 150, taxableBase: 850, tax: 153, lineGrandTotal: 1003 });
    expect(r.taxableTotal).toBe(1700);
    expect(r.taxTotal).toBe(195.5);
    expect(r.grandTotal).toBe(1895.5);
  });

  it("4b. header discount allocation is proportional (not equal-split) for uneven line values", () => {
    const lines: LineInput[] = [
      { qty: 1, unitPrice: 3000, taxRate: 5 }, // net 3000, 75% of subtotal
      { qty: 1, unitPrice: 1000, taxRate: 18 }, // net 1000, 25% of subtotal
    ];
    const r = computeQuote({ lines, headerDiscount: 400 });
    expect(r.subtotal).toBe(4000);
    expect(r.lines[0]).toMatchObject({ headerDiscountAlloc: 300, taxableBase: 2700, tax: 135 });
    expect(r.lines[1]).toMatchObject({ headerDiscountAlloc: 100, taxableBase: 900, tax: 162 });
    expect(r.taxableTotal).toBe(3600);
    expect(r.taxTotal).toBe(297);
    expect(r.grandTotal).toBe(3897);
  });

  it("5. optional line is excluded from every total but keeps its preview values", () => {
    const lines: LineInput[] = [
      { qty: 1, unitPrice: 1000, taxRate: 18, optional: true },
      { qty: 1, unitPrice: 500, taxRate: 18 },
    ];
    const r = computeQuote({ lines });
    expect(r.subtotal).toBe(500);
    expect(r.taxableTotal).toBe(500);
    expect(r.taxTotal).toBe(90);
    expect(r.grandTotal).toBe(590);
    expect(r.lines[0]).toMatchObject({
      optional: true,
      net: 0,
      taxableBase: 0,
      tax: 0,
      preview: { gross: 1000, discountAmt: 0, net: 1000, taxAmt: 180, total: 1180 },
    });
  });

  it("5b. an all-optional quote totals zero but every line still carries a preview", () => {
    const lines: LineInput[] = [
      { qty: 1, unitPrice: 1000, taxRate: 18, optional: true },
      { qty: 2, unitPrice: 250, taxRate: 5, optional: true },
    ];
    const r = computeQuote({ lines });
    expect(r.grandTotal).toBe(0);
    expect(r.subtotal).toBe(0);
    expect(r.lines[0].preview).toEqual({ gross: 1000, discountAmt: 0, net: 1000, taxAmt: 180, total: 1180 });
    expect(r.lines[1].preview).toEqual({ gross: 500, discountAmt: 0, net: 500, taxAmt: 25, total: 525 });
  });

  it("6. charges are taxed separately at chargesTaxRate", () => {
    const r = computeQuote({
      lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }],
      charges: 200,
      chargesTaxRate: 18,
    });
    expect(r.chargesTotal).toBe(200);
    expect(r.chargesTax).toBe(36);
    expect(r.grandTotal).toBe(1416); // 1000 + 180 + 200 + 36
  });

  it("7. charges with no chargesTaxRate are added untaxed", () => {
    const r = computeQuote({ lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }], charges: 200 });
    expect(r.chargesTotal).toBe(200);
    expect(r.chargesTax).toBe(0);
    expect(r.grandTotal).toBe(1380); // 1000 + 180 + 200
  });

  it("8. a negative adjustment reduces grandTotal and can be below the taxed subtotal", () => {
    const r = computeQuote({ lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }], adjustment: -50 });
    expect(r.adjustment).toBe(-50);
    expect(r.grandTotal).toBe(1130); // 1000 + 180 - 50
  });

  it("9. rounding drift: 3x qty1 @33.333 rounds per-line, and grandTotal equals the exact sum of the rounded line totals", () => {
    const lines: LineInput[] = [
      { qty: 1, unitPrice: 33.333 },
      { qty: 1, unitPrice: 33.333 },
      { qty: 1, unitPrice: 33.333 },
    ];
    const r = computeQuote({ lines });
    // Each line rounds to 33.33 (not 33.333...), so the quote settles at 99.99 -
    // NOT 100.00 (which is what round(raw sum) would give). This is deliberate:
    // we round at the line boundary and never re-round a raw unrounded sum.
    expect(r.lines.map((l) => l.lineGrandTotal)).toEqual([33.33, 33.33, 33.33]);
    const sumOfParts = r.lines.reduce((a, l) => a + l.lineGrandTotal, 0);
    expect(r.grandTotal).toBe(99.99);
    expect(r.grandTotal).toBe(sumOfParts);
    expect(r.roundOff).toBe(0);
  });

  it("10. a qty:0 line contributes nothing", () => {
    const r = computeQuote({ lines: [{ qty: 0, unitPrice: 1000, taxRate: 18 }] });
    expect(r.subtotal).toBe(0);
    expect(r.taxableTotal).toBe(0);
    expect(r.taxTotal).toBe(0);
    expect(r.grandTotal).toBe(0);
  });

  it("11. a 100%-discounted line has zero net and is excluded from header-discount allocation", () => {
    const r = computeQuote({ lines: [{ qty: 1, unitPrice: 1000, discountPct: 100, taxRate: 18 }], headerDiscount: 50 });
    expect(r.subtotal).toBe(0);
    expect(r.lineDiscountTotal).toBe(1000);
    // headerDiscount clamps to subtotal (0), so nothing is actually applied.
    expect(r.headerDiscount).toBe(0);
    expect(r.taxableTotal).toBe(0);
    expect(r.taxTotal).toBe(0);
    expect(r.grandTotal).toBe(0);
  });

  it("12. header discount larger than subtotal clamps to subtotal (cannot discount past zero)", () => {
    const r = computeQuote({ lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }], headerDiscount: 5000 });
    expect(r.headerDiscount).toBe(1000); // clamped from 5000
    expect(r.taxableTotal).toBe(0);
    expect(r.taxTotal).toBe(0);
    expect(r.grandTotal).toBe(0);
  });

  it("13. header discount is applied on top of an already per-line-discounted net", () => {
    const r = computeQuote({
      lines: [{ qty: 1, unitPrice: 1000, discountPct: 10, taxRate: 18 }],
      headerDiscount: 90,
    });
    // net after 10% line discount = 900; header discount of 90 further reduces the taxable base to 810.
    expect(r.subtotal).toBe(900);
    expect(r.headerDiscount).toBe(90);
    expect(r.lines[0].taxableBase).toBe(810);
    expect(r.taxTotal).toBe(145.8); // 18% of 810
    expect(r.grandTotal).toBe(955.8);
  });

  it("14. negative headerDiscount input is clamped to 0, not treated as a surcharge", () => {
    const r = computeQuote({ lines: [{ qty: 1, unitPrice: 1000, taxRate: 18 }], headerDiscount: -100 });
    expect(r.headerDiscount).toBe(0);
    expect(r.taxableTotal).toBe(1000);
    expect(r.grandTotal).toBe(1180);
  });

  it("15. combines header discount, charges, chargesTax, and a negative adjustment in one quote", () => {
    const lines: LineInput[] = [
      { qty: 2, unitPrice: 1000, taxRate: 18 }, // net 2000
      { qty: 1, unitPrice: 500, taxRate: 5 }, // net 500
    ];
    const r = computeQuote({ lines, headerDiscount: 250, charges: 100, chargesTaxRate: 18, adjustment: -20 });
    expect(r.subtotal).toBe(2500);
    expect(r.headerDiscount).toBe(250);
    // line0 share 2000/2500=0.8 -> alloc 200; line1 gets remainder -> alloc 50
    expect(r.lines[0].headerDiscountAlloc).toBe(200);
    expect(r.lines[1].headerDiscountAlloc).toBe(50);
    expect(r.lines[0].taxableBase).toBe(1800);
    expect(r.lines[1].taxableBase).toBe(450);
    expect(r.lines[0].tax).toBe(324); // 18% of 1800
    expect(r.lines[1].tax).toBe(22.5); // 5% of 450
    expect(r.taxableTotal).toBe(2250);
    expect(r.taxTotal).toBe(346.5);
    expect(r.chargesTotal).toBe(100);
    expect(r.chargesTax).toBe(18);
    expect(r.adjustment).toBe(-20);
    // 2250 + 346.5 + 100 + 18 - 20 = 2694.5
    expect(r.grandTotal).toBe(2694.5);
  });

  it("16. mixes an optional line with real, discounted, and header-discounted lines", () => {
    const lines: LineInput[] = [
      { qty: 1, unitPrice: 5000, taxRate: 18, optional: true }, // excluded entirely
      { qty: 1, unitPrice: 1000, discountPct: 20, taxRate: 18 }, // net 800
      { qty: 1, unitPrice: 1000, taxRate: 5 }, // net 1000
    ];
    const r = computeQuote({ lines, headerDiscount: 180 });
    expect(r.subtotal).toBe(1800); // optional line excluded
    expect(r.lineDiscountTotal).toBe(200);
    expect(r.headerDiscount).toBe(180);
    // shares: 800/1800 and 1000/1800
    expect(r.lines[1].headerDiscountAlloc).toBe(80);
    expect(r.lines[2].headerDiscountAlloc).toBe(100);
    expect(r.lines[1].taxableBase).toBe(720);
    expect(r.lines[2].taxableBase).toBe(900);
    expect(r.lines[0]).toMatchObject({ optional: true, taxableBase: 0, tax: 0 });
    // taxableTotal 1620 + taxTotal (129.6 + 45 = 174.6) = 1794.6
    expect(r.grandTotal).toBe(1794.6);
  });
});
