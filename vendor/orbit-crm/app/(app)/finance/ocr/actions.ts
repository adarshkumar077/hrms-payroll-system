"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { extractInvoice, type ExtractedBill } from "@/lib/ocr";

// Runs the vision OCR extraction. No DB write — just returns the suggestion for the
// human to review/edit in the form.
export async function extractAction(dataUrl: string): Promise<ExtractedBill> {
  await requireSession(); // ensure only authenticated users can spend OCR calls
  return extractInvoice(dataUrl);
}

// Saves the human-confirmed (possibly edited) fields as a Draft vendor bill.
// Never posts journals here — that happens on approval in /finance/bills.
// Named `...FromOcr` to disambiguate from the unrelated `createBillAction` in
// app/(app)/finance/bills/actions.ts (manual bill entry) — see GAPS.md #10.
export async function createBillFromOcrAction(formData: FormData): Promise<void> {
  const s = await requireSession();

  const vendor = String(formData.get("vendor") || "").trim();
  const gstin = String(formData.get("gstin") || "").trim() || null;
  const billNumber = String(formData.get("billNumber") || "").trim();
  const dateRaw = String(formData.get("date") || "").trim();
  const date = dateRaw && !isNaN(new Date(dateRaw).getTime()) ? new Date(dateRaw) : new Date();
  const subtotal = num(formData.get("subtotal"));
  const tax = num(formData.get("tax"));
  const total = num(formData.get("total"));

  const descriptions = formData.getAll("line_description").map(String);
  const hsns = formData.getAll("line_hsn").map(String);
  const qtys = formData.getAll("line_qty").map(String);
  const unitPrices = formData.getAll("line_unitPrice").map(String);
  const taxRates = formData.getAll("line_taxRate").map(String);
  const lineTotals = formData.getAll("line_lineTotal").map(String);

  const lines = descriptions
    .map((description, i) => ({
      description: description.trim(),
      hsn: hsns[i]?.trim() || null,
      qty: num(qtys[i]),
      unitPrice: num(unitPrices[i]),
      taxRate: num(taxRates[i]),
      lineTotal: num(lineTotals[i]),
    }))
    .filter((l) => l.description); // drop empty rows

  if (!vendor || !billNumber) return; // minimal validity guard — form requires these fields

  const bill = await db.vendorBill.create({
    data: {
      tenantId: s.tenantId,
      vendor,
      gstin,
      billNumber,
      date,
      subtotal,
      tax,
      total,
      status: "Draft",
      source: "ocr",
      lines: { create: lines },
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "vendorbill.created",
    entity: "VendorBill",
    entityId: bill.id,
    actorId: s.userId,
    payload: { vendor: bill.vendor, billNumber: bill.billNumber, total: bill.total, source: "ocr" },
  });

  redirect("/finance/bills");
}

function num(v: FormDataEntryValue | string | null | undefined): number {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return isFinite(n) ? n : 0;
}
