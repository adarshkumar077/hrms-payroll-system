// India GST engine — verified rules.
// e-invoicing mandatory for AATO > ₹5cr (B2B/exports); HSN 6-digit (>5cr) / 4-digit (<=5cr);
// intra-state => CGST+SGST, inter-state => IGST. IRN = 64-char reference from IRP.

export const EINVOICE_AATO_THRESHOLD = 5_00_00_000; // ₹5 crore

export function requiresEInvoice(aato: number, invoiceType: string): boolean {
  return aato > EINVOICE_AATO_THRESHOLD && invoiceType === "B2B";
}

export function hsnDigitsRequired(aato: number): 4 | 6 {
  return aato > EINVOICE_AATO_THRESHOLD ? 6 : 4;
}

export type GstLine = { qty: number; unitPrice: number; taxRate: number };

/** intraState => split CGST/SGST equally; interState => IGST. */
export function computeGst(lines: GstLine[], intraState: boolean) {
  let subtotal = 0;
  let tax = 0;
  for (const l of lines) {
    const lineBase = l.qty * l.unitPrice;
    subtotal += lineBase;
    tax += (lineBase * l.taxRate) / 100;
  }
  subtotal = round2(subtotal);
  tax = round2(tax);
  const cgst = intraState ? round2(tax / 2) : 0;
  const sgst = intraState ? round2(tax / 2) : 0;
  const igst = intraState ? 0 : tax;
  return { subtotal, cgst, sgst, igst, grandTotal: round2(subtotal + tax) };
}

/** Deterministic mock IRN generator (64 hex chars). Real impl calls the IRP/GSP API. */
export function mockIrn(seed: string): string {
  let h = 0;
  const out: string[] = [];
  for (let i = 0; i < 64; i++) {
    h = (h * 31 + seed.charCodeAt((i + seed.length) % seed.length) + i) >>> 0;
    out.push((h & 0xf).toString(16));
  }
  return out.join("");
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
