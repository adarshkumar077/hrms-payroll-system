"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { suggestStructure } from "@/lib/compliance/payroll";

export async function addEmployee(formData: FormData) {
  const s = await requireSession();

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const department = String(formData.get("department") || "").trim();
  const designation = String(formData.get("designation") || "").trim();
  const ctc = Number(formData.get("ctc") || 0);

  if (!name || ctc <= 0) return;

  // Generate a simple sequential-ish employee code scoped to tenant.
  const count = await db.employee.count({ where: { tenantId: s.tenantId } });
  const code = `EMP${String(count + 1).padStart(4, "0")}`;

  const gross = ctc / 12;
  const structure = suggestStructure(gross);

  const employee = await db.employee.create({
    data: {
      tenantId: s.tenantId,
      code,
      name,
      email: email || null,
      department: department || null,
      designation: designation || null,
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
    type: "employee.created",
    entity: "Employee",
    entityId: employee.id,
    actorId: s.userId,
    payload: { note: `Employee ${name} (${code}) onboarded`, ctc, department },
  });

  revalidatePath("/hr/employees");
}
