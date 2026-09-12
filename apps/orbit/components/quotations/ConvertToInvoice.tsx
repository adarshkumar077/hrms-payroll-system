"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { convertQuotationToInvoiceAction } from "@/app/(app)/quotations/convert-actions";

// Contract note: imported by the quotation detail page (a parallel build) —
// keep this default export + prop shape stable.
export default function ConvertToInvoice({
  quotationId,
  stageCategory,
  converted,
  invoiceId,
}: {
  quotationId: string;
  stageCategory: string;
  converted: boolean;
  invoiceId?: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (converted) {
    return (
      <Link href={invoiceId ? `/finance/invoices/${invoiceId}` : "/finance/invoices"} className="btn-ghost text-xs py-1">
        View invoice →
      </Link>
    );
  }

  if (stageCategory !== "won") {
    return (
      <button className="btn-ghost text-xs py-1 text-slate-400" disabled title="Move stage to Accepted to convert">
        Convert to Invoice
      </button>
    );
  }

  return (
    <div>
      <button
        className="btn text-xs py-1"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const result = await convertQuotationToInvoiceAction(quotationId);
            if ("error" in result) setError(result.error);
          });
        }}
      >
        {pending ? "Converting…" : "Convert to Invoice"}
      </button>
      {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
    </div>
  );
}
