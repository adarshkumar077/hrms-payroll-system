"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { notify } from "@/lib/notify";
import { inr } from "@/lib/format";
import { postVendorBillJournal, postBillPaymentJournal } from "@/lib/ap";

// ── Create a vendor bill (+ optional single line) ──
export async function createBillAction(formData: FormData) {
  const s = await requireSession();

  const vendor = String(formData.get("vendor") || "").trim();
  const billNumber = String(formData.get("billNumber") || "").trim();
  if (!vendor || !billNumber) return;

  const gstin = String(formData.get("gstin") || "").trim() || null;
  const dueDateRaw = String(formData.get("dueDate") || "");
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;

  const description = String(formData.get("description") || "").trim();
  const qty = Math.max(1, Number(formData.get("qty") || 1));
  const unitPrice = Math.max(0, Number(formData.get("unitPrice") || 0));
  const taxRate = Math.max(0, Number(formData.get("taxRate") || 18));

  const subtotal = description ? qty * unitPrice : 0;
  const tax = description ? (subtotal * taxRate) / 100 : 0;
  const total = subtotal + tax;

  const bill = await db.vendorBill.create({
    data: {
      tenantId: s.tenantId,
      vendor,
      gstin,
      billNumber,
      dueDate,
      subtotal,
      tax,
      total,
      status: "Draft",
      source: "manual",
      ...(description
        ? {
            lines: {
              create: {
                description,
                qty,
                unitPrice,
                taxRate,
                lineTotal: subtotal,
              },
            },
          }
        : {}),
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "vendorbill.created",
    entity: "VendorBill",
    entityId: bill.id,
    actorId: s.userId,
    payload: { note: `${billNumber} — ${vendor}`, total },
  });

  revalidatePath("/finance/bills");
}

// ── Approve: Draft → Approved, post GL journal (failure-isolated) ──
export async function approveBillAction(id: string) {
  const s = await requireSession();
  const bill = await db.vendorBill.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!bill || bill.status !== "Draft") return;

  await db.vendorBill.update({ where: { id: bill.id }, data: { status: "Approved" } });

  try {
    await postVendorBillJournal(s.tenantId, {
      billNumber: bill.billNumber,
      vendor: bill.vendor,
      total: bill.total,
    });
  } catch (err) {
    console.error("postVendorBillJournal failed", err);
  }

  await notify({
    tenantId: s.tenantId,
    title: "Vendor bill approved",
    body: `${bill.billNumber} — ${bill.vendor} for ${inr(bill.total)} approved.`,
    link: "/finance/bills",
  });

  await emit({
    tenantId: s.tenantId,
    type: "vendorbill.approved",
    entity: "VendorBill",
    entityId: bill.id,
    actorId: s.userId,
    payload: { note: `${bill.billNumber} approved`, total: bill.total },
  });

  revalidatePath("/finance/bills");
}

// ── Pay: Approved → Paid, post GL journal (failure-isolated) ──
export async function payBillAction(id: string) {
  const s = await requireSession();
  const bill = await db.vendorBill.findFirst({ where: { id, tenantId: s.tenantId } });
  if (!bill || bill.status !== "Approved") return;

  await db.vendorBill.update({ where: { id: bill.id }, data: { status: "Paid" } });

  try {
    await postBillPaymentJournal(s.tenantId, {
      billNumber: bill.billNumber,
      vendor: bill.vendor,
      total: bill.total,
    });
  } catch (err) {
    console.error("postBillPaymentJournal failed", err);
  }

  await notify({
    tenantId: s.tenantId,
    title: "Vendor bill paid",
    body: `${inr(bill.total)} paid for ${bill.billNumber} — ${bill.vendor}.`,
    link: "/finance/bills",
  });

  await emit({
    tenantId: s.tenantId,
    type: "vendorbill.paid",
    entity: "VendorBill",
    entityId: bill.id,
    actorId: s.userId,
    payload: { note: `${bill.billNumber} paid`, total: bill.total },
  });

  revalidatePath("/finance/bills");
}
