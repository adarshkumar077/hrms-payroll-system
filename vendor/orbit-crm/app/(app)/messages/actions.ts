"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { emit } from "@/lib/events";
import { sendTemplate } from "@/lib/whatsapp";

// v1 send surface — free-form body, optional templateKey, optional
// entity/entityId (polymorphic-lite link back to a record, per
// docs/ai/design/wave-d-contracts.md §Adapter interfaces). Always writes a
// MessageLog row (sendTemplate never throws); delivery status advances later
// via app/api/webhooks/whatsapp.
export async function sendWhatsAppAction(formData: FormData): Promise<{ error?: string } | void> {
  const s = await requireSession();
  if (!(await can(s, "messages", "write"))) return { error: "Not authorized" };

  const to = String(formData.get("to") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const templateKey = str(formData.get("templateKey"));
  const entity = str(formData.get("entity"));
  const entityId = str(formData.get("entityId"));

  if (!to) return { error: "Recipient phone number is required." };
  if (!body) return { error: "Message body is required." };

  const result = await sendTemplate({ tenantId: s.tenantId, to, templateKey, body, entity, entityId });

  if (result.id) {
    await emit({
      tenantId: s.tenantId,
      type: "message.sent",
      entity: "MessageLog",
      entityId: result.id,
      actorId: s.userId,
      payload: { note: `WhatsApp → ${to}`, channel: "whatsapp", mode: result.mode, deliveryStatus: result.deliveryStatus },
    });
  }

  revalidatePath("/messages");

  if (!result.ok) return { error: result.error || "Send failed — see the logged row on /messages for details." };
}

function str(v: FormDataEntryValue | null): string | null {
  const t = String(v || "").trim();
  return t || null;
}
