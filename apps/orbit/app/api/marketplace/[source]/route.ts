import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ingestLead, isSource } from "@/lib/marketplace";
import { rateLimit, clientKey } from "@/lib/ratelimit";

// Inbound marketplace webhook.
//   POST /api/marketplace/IndiaMART   (JustDial | TradeIndia | Website)
//
// Each Indian marketplace lets a seller paste ONE callback URL into their panel;
// they POST the buyer enquiry JSON here. We validate the source, authenticate,
// resolve the tenant, then hand the raw payload to ingestLead().

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { source: string } }) {
  const source = params.source;

  // 0. Rate limit per IP, before any work.
  const { ok, retryAfter } = rateLimit(`marketplace:${clientKey(req)}`, 30, 60_000); // 30/min
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  // 1. Validate source is one we support.
  if (!isSource(source)) {
    return NextResponse.json(
      { ok: false, error: `Unknown source "${source}". Expected one of IndiaMART, JustDial, TradeIndia, Website.` },
      { status: 404 }
    );
  }

  // 2. Authenticate. Providers can send a shared secret header. We compare
  //    `x-orbit-key` to MARKETPLACE_WEBHOOK_KEY. If the env is unset we're in
  //    dev mode and allow the call (but flag it in the response).
  const expectedKey = process.env.MARKETPLACE_WEBHOOK_KEY;
  let devMode = false;
  if (expectedKey) {
    const provided = req.headers.get("x-orbit-key");
    if (provided !== expectedKey) {
      return NextResponse.json({ ok: false, error: "Invalid or missing x-orbit-key." }, { status: 401 });
    }
  } else {
    devMode = true;
  }

  // 3. Parse body (JSON). Bad payload → 400.
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    // 4. Resolve tenant. DEMO: first tenant in the DB.
    //    In prod, MARKETPLACE_WEBHOOK_KEY (or a per-source key/path segment)
    //    would map to a specific tenant — you'd look the tenant up by that key.
    const tenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
    if (!tenant) {
      return NextResponse.json({ ok: false, error: "No tenant configured." }, { status: 400 });
    }

    // 5. Ingest.
    const { leadId, deduped } = await ingestLead(tenant.id, source, raw);

    return NextResponse.json({
      ok: true,
      leadId,
      deduped,
      source,
      ...(devMode
        ? { note: "MARKETPLACE_WEBHOOK_KEY is not set — running in dev mode without header auth." }
        : {}),
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to ingest lead." },
      { status: 400 }
    );
  }
}
