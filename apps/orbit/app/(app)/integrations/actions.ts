"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { generateConnectorKey } from "@/lib/connector";
import { emit } from "@/lib/events";

export type GenerateTallyKeyResult = { ok: true; token: string } | { ok: false; error: string };

// Generates (or regenerates) the tenant's Tally connector token. The
// plaintext is returned to the caller ONCE — only its sha256 hash is
// persisted (ConnectorState.keyHash) — so the UI must show it exactly once
// and never re-fetch it.
export async function generateTallyKeyAction(): Promise<GenerateTallyKeyResult> {
  const s = await requireSession();
  if (!(await can(s, "integrations", "write"))) return { ok: false, error: "Not authorized" };

  const token = await generateConnectorKey(s.tenantId);

  await emit({
    tenantId: s.tenantId,
    type: "integrations.tally_key_generated",
    entity: "ConnectorState",
    entityId: s.tenantId,
    actorId: s.userId,
    payload: { note: "Tally connector key generated" },
  });

  revalidatePath("/integrations");
  revalidatePath("/integrations/tally");

  return { ok: true, token };
}
