"use server";

import { requireSession } from "@/lib/auth";
import { markAllRead, notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";

export async function markAllReadAction() {
  const s = await requireSession();
  await markAllRead(s.tenantId, s.userId);
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function sendTestNotificationAction() {
  const s = await requireSession();
  await notify({
    tenantId: s.tenantId,
    userId: s.userId,
    title: "Test notification",
    body: "Notifications are working.",
    link: "/dashboard",
  });
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}
