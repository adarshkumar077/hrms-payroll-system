import { db } from "./db";

// GAPS #1: a tenant-scoped Prisma client. `scopedDb(tenantId)` auto-injects `tenantId`
// into the `where` of list/aggregate/update/delete ops and onto `create` data, so a
// forgotten scope can't leak across tenants. Use it in place of raw `db` for tenant data.
//
// NOTE: findUnique/upsert are deliberately NOT rewritten (their `where` is a unique key,
// not a filter) — scope those by including tenantId in the unique lookup yourself, or
// re-check the row's tenantId after fetch. Child tables without a tenantId column
// (quotationLine, invoiceLine, payslip, vendorBillLine) are scoped via their parent.

const TENANT_MODELS = new Set([
  "user", "role", "account", "contact", "lead", "opportunity", "product", "quotation",
  "ticket", "activity", "employee", "leaveApplication", "attendance", "salaryStructure",
  "payrollRun", "warehouse", "item", "stockMove", "purchaseOrder", "invoice", "eventLog",
  "notification", "job", "attachment", "payment", "subscription", "ledgerAccount",
  "journalEntry", "journalLine", "vendorBill", "bankTransaction",
]);

const WHERE_OPS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "updateMany", "deleteMany"]);

export function scopedDb(tenantId: string) {
  return db.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          const m = model ? model.charAt(0).toLowerCase() + model.slice(1) : "";
          if (!TENANT_MODELS.has(m)) return query(args);
          if (WHERE_OPS.has(operation)) {
            args.where = { ...(args.where || {}), tenantId };
          } else if (operation === "create") {
            args.data = { ...(args.data || {}), tenantId };
          } else if (operation === "createMany") {
            const rows = Array.isArray(args.data) ? args.data : [args.data];
            args.data = rows.map((d: any) => ({ ...d, tenantId }));
          }
          return query(args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
