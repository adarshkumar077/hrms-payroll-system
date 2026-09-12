import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computePayslip, suggestStructure } from "../lib/compliance/payroll";
import { computeGst, requiresEInvoice, mockIrn } from "../lib/compliance/gst";
import { backfillLedger } from "../lib/gl";

const db = new PrismaClient();

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rand(a.length)];

async function main() {
  console.log("🌱 Seeding Orbit…");
  // wipe (order matters for FKs)
  await db.invoiceLine.deleteMany();
  await db.invoice.deleteMany();
  await db.stockMove.deleteMany();
  await db.purchaseOrder.deleteMany();
  await db.item.deleteMany();
  await db.warehouse.deleteMany();
  await db.payslip.deleteMany();
  await db.payrollRun.deleteMany();
  await db.salaryStructure.deleteMany();
  await db.attendance.deleteMany();
  await db.leaveApplication.deleteMany();
  await db.employee.deleteMany();
  await db.activity.deleteMany();
  await db.quotationLine.deleteMany();
  await db.quotation.deleteMany();
  await db.ticket.deleteMany();
  await db.opportunity.deleteMany();
  await db.lead.deleteMany();
  await db.contact.deleteMany();
  await db.account.deleteMany();
  await db.product.deleteMany();
  await db.eventLog.deleteMany();
  await db.user.deleteMany();
  await db.role.deleteMany();
  await db.tenant.deleteMany();

  const tenant = await db.tenant.create({
    data: { name: "Acme Distributors Pvt Ltd", gstin: "27AABCA1234A1Z5", aato: 80000000, currency: "INR" },
  });

  const pw = await bcrypt.hash("orbit123", 10);
  const ceoRole = await db.role.create({ data: { tenantId: tenant.id, name: "CEO", permissions: "{}" } });
  // Default full-access member role — RBAC is fail-closed, so roleless users have
  // no access; invites without an explicit role fall back to this one.
  await db.role.create({
    data: {
      tenantId: tenant.id,
      name: "Member (Full Access)",
      permissions: JSON.stringify({
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
        activities: ["read", "write"],
        hr: ["read", "write"],
        payroll: ["read"],
        inventory: ["read", "write"],
        finance: ["read", "write"],
        ai: ["read", "write"],
        integrations: ["read"],
        documents: ["read", "write"],
        import: ["read", "write"],
      }),
    },
  });
  const salesRole = await db.role.create({
    data: {
      tenantId: tenant.id,
      name: "Sales",
      permissions: JSON.stringify({
        leads: ["read", "write"],
        opportunities: ["read", "write"],
        accounts: ["read", "write"],
        quotations: ["read", "write"],
        tickets: ["read"],
        activities: ["read", "write"],
        _fields: { "payslip.netPay": "hidden" },
      }),
    },
  });

  const ceo = await db.user.create({
    data: { tenantId: tenant.id, name: "Ravi Sharma", email: "ceo@demo.orbit", passwordHash: pw, isCeo: true, roleId: ceoRole.id, hourlyCost: 2000 },
  });
  const sales = await db.user.create({
    data: { tenantId: tenant.id, name: "Priya Mehta", email: "sales@demo.orbit", passwordHash: pw, roleId: salesRole.id, hourlyCost: 600 },
  });
  const reps = [ceo, sales];

  // Products
  const productNames = [
    ["Industrial Router X1", "8517", 45000, 18],
    ["Smart Sensor Kit", "8536", 12000, 18],
    ["Annual Maintenance Contract", "9987", 25000, 18],
    ["Network Switch 24P", "8517", 32000, 18],
    ["Installation Service", "9987", 8000, 18],
  ] as const;
  const products = [];
  for (const [name, hsn, price, tax] of productNames) {
    products.push(await db.product.create({ data: { tenantId: tenant.id, name, hsn, unitPrice: price, taxRate: tax, sku: name.slice(0, 3).toUpperCase() + rand(999) } }));
  }

  // Accounts + contacts
  const companies = ["Tata Retail", "Reliance Digital", "Bajaj Traders", "Godrej Interio", "Mahindra Logistics", "Kirloskar Bros", "Havells India", "Voltas Ltd"];
  const states = ["Maharashtra", "Gujarat", "Karnataka", "Delhi", "Tamil Nadu"];
  const accounts = [];
  for (const c of companies) {
    const acc = await db.account.create({
      data: { tenantId: tenant.id, name: c, industry: pick(["Retail", "Manufacturing", "Logistics", "IT"]), city: pick(["Mumbai", "Pune", "Bengaluru", "Delhi"]), state: pick(states), gstin: `27AA${rand(9999)}Z${rand(9)}` },
    });
    accounts.push(acc);
    await db.contact.create({ data: { tenantId: tenant.id, accountId: acc.id, name: pick(["Amit", "Sneha", "Rahul", "Neha"]) + " " + pick(["Kumar", "Patel", "Singh"]), email: `contact@${c.split(" ")[0].toLowerCase()}.com`, phone: `98${rand(99999999)}`, title: pick(["Procurement Head", "IT Manager", "Director"]) } });
  }

  // Leads (varied sources for AI scoring demo)
  const sources = ["IndiaMART", "JustDial", "TradeIndia", "Website", "WhatsApp", "Manual"];
  const statuses = ["New", "Contacted", "Qualified", "Converted", "Dead"];
  for (let i = 0; i < 24; i++) {
    await db.lead.create({
      data: {
        tenantId: tenant.id,
        name: pick(["Vikram", "Anjali", "Suresh", "Divya", "Karan"]) + " " + pick(["Shah", "Reddy", "Nair", "Gupta"]),
        company: pick(companies) + " " + pick(["Branch", "Unit", "HO"]),
        email: `lead${i}@example.com`,
        phone: `99${rand(99999999)}`,
        source: pick(sources),
        status: pick(statuses),
        ownerId: pick(reps).id,
      },
    });
  }

  // Opportunities across stages
  const stages = ["Qualification", "Proposal", "Negotiation", "ClosedWon", "ClosedLost"];
  for (let i = 0; i < 16; i++) {
    const stage = pick(stages);
    const acc = pick(accounts);
    await db.opportunity.create({
      data: {
        tenantId: tenant.id,
        accountId: acc.id,
        name: `${acc.name} — ${pick(products).name}`,
        amount: (rand(20) + 2) * 50000,
        stage,
        probability: stage === "ClosedWon" ? 100 : stage === "ClosedLost" ? 0 : pick([20, 40, 60, 80]),
        closeDate: new Date(Date.now() + (rand(60) - 20) * 86400000),
        ownerId: pick(reps).id,
      },
    });
  }

  // Quotations
  for (let i = 0; i < 6; i++) {
    const p1 = pick(products);
    const qty = rand(5) + 1;
    const lineTotal = p1.unitPrice * qty;
    const taxTotal = (lineTotal * p1.taxRate) / 100;
    const q = await db.quotation.create({
      data: { tenantId: tenant.id, number: `QT-2026-${1000 + i}`, status: pick(["Draft", "Sent", "Accepted"]), subtotal: lineTotal, taxTotal, grandTotal: lineTotal + taxTotal },
    });
    await db.quotationLine.create({ data: { quotationId: q.id, productId: p1.id, description: p1.name, qty, unitPrice: p1.unitPrice, taxRate: p1.taxRate, lineTotal } });
  }

  // Tickets
  for (let i = 0; i < 10; i++) {
    await db.ticket.create({
      data: { tenantId: tenant.id, accountId: pick(accounts).id, subject: pick(["Router not connecting", "AMC renewal query", "Installation pending", "Invoice mismatch", "Sensor calibration"]), priority: pick(["Low", "Medium", "High", "Urgent"]), status: pick(["Open", "InProgress", "Resolved", "Closed"]), ownerId: pick(reps).id, slaDueAt: new Date(Date.now() + rand(5) * 86400000) },
    });
  }

  // Activities
  for (let i = 0; i < 12; i++) {
    await db.activity.create({ data: { tenantId: tenant.id, type: pick(["Task", "Call", "Meeting"]), subject: pick(["Follow up on quote", "Demo call", "Contract review", "Payment reminder"]), dueDate: new Date(Date.now() + rand(10) * 86400000), ownerId: pick(reps).id } });
  }

  // ── HR: Employees ──
  const deps = ["Sales", "Operations", "Finance", "Support", "HR"];
  const empUsers = [{ u: ceo, ctc: 3600000 }, { u: sales, ctc: 720000 }];
  const employees = [];
  for (const { u, ctc } of empUsers) {
    employees.push(await db.employee.create({ data: { tenantId: tenant.id, userId: u.id, code: `EMP${100 + employees.length}`, name: u.name, email: u.email, department: "Management", designation: u.isCeo ? "CEO" : "Sales Lead", ctc, dateOfJoining: new Date("2023-04-01") } }));
  }
  const empNames = ["Arjun Rao", "Meera Iyer", "Rohit Verma", "Kavya Menon", "Sanjay Joshi", "Pooja Desai", "Nikhil Bhat", "Ritu Agarwal", "Deepak Shetty", "Ananya Ghosh", "Manish Tiwari", "Sneha Kulkarni"];
  for (let i = 0; i < empNames.length; i++) {
    employees.push(await db.employee.create({ data: { tenantId: tenant.id, code: `EMP${200 + i}`, name: empNames[i], email: `${empNames[i].split(" ")[0].toLowerCase()}@acme.in`, department: pick(deps), designation: pick(["Executive", "Manager", "Associate", "Sr. Executive"]), ctc: (rand(12) + 4) * 100000, dateOfJoining: new Date(2022 + rand(3), rand(12), rand(28) + 1) } }));
  }

  // Salary structures (compliant with 2025 Labour Codes)
  for (const e of employees) {
    const gross = Math.round(e.ctc / 12);
    const s = suggestStructure(gross);
    await db.salaryStructure.create({ data: { tenantId: tenant.id, employeeId: e.id, gross, basic: s.basic, hra: s.hra, allowances: s.allowances, compliant: true } });
  }

  // Leave + attendance
  for (let i = 0; i < 10; i++) {
    const e = pick(employees);
    const from = new Date(Date.now() + (rand(20) - 5) * 86400000);
    await db.leaveApplication.create({ data: { tenantId: tenant.id, employeeId: e.id, type: pick(["Casual", "Sick", "Earned", "Unpaid"]), fromDate: from, toDate: new Date(from.getTime() + rand(3) * 86400000), days: rand(3) + 1, status: pick(["Pending", "Approved", "Rejected"]), reason: pick(["Personal", "Medical", "Family function"]) } });
  }
  for (const e of employees.slice(0, 8)) {
    await db.attendance.create({ data: { tenantId: tenant.id, employeeId: e.id, date: new Date(), checkIn: new Date(), status: "Present", distanceM: rand(200) } });
  }

  // One completed payroll run
  const structures = await db.salaryStructure.findMany({ where: { tenantId: tenant.id }, include: { employee: true } });
  const run = await db.payrollRun.create({ data: { tenantId: tenant.id, month: 6, year: 2026, status: "Locked" } });
  let gt = 0, nt = 0, pf = 0, esi = 0, tds = 0;
  for (const s of structures) {
    const c = computePayslip({ gross: s.gross, basic: s.basic, annualGross: s.gross * 12 });
    await db.payslip.create({ data: { payrollRunId: run.id, employeeId: s.employeeId, gross: c.gross, basic: c.basic, pfEmployee: c.pfEmployee, pfEmployer: c.pfEmployer, esiEmployee: c.esiEmployee, esiEmployer: c.esiEmployer, pt: c.pt, tds: c.tds, netPay: c.netPay } });
    gt += c.gross; nt += c.netPay; pf += c.pfEmployee + c.pfEmployer; esi += c.esiEmployee + c.esiEmployer; tds += c.tds;
  }
  await db.payrollRun.update({ where: { id: run.id }, data: { grossTotal: gt, netTotal: nt, pfTotal: pf, esiTotal: esi, tdsTotal: tds } });

  // ── Inventory ──
  const wh = await db.warehouse.create({ data: { tenantId: tenant.id, name: "Main Warehouse", location: "Bhiwandi, MH" } });
  for (const p of products) {
    const onHand = rand(100) + 5;
    const item = await db.item.create({ data: { tenantId: tenant.id, productId: p.id, name: p.name, sku: p.sku, hsn: p.hsn, onHand, reorderLevel: 15, costPrice: p.unitPrice * 0.7 } });
    await db.stockMove.create({ data: { tenantId: tenant.id, itemId: item.id, warehouseId: wh.id, qty: onHand, type: "GRN", ref: "Opening" } });
  }
  for (let i = 0; i < 4; i++) {
    await db.purchaseOrder.create({ data: { tenantId: tenant.id, number: `PO-2026-${200 + i}`, vendor: pick(["Ingram Micro", "Redington", "Supertron", "Rashi Peripherals"]), status: pick(["Draft", "Sent", "Received"]), total: (rand(10) + 2) * 50000 } });
  }

  // ── Finance: GST invoices ──
  for (let i = 0; i < 8; i++) {
    const acc = pick(accounts);
    const p = pick(products);
    const qty = rand(6) + 1;
    const intraState = acc.state === "Maharashtra";
    const g = computeGst([{ qty, unitPrice: p.unitPrice, taxRate: p.taxRate }], intraState);
    const status = pick(["Draft", "Finalized", "Paid"]);
    const finalized = status !== "Draft";
    const needsIrn = finalized && requiresEInvoice(tenant.aato, "B2B");
    const inv = await db.invoice.create({
      data: {
        tenantId: tenant.id, accountId: acc.id, number: `INV-2026-${500 + i}`, invoiceType: "B2B", placeOfSupply: acc.state,
        subtotal: g.subtotal, cgst: g.cgst, sgst: g.sgst, igst: g.igst, grandTotal: g.grandTotal, status,
        irn: needsIrn ? mockIrn(`INV-2026-${500 + i}`) : null, ackNo: needsIrn ? `${rand(999999999)}` : null,
        ewayBillNo: needsIrn && g.grandTotal > 50000 ? `${rand(999999999999)}` : null,
      },
    });
    await db.invoiceLine.create({ data: { invoiceId: inv.id, description: p.name, hsn: p.hsn, qty, unitPrice: p.unitPrice, taxRate: p.taxRate, lineTotal: g.subtotal } });
  }

  // Event log samples
  const evs = [
    ["invoice.finalized", "Invoice", "GST invoice finalized with IRN"],
    ["payroll.run.locked", "PayrollRun", "June 2026 payroll locked"],
    ["lead.created", "Lead", "New IndiaMART lead captured"],
    ["opportunity.won", "Opportunity", "Deal closed won"],
  ];
  for (const [type, entity, note] of evs) {
    await db.eventLog.create({ data: { tenantId: tenant.id, type, entity, entityId: "seed", payload: JSON.stringify({ note }), actorId: ceo.id } });
  }

  // Post opening journals into the general ledger from the seeded invoices + payroll.
  await backfillLedger(tenant.id);

  console.log(`✅ Seeded tenant '${tenant.name}' with ${employees.length} employees, ${accounts.length} accounts.`);
  console.log("   Login: ceo@demo.orbit / orbit123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
