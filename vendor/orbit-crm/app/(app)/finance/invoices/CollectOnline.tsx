"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInvoiceOrderAction, type InvoiceOrderResult } from "./actions";

// Loaded lazily and only once — subsequent clicks reuse the same <script>.
const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadCheckoutScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay checkout")));
      return;
    }
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout"));
    document.body.appendChild(script);
  });
}

export function CollectOnline({ invoiceId, number }: { invoiceId: string; number: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<InvoiceOrderResult | null>(null);
  const [status, setStatus] = useState<"idle" | "awaiting-webhook" | "dismissed">("idle");

  function openCheckout(order: Extract<InvoiceOrderResult, { ok: true }>) {
    loadCheckoutScript()
      .then(() => {
        if (!window.Razorpay) throw new Error("Razorpay checkout unavailable");
        const rzp = new window.Razorpay({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amountPaise,
          currency: order.currency,
          name: "Orbit",
          description: `Invoice ${number}`,
          // The customer completing checkout here does NOT settle the invoice —
          // only the verified webhook (app/api/webhooks/razorpay/route.ts) does
          // that, after confirming Razorpay's signature server-side.
          handler: () => {
            setStatus("awaiting-webhook");
            setTimeout(() => router.refresh(), 3000);
          },
          modal: {
            ondismiss: () => setStatus("dismissed"),
          },
        });
        rzp.open();
      })
      .catch((err) => {
        console.error(err);
        setResult({ ok: false, error: "Could not load Razorpay checkout. Please try again." });
      });
  }

  function handleClick() {
    setStatus("idle");
    start(async () => {
      const r = await createInvoiceOrderAction(invoiceId);
      setResult(r);
      if (r.ok && r.mode === "live") openCheckout(r);
    });
  }

  return (
    <div className="space-y-2">
      <button className="btn text-xs py-1" disabled={pending} onClick={handleClick}>
        {pending ? "…" : "Collect online (Razorpay)"}
      </button>

      {result && !result.ok && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {result.error}
        </div>
      )}

      {result && result.ok && result.mode === "mock" && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <div className="font-semibold">Razorpay not configured — mock order created</div>
          <div className="mt-0.5 font-mono break-all">{result.orderId}</div>
          <p className="mt-1 text-blue-700">
            In live mode the customer pays via Razorpay Checkout and the verified webhook marks this invoice Paid
            automatically.
          </p>
        </div>
      )}

      {result && result.ok && result.mode === "live" && status === "awaiting-webhook" && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Payment received — awaiting webhook confirmation…
        </div>
      )}

      {result && result.ok && result.mode === "live" && status === "dismissed" && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Checkout closed — no payment made.
        </div>
      )}
    </div>
  );
}
