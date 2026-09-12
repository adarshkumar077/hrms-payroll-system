"use server";

import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { draftFollowUp } from "@/lib/ai";

// Generate (but do NOT send) a follow-up draft. Returns text for human editing.
export async function draftFollowUpAction(
  leadId: string,
  channel: "email" | "whatsapp"
): Promise<{ text: string }> {
  const s = await requireSession();
  const lead = await db.lead.findFirst({ where: { id: leadId, tenantId: s.tenantId } });
  if (!lead) return { text: "" };

  const text = await draftFollowUp({
    leadName: lead.name,
    company: lead.company,
    channel,
    context: `Lead source: ${lead.source}. Current status: ${lead.status}.`,
  });

  return { text };
}
