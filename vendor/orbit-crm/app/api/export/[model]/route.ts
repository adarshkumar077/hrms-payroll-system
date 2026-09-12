import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { shortDate } from "@/lib/format";

const MODELS = ["leads", "employees", "items", "invoices"] as const;
type Model = (typeof MODELS)[number];

export async function GET(_req: NextRequest, { params }: { params: { model: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const model = params.model as Model;
  if (!MODELS.includes(model)) {
    return NextResponse.json({ error: `Unknown model. Expected one of: ${MODELS.join(", ")}` }, { status: 400 });
  }

  const tenantId = s.tenantId;
  let rows: Record<string, any>[] = [];

  if (model === "leads") {
    const leads = await db.lead.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    rows = leads.map((l) => ({
      name: l.name,
      company: l.company || "",
      email: l.email || "",
      phone: l.phone || "",
      source: l.source,
      status: l.status,
      score: l.score ?? "",
      createdAt: shortDate(l.createdAt),
    }));
  } else if (model === "employees") {
    const employees = await db.employee.findMany({
      where: { tenantId },
      include: { salaryStructure: true },
      orderBy: { code: "asc" },
    });
    rows = employees.map((e) => ({
      code: e.code,
      name: e.name,
      email: e.email || "",
      department: e.department || "",
      designation: e.designation || "",
      ctc: e.ctc,
      gross: e.salaryStructure?.gross ?? "",
      basic: e.salaryStructure?.basic ?? "",
      dateOfJoining: shortDate(e.dateOfJoining),
      active: e.active ? "Yes" : "No",
    }));
  } else if (model === "items") {
    const items = await db.item.findMany({ where: { tenantId }, orderBy: { name: "asc" } });
    rows = items.map((i) => ({
      name: i.name,
      sku: i.sku || "",
      hsn: i.hsn || "",
      uom: i.uom,
      onHand: i.onHand,
      reorderLevel: i.reorderLevel,
      costPrice: i.costPrice,
    }));
  } else if (model === "invoices") {
    const invoices = await db.invoice.findMany({
      where: { tenantId },
      include: { account: true },
      orderBy: { createdAt: "desc" },
    });
    rows = invoices.map((inv) => ({
      number: inv.number,
      account: inv.account?.name || "",
      invoiceType: inv.invoiceType,
      placeOfSupply: inv.placeOfSupply || "",
      subtotal: inv.subtotal,
      cgst: inv.cgst,
      sgst: inv.sgst,
      igst: inv.igst,
      grandTotal: inv.grandTotal,
      status: inv.status,
      irn: inv.irn || "",
      createdAt: shortDate(inv.createdAt),
    }));
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${model}-export.csv"`,
    },
  });
}
