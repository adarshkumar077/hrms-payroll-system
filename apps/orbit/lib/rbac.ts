import { db } from "./db";
import type { Session } from "./auth";

export type Action = "read" | "write";

// Permissions JSON shape:
// { "leads": ["read","write"], "payroll": ["read"], "_fields": { "opportunity.amount": "hidden" } }

/**
 * Pure evaluation of a permissions JSON string. Fail-closed: any malformed
 * input denies. Exported for unit tests.
 */
export function evalPerms(permissionsJson: string | null | undefined, module: string, action: Action): boolean {
  if (!permissionsJson) return false;
  try {
    const perms = JSON.parse(permissionsJson);
    const mod = perms?.[module];
    return Array.isArray(mod) && mod.includes(action);
  } catch {
    return false; // fail-closed: corrupt permissions grant nothing
  }
}

export function evalFieldHidden(permissionsJson: string | null | undefined, fieldKey: string): boolean {
  if (!permissionsJson) return true; // fail-closed: missing permissions hide maskable fields
  try {
    const perms = JSON.parse(permissionsJson);
    return perms?._fields?.[fieldKey] === "hidden";
  } catch {
    return true; // fail-closed: corrupt permissions hide the field
  }
}

/** Full-access default permissions for members (admin & billing deliberately omitted → denied). */
export const DEFAULT_MEMBER_PERMISSIONS: Record<string, Action[]> = {
  dashboard: ["read"],
  leads: ["read", "write"],
  opportunities: ["read", "write"],
  accounts: ["read", "write"],
  contacts: ["read", "write"],
  products: ["read", "write"],
  quotations: ["read", "write"],
  tickets: ["read", "write"],
  contracts: ["read", "write"],
  installed: ["read", "write"],
  calls: ["read", "write"],
  messages: ["read", "write"],
  hr: ["read", "write"],
  payroll: ["read"],
  inventory: ["read", "write"],
  finance: ["read", "write"],
  ai: ["read", "write"],
  integrations: ["read"],
  documents: ["read", "write"],
  import: ["read", "write"],
};

export const DEFAULT_MEMBER_ROLE_NAME = "Member (Full Access)";

/** Get or create the tenant's default member role (assigned to invites with no explicit role). */
export async function ensureDefaultRole(tenantId: string): Promise<string> {
  const existing = await db.role.findFirst({ where: { tenantId, name: DEFAULT_MEMBER_ROLE_NAME } });
  if (existing) return existing.id;
  const role = await db.role.create({
    data: { tenantId, name: DEFAULT_MEMBER_ROLE_NAME, permissions: JSON.stringify(DEFAULT_MEMBER_PERMISSIONS) },
  });
  return role.id;
}

/**
 * Fail-closed RBAC check. CEO bypasses; everyone else needs an existing role
 * whose permissions explicitly grant the module+action. No role, unknown role,
 * or unparseable permissions all DENY (was fail-open pre-Studio — see GAPS.md).
 */
export async function can(session: Session, module: string, action: Action): Promise<boolean> {
  if (session.isCeo) return true; // CEO sees all
  if (!session.roleId) return false; // fail-closed: roleless users have no access
  const role = await db.role.findUnique({ where: { id: session.roleId } });
  if (!role) return false; // fail-closed: dangling roleId
  return evalPerms(role.permissions, module, action);
}

export async function fieldHidden(session: Session, fieldKey: string): Promise<boolean> {
  if (session.isCeo) return false;
  if (!session.roleId) return true; // fail-closed: roleless users see masked-capable fields as hidden
  const role = await db.role.findUnique({ where: { id: session.roleId } });
  if (!role) return true;
  return evalFieldHidden(role.permissions, fieldKey);
}
