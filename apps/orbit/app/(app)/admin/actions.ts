"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { inviteUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { sendEmail } from "@/lib/email";

// ── Users ─────────────────────────────────────────────────────

export async function inviteUserAction(
  email: string,
  name: string,
  roleId: string | null
): Promise<{ ok: true; link: string; emailed: boolean } | { ok: false; error: string }> {
  const s = await requireSession();
  if (!email || !name) return { ok: false, error: "Name and email are required." };

  const result = await inviteUser(s.tenantId, email.trim(), name.trim(), roleId || null);
  if (typeof result !== "string") {
    return { ok: false, error: result.error };
  }

  const host = headers().get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const link = `${proto}://${host}/accept-invite?token=${result}`;

  // Best-effort — sendEmail() never throws, so this can never break the invite flow.
  const emailResult = await sendEmail({
    to: email.trim(),
    subject: `${s.name} invited you to join their team on Orbit`,
    html: `<p>${s.name} invited you to join their team on Orbit.</p><p><a href="${link}">Accept your invite</a></p>`,
  });

  await emit({
    tenantId: s.tenantId,
    type: "user.invited",
    entity: "User",
    entityId: email.trim(),
    actorId: s.userId,
    payload: { email: email.trim(), name: name.trim() },
  });

  revalidatePath("/admin");
  return { ok: true, link: `/accept-invite?token=${result}`, emailed: emailResult.sent };
}

export async function toggleUserActiveAction(userId: string, active: boolean) {
  const s = await requireSession();
  const user = await db.user.findFirst({ where: { id: userId, tenantId: s.tenantId } });
  if (!user) return;

  await db.user.update({ where: { id: user.id }, data: { active } });

  await emit({
    tenantId: s.tenantId,
    type: active ? "user.activated" : "user.deactivated",
    entity: "User",
    entityId: user.id,
    actorId: s.userId,
    payload: { email: user.email },
  });

  revalidatePath("/admin");
}

export async function assignRoleAction(userId: string, roleId: string | null) {
  const s = await requireSession();
  const user = await db.user.findFirst({ where: { id: userId, tenantId: s.tenantId } });
  if (!user) return;

  if (roleId) {
    const role = await db.role.findFirst({ where: { id: roleId, tenantId: s.tenantId } });
    if (!role) return;
  }

  await db.user.update({ where: { id: user.id }, data: { roleId } });

  await emit({
    tenantId: s.tenantId,
    type: "user.role.changed",
    entity: "User",
    entityId: user.id,
    actorId: s.userId,
    payload: { roleId },
  });

  revalidatePath("/admin");
}

// ── Roles ─────────────────────────────────────────────────────

export async function updateRolePermissionsAction(
  roleId: string,
  permissionsJson: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSession();
  const role = await db.role.findFirst({ where: { id: roleId, tenantId: s.tenantId } });
  if (!role) return { ok: false, error: "Role not found." };

  try {
    JSON.parse(permissionsJson);
  } catch {
    return { ok: false, error: "Invalid JSON — please fix the syntax." };
  }

  await db.role.update({ where: { id: role.id }, data: { permissions: permissionsJson } });

  await emit({
    tenantId: s.tenantId,
    type: "role.permissions.updated",
    entity: "Role",
    entityId: role.id,
    actorId: s.userId,
    payload: { name: role.name },
  });

  revalidatePath("/admin");
  return { ok: true };
}

export async function createRoleAction(name: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSession();
  if (!name.trim()) return { ok: false, error: "Role name is required." };

  const role = await db.role.create({
    data: { tenantId: s.tenantId, name: name.trim(), permissions: "{}" },
  });

  await emit({
    tenantId: s.tenantId,
    type: "role.created",
    entity: "Role",
    entityId: role.id,
    actorId: s.userId,
    payload: { name: role.name },
  });

  revalidatePath("/admin");
  return { ok: true };
}

// ── Company settings ──────────────────────────────────────────

export async function updateTenantAction(
  name: string,
  gstin: string,
  aato: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSession();
  if (!name.trim()) return { ok: false, error: "Company name is required." };

  await db.tenant.update({
    where: { id: s.tenantId },
    data: { name: name.trim(), gstin: gstin.trim() || null, aato: Number.isFinite(aato) ? aato : 0 },
  });

  await emit({
    tenantId: s.tenantId,
    type: "tenant.updated",
    entity: "Tenant",
    entityId: s.tenantId,
    actorId: s.userId,
    payload: { name: name.trim() },
  });

  revalidatePath("/admin");
  return { ok: true };
}

// ── DPDP: export & delete ────────────────────────────────────

/** Dump this tenant's key tables as a JSON string for the user to download. */
export async function exportTenantDataAction(): Promise<string> {
  const s = await requireSession();
  const t = s.tenantId;

  const [
    tenant,
    users,
    roles,
    accounts,
    contacts,
    leads,
    opportunities,
    quotations,
    tickets,
    employees,
    invoices,
  ] = await Promise.all([
    db.tenant.findUnique({ where: { id: t } }),
    db.user.findMany({ where: { tenantId: t }, select: { id: true, name: true, email: true, roleId: true, isCeo: true, active: true, createdAt: true } }),
    db.role.findMany({ where: { tenantId: t } }),
    db.account.findMany({ where: { tenantId: t } }),
    db.contact.findMany({ where: { tenantId: t } }),
    db.lead.findMany({ where: { tenantId: t } }),
    db.opportunity.findMany({ where: { tenantId: t } }),
    db.quotation.findMany({ where: { tenantId: t }, include: { lines: true } }),
    db.ticket.findMany({ where: { tenantId: t } }),
    db.employee.findMany({ where: { tenantId: t } }),
    db.invoice.findMany({ where: { tenantId: t }, include: { lines: true } }),
  ]);

  await emit({
    tenantId: t,
    type: "tenant.data.exported",
    entity: "Tenant",
    entityId: t,
    actorId: s.userId,
    payload: {},
  });

  const dump = {
    exportedAt: new Date().toISOString(),
    tenant,
    users,
    roles,
    accounts,
    contacts,
    leads,
    opportunities,
    quotations,
    tickets,
    employees,
    invoices,
  };

  return JSON.stringify(dump, null, 2);
}

/** Destructive: deletes all of this tenant's data. Only the CEO may call this. */
export async function deleteOrganizationAction(
  confirmName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSession();
  if (!s.isCeo) return { ok: false, error: "Only the CEO can delete the organization." };

  const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
  if (!tenant) return { ok: false, error: "Organization not found." };
  if (confirmName.trim() !== tenant.name) {
    return { ok: false, error: "Name does not match — type the exact organization name to confirm." };
  }

  const t = s.tenantId;

  // Delete children before parents to satisfy FK constraints. Order matters.
  await db.payslip.deleteMany({ where: { payrollRun: { tenantId: t } } });
  await db.payrollRun.deleteMany({ where: { tenantId: t } });
  await db.salaryStructure.deleteMany({ where: { tenantId: t } });
  await db.leaveApplication.deleteMany({ where: { tenantId: t } });
  await db.attendance.deleteMany({ where: { tenantId: t } });
  await db.employee.deleteMany({ where: { tenantId: t } });

  await db.stockMove.deleteMany({ where: { tenantId: t } });
  await db.item.deleteMany({ where: { tenantId: t } });
  await db.warehouse.deleteMany({ where: { tenantId: t } });
  await db.purchaseOrder.deleteMany({ where: { tenantId: t } });

  await db.invoiceLine.deleteMany({ where: { invoice: { tenantId: t } } });
  await db.invoice.deleteMany({ where: { tenantId: t } });
  await db.payment.deleteMany({ where: { tenantId: t } });

  await db.quotationLine.deleteMany({ where: { quotation: { tenantId: t } } });
  await db.quotation.deleteMany({ where: { tenantId: t } });
  await db.ticket.deleteMany({ where: { tenantId: t } });
  await db.activity.deleteMany({ where: { tenantId: t } });
  await db.opportunity.deleteMany({ where: { tenantId: t } });
  await db.lead.deleteMany({ where: { tenantId: t } });
  await db.contact.deleteMany({ where: { tenantId: t } });
  await db.account.deleteMany({ where: { tenantId: t } });
  await db.product.deleteMany({ where: { tenantId: t } });

  await db.notification.deleteMany({ where: { tenantId: t } });
  await db.attachment.deleteMany({ where: { tenantId: t } });
  await db.job.deleteMany({ where: { tenantId: t } });
  await db.subscription.deleteMany({ where: { tenantId: t } });
  await db.eventLog.deleteMany({ where: { tenantId: t } });

  await db.user.deleteMany({ where: { tenantId: t } });
  await db.role.deleteMany({ where: { tenantId: t } });
  await db.tenant.delete({ where: { id: t } });

  return { ok: true };
}
