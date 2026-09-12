"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { parseCsv } from "@/lib/csv";
import { suggestStructure } from "@/lib/compliance/payroll";
import { checkDuplicates } from "@/lib/studio/dedupe";

export type ImportResult = {
  imported: number;
  skipped: number;
  total: number;
  error?: string;
  // Rows flagged by the Studio dedupe rule (lib/studio/dedupe.ts), leads-only for now.
  // "block" matches are NOT imported and are also counted in `skipped`; "warn"
  // matches ARE imported (still counted in `imported`) — this field is how a
  // caller differentiates the two without treating warned rows as failures.
  duplicates?: number;
};

// Leads: name,company,email,phone,source,status
export async function importLeadsAction(_prev: ImportResult | undefined, formData: FormData): Promise<ImportResult> {
  const s = await requireSession();
  const text = String(formData.get("csv") || "");
  if (!text.trim()) return { imported: 0, skipped: 0, total: 0, error: "No CSV data provided." };

  const { rows } = parseCsv(text);
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const row of rows) {
    const name = (row.name || "").trim();
    if (!name) {
      skipped++;
      continue;
    }
    try {
      const email = row.email?.trim() || null;
      const phone = row.phone?.trim() || null;

      const dedupe = await checkDuplicates(s.tenantId, "leads", { email, phone });
      if (dedupe.mode === "block" && dedupe.matches.length > 0) {
        duplicates++;
        skipped++;
        continue;
      }
      const isWarnedDuplicate = dedupe.mode === "warn" && dedupe.matches.length > 0;
      if (isWarnedDuplicate) duplicates++;

      const lead = await db.lead.create({
        data: {
          tenantId: s.tenantId,
          name,
          company: row.company?.trim() || null,
          email,
          phone,
          source: row.source?.trim() || "Manual",
          status: row.status?.trim() || "New",
        },
      });
      await emit({
        tenantId: s.tenantId,
        type: "lead.imported",
        entity: "Lead",
        entityId: lead.id,
        actorId: s.userId,
        payload: { name, source: lead.source, duplicate: isWarnedDuplicate },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/import");
  revalidatePath("/leads");
  return { imported, skipped, total: rows.length, duplicates };
}

// Employees: code,name,email,department,designation,ctc
export async function importEmployeesAction(_prev: ImportResult | undefined, formData: FormData): Promise<ImportResult> {
  const s = await requireSession();
  const text = String(formData.get("csv") || "");
  if (!text.trim()) return { imported: 0, skipped: 0, total: 0, error: "No CSV data provided." };

  const { rows } = parseCsv(text);
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = (row.name || "").trim();
    const ctc = Number(row.ctc || 0);
    if (!name || !ctc || ctc <= 0) {
      skipped++;
      continue;
    }
    try {
      let code = (row.code || "").trim();
      if (!code) {
        const count = await db.employee.count({ where: { tenantId: s.tenantId } });
        code = `EMP${String(count + 1).padStart(4, "0")}`;
      }
      const gross = ctc / 12;
      const structure = suggestStructure(gross);

      const employee = await db.employee.create({
        data: {
          tenantId: s.tenantId,
          code,
          name,
          email: row.email?.trim() || null,
          department: row.department?.trim() || null,
          designation: row.designation?.trim() || null,
          ctc,
          salaryStructure: {
            create: {
              tenantId: s.tenantId,
              gross: structure.gross,
              basic: structure.basic,
              hra: structure.hra,
              allowances: structure.allowances,
              compliant: structure.compliant,
            },
          },
        },
      });

      await emit({
        tenantId: s.tenantId,
        type: "employee.imported",
        entity: "Employee",
        entityId: employee.id,
        actorId: s.userId,
        payload: { name, code, ctc },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/import");
  revalidatePath("/hr/employees");
  return { imported, skipped, total: rows.length };
}

// Items: name,sku,hsn,onHand,reorderLevel,costPrice
export async function importItemsAction(_prev: ImportResult | undefined, formData: FormData): Promise<ImportResult> {
  const s = await requireSession();
  const text = String(formData.get("csv") || "");
  if (!text.trim()) return { imported: 0, skipped: 0, total: 0, error: "No CSV data provided." };

  const { rows } = parseCsv(text);
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = (row.name || "").trim();
    if (!name) {
      skipped++;
      continue;
    }
    try {
      const item = await db.item.create({
        data: {
          tenantId: s.tenantId,
          name,
          sku: row.sku?.trim() || null,
          hsn: row.hsn?.trim() || null,
          onHand: Number(row.onHand || 0),
          reorderLevel: Number(row.reorderLevel || 0),
          costPrice: Number(row.costPrice || 0),
        },
      });
      await emit({
        tenantId: s.tenantId,
        type: "item.imported",
        entity: "Item",
        entityId: item.id,
        actorId: s.userId,
        payload: { name, sku: item.sku },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/import");
  revalidatePath("/inventory");
  return { imported, skipped, total: rows.length };
}
