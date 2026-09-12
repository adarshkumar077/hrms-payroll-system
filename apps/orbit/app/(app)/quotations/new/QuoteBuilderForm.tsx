"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createQuotationAction } from "../actions";
import { LineGrid, emptyLineRow, type LineRow, type ProductOption } from "../LineGrid";
import { QuoteTotalsPanel } from "../QuoteTotalsPanel";
import { computeQuote } from "@/lib/quote";
import { CustomFieldInputs, type CustomFieldSpec } from "@/components/studio/CustomFieldInputs";

type Term = { id: string; name: string; body: string; isDefault: boolean };

export function QuoteBuilderForm({
  accounts,
  contacts,
  products,
  termsTemplates,
  paymentTemplates,
  customFields,
}: {
  accounts: { id: string; name: string }[];
  contacts: { id: string; name: string; accountId: string | null }[];
  products: ProductOption[];
  termsTemplates: Term[];
  paymentTemplates: Term[];
  customFields: CustomFieldSpec[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [lines, setLines] = useState<LineRow[]>([emptyLineRow()]);
  const [headerDiscount, setHeaderDiscount] = useState(0);
  const [charges, setCharges] = useState(0);
  const [chargesLabel, setChargesLabel] = useState("Freight & Packing");
  const [chargesTaxRate, setChargesTaxRate] = useState(0);
  const [adjustment, setAdjustment] = useState(0);

  const defaultTerm = termsTemplates.find((t) => t.isDefault) ?? null;
  const defaultPayment = paymentTemplates.find((t) => t.isDefault) ?? null;
  const [termsSelId, setTermsSelId] = useState(defaultTerm?.id ?? "");
  const [paymentSelId, setPaymentSelId] = useState(defaultPayment?.id ?? "");
  const [termsText, setTermsText] = useState(defaultTerm?.body ?? "");
  const [paymentTermsText, setPaymentTermsText] = useState(defaultPayment?.body ?? "");

  const [billingAddress, setBillingAddress] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");

  const result = useMemo(
    () =>
      computeQuote({
        lines: lines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, taxRate: l.taxRate, optional: l.optional })),
        headerDiscount,
        charges,
        chargesTaxRate,
        adjustment,
      }),
    [lines, headerDiscount, charges, chargesTaxRate, adjustment]
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const validLines = lines.filter((l) => l.description.trim());
    if (validLines.length === 0) {
      setError("Add at least one line item with a description.");
      return;
    }

    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("headerDiscount", String(headerDiscount));
    fd.set("charges", String(charges));
    fd.set("chargesTaxRate", String(chargesTaxRate));
    fd.set("adjustment", String(adjustment));
    fd.set("linesJson", JSON.stringify(validLines));

    start(async () => {
      const res = await createQuotationAction(fd);
      if (res?.error) setError(res.error);
      // On success the action redirects — nothing else to do here.
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-lg text-sm px-3 py-2 bg-rose-50 text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Account *</label>
              <select name="accountId" required className="input" defaultValue="">
                <option value="" disabled>
                  Select an account…
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Contact</label>
              <select name="contactId" className="input" defaultValue="">
                <option value="">— None —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Valid until</label>
              <input name="validUntil" type="date" className="input" />
            </div>
            <CustomFieldInputs fields={customFields} />
          </div>

          <div className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Billing address</label>
              <textarea
                name="billingAddress"
                className="input"
                rows={3}
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label !mb-0">Shipping address</label>
                <button
                  type="button"
                  className="text-xs text-brand-700 hover:underline"
                  onClick={() => setShippingAddress(billingAddress)}
                >
                  Copy billing →
                </button>
              </div>
              <textarea
                name="shippingAddress"
                className="input mt-1"
                rows={3}
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="card p-4">
            <div className="font-semibold text-slate-800 mb-3">Line items</div>
            <LineGrid rows={lines} onChange={setLines} products={products} />
          </div>

          <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Header discount (₹)</label>
              <input
                type="number"
                min={0}
                step="any"
                className="input"
                value={headerDiscount}
                onChange={(e) => setHeaderDiscount(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label">Charges (₹)</label>
              <input
                type="number"
                min={0}
                step="any"
                className="input"
                value={charges}
                onChange={(e) => setCharges(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label">Charges label</label>
              <input name="chargesLabel" className="input" value={chargesLabel} onChange={(e) => setChargesLabel(e.target.value)} />
            </div>
            <div>
              <label className="label">Charges tax %</label>
              <input
                type="number"
                min={0}
                step="any"
                className="input"
                value={chargesTaxRate}
                onChange={(e) => setChargesTaxRate(Number(e.target.value) || 0)}
              />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="label">Adjustment (₹, may be negative)</label>
              <input
                type="number"
                step="any"
                className="input max-w-xs"
                value={adjustment}
                onChange={(e) => setAdjustment(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Terms & conditions</label>
                <select
                  className="input py-1 text-xs w-auto"
                  value={termsSelId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTermsSelId(id);
                    const t = termsTemplates.find((tt) => tt.id === id);
                    if (t) setTermsText(t.body);
                  }}
                >
                  <option value="">— Blank —</option>
                  {termsTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea name="termsText" className="input" rows={4} value={termsText} onChange={(e) => setTermsText(e.target.value)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Payment terms</label>
                <select
                  className="input py-1 text-xs w-auto"
                  value={paymentSelId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPaymentSelId(id);
                    const t = paymentTemplates.find((tt) => tt.id === id);
                    if (t) setPaymentTermsText(t.body);
                  }}
                >
                  <option value="">— Blank —</option>
                  {paymentTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                name="paymentTermsText"
                className="input"
                rows={4}
                value={paymentTermsText}
                onChange={(e) => setPaymentTermsText(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <QuoteTotalsPanel result={result} chargesLabel={chargesLabel} />
          <button type="submit" className="btn w-full" disabled={pending}>
            {pending ? "Creating…" : "Create quotation"}
          </button>
        </div>
      </div>
    </form>
  );
}
