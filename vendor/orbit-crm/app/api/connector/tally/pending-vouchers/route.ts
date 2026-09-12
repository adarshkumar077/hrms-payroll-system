import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { authenticateConnector } from "@/lib/connector";

// GET /api/connector/tally/pending-vouchers
// → { vouchers: [{ invoiceId, number, date, accountName, lines: [...], cgst, sgst, igst, grandTotal }] }
// Finalized invoices (the sanctioned Invoice-domain literal — see finance/invoices/actions.ts)
// with tallyPushedAt: null, capped at 50.

export const dynamic = "force-dynamic";

const MAX_VOUCHERS = 50;

export async function GET(req: Request) {
  const { ok: withinLimit, retryAfter } = rateLimit(`connector:pending-vouchers:${clientKey(req)}`, 30, 60_000);
  if (!withinLimit) {
    return NextResponse.json(
      { ok: false, error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const auth = await authenticateConnector(req.headers.get("x-connector-key"));
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.status === 503 ? "Connector not configured for any tenant." : "Invalid connector key." },
      { status: auth.status }
    );
  }

  const invoices = await db.invoice.findMany({
    where: { tenantId: auth.tenantId, status: "Finalized", tallyPushedAt: null },
    include: { account: true, lines: true },
    orderBy: { createdAt: "asc" },
    take: MAX_VOUCHERS,
  });

  const vouchers = invoices.map((inv) => ({
    invoiceId: inv.id,
    number: inv.number,
    date: inv.createdAt.toISOString(),
    accountName: inv.account?.name ?? "—",
    lines: inv.lines.map((l) => ({
      description: l.description,
      qty: l.qty,
      rate: l.unitPrice,
      amount: l.lineTotal,
      taxRate: l.taxRate,
    })),
    cgst: inv.cgst,
    sgst: inv.sgst,
    igst: inv.igst,
    grandTotal: inv.grandTotal,
  }));

  return NextResponse.json({ vouchers });
}
