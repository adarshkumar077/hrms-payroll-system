"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { postJournal, ACCOUNT_TYPES, type PostLine } from "@/lib/gl";

// ── Create a new ledger account (Chart of Accounts) ──
export async function createAccountAction(formData: FormData) {
  const s = await requireSession();

  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "");

  if (!code || !name) return { error: "Code and name are required." };
  if (!(ACCOUNT_TYPES as readonly string[]).includes(type)) return { error: "Invalid account type." };

  const existing = await db.ledgerAccount.findFirst({ where: { tenantId: s.tenantId, code } });
  if (existing) return { error: `Account code ${code} already exists.` };

  const account = await db.ledgerAccount.create({
    data: { tenantId: s.tenantId, code, name, type },
  });

  await emit({
    tenantId: s.tenantId,
    type: "ledger.account.created",
    entity: "LedgerAccount",
    entityId: account.id,
    actorId: s.userId,
    payload: { note: `${code} — ${name} (${type})` },
  });

  revalidatePath("/finance/ledger");
  return { ok: true };
}

// ── Post a manual journal entry ──
export async function postJournalAction(formData: FormData) {
  const s = await requireSession();

  const narration = String(formData.get("narration") || "").trim();
  const reference = String(formData.get("reference") || "").trim() || undefined;
  const codes = formData.getAll("lineCode") as string[];
  const debits = formData.getAll("lineDebit") as string[];
  const credits = formData.getAll("lineCredit") as string[];

  if (!narration) return { error: "Narration is required." };

  const lines: PostLine[] = [];
  for (let i = 0; i < codes.length; i++) {
    const code = (codes[i] || "").trim();
    const debit = Number(debits[i] || 0) || 0;
    const credit = Number(credits[i] || 0) || 0;
    if (!code || (debit === 0 && credit === 0)) continue;
    lines.push({ code, debit: debit || undefined, credit: credit || undefined });
  }

  if (lines.length < 2) return { error: "At least 2 journal lines with amounts are required." };

  try {
    const entry = await postJournal({ tenantId: s.tenantId, narration, reference, lines });
    revalidatePath("/finance/ledger");
    return { ok: true, id: entry.id };
  } catch (e: any) {
    return { error: e?.message || "Failed to post journal entry." };
  }
}
