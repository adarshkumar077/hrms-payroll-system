"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { parseBankCsv, importBankRows, reconcile } from "@/lib/bank";

// Parse + import a pasted bank-statement CSV, then refresh the page.
export async function importAction(csvText: string) {
  const s = await requireSession();
  const rows = parseBankCsv(csvText);
  const { imported } = await importBankRows(s.tenantId, rows);

  if (imported > 0) {
    await emit({
      tenantId: s.tenantId,
      type: "bank.imported",
      entity: "BankTransaction",
      entityId: s.tenantId,
      actorId: s.userId,
      payload: { count: imported },
    });
  }

  revalidatePath("/finance/bank");
  return { imported };
}

// Reconcile a transaction against a suggested match (or mark it manually reconciled
// when matchedType/matchedId are null).
export async function reconcileAction(txnId: string, matchedType: string | null, matchedId: string | null) {
  const s = await requireSession();
  const txn = await db.bankTransaction.findFirst({ where: { id: txnId, tenantId: s.tenantId } });
  if (!txn) return;

  await reconcile(s.tenantId, txn.id, matchedType, matchedId);

  await emit({
    tenantId: s.tenantId,
    type: "bank.reconciled",
    entity: "BankTransaction",
    entityId: txn.id,
    actorId: s.userId,
    payload: { matchedType, matchedId },
  });

  revalidatePath("/finance/bank");
}

// Undo a reconciliation, putting the transaction back to unreconciled/unmatched.
export async function unreconcileAction(txnId: string) {
  const s = await requireSession();
  const txn = await db.bankTransaction.findFirst({ where: { id: txnId, tenantId: s.tenantId } });
  if (!txn) return;

  await db.bankTransaction.update({
    where: { id: txn.id },
    data: { reconciled: false, matchedType: null, matchedId: null },
  });

  await emit({
    tenantId: s.tenantId,
    type: "bank.unreconciled",
    entity: "BankTransaction",
    entityId: txn.id,
    actorId: s.userId,
  });

  revalidatePath("/finance/bank");
}
