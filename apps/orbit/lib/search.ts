import { db } from "./db";

// Global cross-module search, tenant-scoped. SQLite LIKE (via Prisma `contains`)
// is case-insensitive for ASCII, which is fine here. Each module contributes up to 5 hits.

export type SearchHit = { module: string; label: string; sub: string; href: string };

export async function globalSearch(tenantId: string, q: string): Promise<SearchHit[]> {
  const query = (q || "").trim();
  if (query.length < 2) return [];
  const c = { contains: query };

  const [leads, accounts, contacts, opps, invoices, employees, tickets, items] = await Promise.all([
    db.lead.findMany({ where: { tenantId, OR: [{ name: c }, { company: c }, { email: c }, { phone: c }] }, take: 5 }),
    db.account.findMany({ where: { tenantId, OR: [{ name: c }, { gstin: c }, { city: c }] }, take: 5 }),
    db.contact.findMany({ where: { tenantId, OR: [{ name: c }, { email: c }, { phone: c }] }, take: 5 }),
    db.opportunity.findMany({ where: { tenantId, name: c }, take: 5 }),
    db.invoice.findMany({ where: { tenantId, number: c }, take: 5 }),
    db.employee.findMany({ where: { tenantId, OR: [{ name: c }, { code: c }, { email: c }, { department: c }] }, take: 5 }),
    db.ticket.findMany({ where: { tenantId, subject: c }, take: 5 }),
    db.item.findMany({ where: { tenantId, OR: [{ name: c }, { sku: c }, { hsn: c }] }, take: 5 }),
  ]);

  const hits: SearchHit[] = [];
  leads.forEach((l) => hits.push({ module: "Lead", label: l.name, sub: l.company || l.source, href: `/leads/${l.id}` }));
  opps.forEach((o) => hits.push({ module: "Opportunity", label: o.name, sub: o.stage, href: `/opportunities` }));
  accounts.forEach((a) => hits.push({ module: "Account", label: a.name, sub: [a.city, a.state].filter(Boolean).join(", "), href: `/accounts` }));
  contacts.forEach((ct) => hits.push({ module: "Contact", label: ct.name, sub: ct.email || ct.phone || "", href: `/accounts` }));
  invoices.forEach((i) => hits.push({ module: "Invoice", label: i.number, sub: i.status, href: `/finance/invoices/${i.id}` }));
  employees.forEach((e) => hits.push({ module: "Employee", label: e.name, sub: [e.code, e.department].filter(Boolean).join(" · "), href: `/hr/employees/${e.id}` }));
  tickets.forEach((t) => hits.push({ module: "Ticket", label: t.subject, sub: t.status, href: `/tickets` }));
  items.forEach((it) => hits.push({ module: "Item", label: it.name, sub: it.sku || it.hsn || "", href: `/inventory/${it.id}` }));
  return hits;
}
