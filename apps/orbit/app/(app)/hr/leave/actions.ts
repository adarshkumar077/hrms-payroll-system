"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";

async function setLeaveStatus(id: string, status: "Approved" | "Rejected") {
  const s = await requireSession();

  // Scope by tenant — only act on this tenant's pending leaves.
  const leave = await db.leaveApplication.findFirst({
    where: { id, tenantId: s.tenantId, status: "Pending" },
    include: { employee: true },
  });
  if (!leave) return;

  await db.leaveApplication.update({ where: { id: leave.id }, data: { status } });

  await emit({
    tenantId: s.tenantId,
    type: `leave.${status.toLowerCase()}`,
    entity: "LeaveApplication",
    entityId: leave.id,
    actorId: s.userId,
    payload: {
      note: `${leave.type} leave for ${leave.employee.name} ${status.toLowerCase()}`,
      days: leave.days,
    },
  });

  revalidatePath("/hr/leave");
}

export async function approveLeave(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (id) await setLeaveStatus(id, "Approved");
}

export async function rejectLeave(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (id) await setLeaveStatus(id, "Rejected");
}
