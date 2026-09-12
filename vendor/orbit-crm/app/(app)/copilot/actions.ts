"use server";

import { requireSession } from "@/lib/auth";
import { askCopilot, type CopilotResult } from "@/lib/copilot";

// NL Copilot — classify → tenant-scoped Prisma query → formatted answer.
// Read-only: no writes, so no revalidate/emit. Scoped by session tenant.
export async function askAction(question: string): Promise<CopilotResult> {
  const s = await requireSession();
  return askCopilot(s.tenantId, question);
}
