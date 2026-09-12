import { db } from "@/lib/db";

/**
 * Orbit Studio — configuration audit trail.
 * Every Studio mutation records who/what/before/after and bumps the tenant's
 * configVersion (the cache-invalidation stamp read by getStudioConfig).
 */
export async function logStudioChange(params: {
  tenantId: string;
  actorId?: string | null;
  source?: "ui" | "ai" | "template" | "system";
  object: string; // "FieldDef" | "PicklistOption" | "ModuleConfig" | ...
  objectId: string;
  action: "create" | "update" | "archive" | "apply_pack";
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await db.studioChangeLog.create({
    data: {
      tenantId: params.tenantId,
      actorId: params.actorId ?? null,
      source: params.source ?? "ui",
      object: params.object,
      objectId: params.objectId,
      action: params.action,
      before: params.before === undefined ? null : JSON.stringify(params.before),
      after: params.after === undefined ? null : JSON.stringify(params.after),
    },
  });
  await db.tenant.update({
    where: { id: params.tenantId },
    data: { configVersion: { increment: 1 } },
  });
}
