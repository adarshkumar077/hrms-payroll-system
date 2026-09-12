"use server";

import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { clickToCall, type ClickToCallResult } from "@/lib/telephony";

// Click-to-call — invoked from components/CallButton.tsx when telephony is
// configured (live Exotel Connect API call). RBAC-gated same as every other
// mutating action (writes here don't touch the DB directly — the actual Call
// row is created later by the webhook once Exotel reports the call — but a
// call still costs money/rings a real phone, so it's a "write").
export async function clickToCallAction(phone: string): Promise<ClickToCallResult> {
  const s = await requireSession();
  if (!(await can(s, "calls", "write"))) return { error: "Not authorized" };

  const to = String(phone || "").trim();
  if (!to) return { error: "Missing phone number." };

  return clickToCall({ to });
}
