// Constants for the cross-module Tags feature. Kept out of actions.ts
// because a "use server" file may only export async functions.
import { db } from "@/lib/db";

// TagLink.module (a plain string, no Prisma relation — see the Tag/TagLink
// comment in prisma/schema.prisma) → the Prisma delegate that owns records
// for that module. addTagAction uses this to verify the target record's
// tenantId before creating a TagLink.
export const TAG_MODULE_DELEGATES = {
  leads: db.lead,
  opportunities: db.opportunity,
  accounts: db.account,
  contacts: db.contact,
  tickets: db.ticket,
  products: db.product,
  contracts: db.contract,
} as const;

export type TagModule = keyof typeof TAG_MODULE_DELEGATES;

export function isTagModule(module: string): module is TagModule {
  return Object.prototype.hasOwnProperty.call(TAG_MODULE_DELEGATES, module);
}

// List + detail paths to revalidate after a tag add/remove, per module.
// Contacts/Products have no [id] detail page yet — detail() still returns a
// path (harmless if revalidatePath is called against a route that doesn't
// exist) so every TagModule has a uniform entry here.
export const TAG_MODULE_PATHS: Record<TagModule, { list: string; detail: (id: string) => string }> = {
  leads: { list: "/leads", detail: (id) => `/leads/${id}` },
  opportunities: { list: "/opportunities", detail: (id) => `/opportunities/${id}` },
  accounts: { list: "/accounts", detail: (id) => `/accounts/${id}` },
  contacts: { list: "/contacts", detail: (id) => `/contacts/${id}` },
  tickets: { list: "/tickets", detail: (id) => `/tickets/${id}` },
  products: { list: "/products", detail: (id) => `/products/${id}` },
  contracts: { list: "/contracts", detail: (id) => `/contracts/${id}` },
};
