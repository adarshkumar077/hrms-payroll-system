import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { parseCallWebhook, isTerminalCallStatus } from "@/lib/telephony";
import { normalizeValue } from "@/lib/studio/dedupe";
import { emit } from "@/lib/events";
import { rateLimit, clientKey } from "@/lib/ratelimit";

// Inbound telephony webhook — Exotel's Passthru applet hits this on every
// call leg event (queued/ringing/in-progress/completed/...). Exotel passthru
// webhooks are GET requests with plain query params and carry no request
// signature, so — per docs/ai/design/wave-d-contracts.md's Adapter interfaces
// section — auth is a `token` query param compared with crypto.timingSafeEqual
// against TELEPHONY_WEBHOOK_TOKEN. POST is also supported (form/JSON body)
// for providers/tests that prefer it; the token still travels in the query
// string either way.
//
//   GET/POST /api/webhooks/telephony?token=<TELEPHONY_WEBHOOK_TOKEN>
//     503  TELEPHONY_WEBHOOK_TOKEN unset (webhook not configured)
//     401  token missing or doesn't match
//     400  no CallSid in the payload / no tenant configured
//     200  { ok: true, callId, status }

export const dynamic = "force-dynamic";

function checkToken(token: string | null): number | null {
  const expected = process.env.TELEPHONY_WEBHOOK_TOKEN;
  if (!expected) return 503;
  if (!token) return 401;
  const expectedBuf = Buffer.from(expected, "utf8");
  const givenBuf = Buffer.from(token, "utf8");
  if (expectedBuf.length !== givenBuf.length) return 401;
  return crypto.timingSafeEqual(expectedBuf, givenBuf) ? null : 401;
}

/** Flatten a GET's query string and (for POST) a form/JSON body into one params bag. */
async function collectParams(req: Request): Promise<Record<string, string>> {
  const url = new URL(req.url);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (k !== "token") params[k] = v;
  });

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) {
        const json = await req.json();
        if (json && typeof json === "object") {
          for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
            if (k !== "token" && v != null) params[k] = String(v);
          }
        }
      } else if (contentType.includes("form")) {
        const form = await req.formData();
        for (const [k, v] of form.entries()) {
          if (k !== "token" && typeof v === "string") params[k] = v;
        }
      }
    } catch {
      // Malformed body — fall back to whatever query params we already have.
    }
  }

  return params;
}

type PhoneMatch = { leadId: string | null; contactId: string | null; accountId: string | null };

/**
 * Match a call's counterpart number (the lead/contact/account's side of the
 * call, not Orbit's own Exotel number) against Lead/Contact/Account by phone.
 * Reuses lib/studio/dedupe.ts's India phone normalization (last-10-digits) so
 * "+91 98200 12345" and "098200-12345" match the same stored value.
 *
 * Pragmatic overfetch (same tradeoff dedupe.ts documents): stored phone
 * numbers aren't normalized in the DB, so an exact/endsWith SQL filter can't
 * reliably find them across formatting variants. This pulls each module's
 * most-recent phone-having rows and does the precise comparison in JS. Fine
 * at demo scale; a production rollout would maintain a normalized-phone index
 * column instead of overfetching per webhook hit.
 */
async function matchByPhone(tenantId: string, rawPhone: string): Promise<PhoneMatch> {
  const norm = normalizeValue("phone", rawPhone);
  if (!norm) return { leadId: null, contactId: null, accountId: null };

  const [leads, contacts, accounts] = await Promise.all([
    db.lead.findMany({
      where: { tenantId, phone: { not: null } },
      select: { id: true, phone: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.contact.findMany({
      where: { tenantId, phone: { not: null } },
      select: { id: true, phone: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.account.findMany({
      where: { tenantId, phone: { not: null } },
      select: { id: true, phone: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);

  const find = (rows: { id: string; phone: string | null }[]) =>
    rows.find((r) => normalizeValue("phone", r.phone) === norm)?.id ?? null;

  return { leadId: find(leads), contactId: find(contacts), accountId: find(accounts) };
}

async function handle(req: Request) {
  const { ok, retryAfter } = rateLimit(`telephony-webhook:${clientKey(req)}`, 60, 60_000); // 60/min per IP
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const url = new URL(req.url);
  const tokenStatus = checkToken(url.searchParams.get("token"));
  if (tokenStatus) {
    const error = tokenStatus === 503 ? "Telephony webhook not configured." : "Invalid or missing token.";
    return NextResponse.json({ ok: false, error }, { status: tokenStatus });
  }

  const rawParams = await collectParams(req);
  const evt = parseCallWebhook(rawParams);
  if (!evt.providerCallId) {
    return NextResponse.json({ ok: false, error: "Missing CallSid." }, { status: 400 });
  }

  // Single-tenant v1 (mirrors app/api/marketplace/[source]/route.ts's
  // documented limitation): Exotel's Passthru applet posts only call fields —
  // no tenant identifier — so, like the marketplace webhook, this resolves to
  // the FIRST tenant in the DB. Fine for this single-tenant demo deployment;
  // a real multi-tenant rollout needs a per-tenant webhook path or key (e.g.
  // /api/webhooks/telephony/<tenantSlug>?token=...) instead of findFirst().
  const tenant = await db.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "No tenant configured." }, { status: 400 });
  }

  // The counterpart number to match against Lead/Contact/Account is whichever
  // side of the call ISN'T Orbit's own line: the caller on inbound, the
  // callee on outbound.
  const counterpartPhone = evt.direction === "inbound" ? evt.from : evt.to;
  const matched = await matchByPhone(tenant.id, counterpartPhone);

  const existing = await db.call.findFirst({
    where: { tenantId: tenant.id, providerCallId: evt.providerCallId },
  });

  let call;
  let justBecameTerminal: boolean;

  if (!existing) {
    call = await db.call.create({
      data: {
        tenantId: tenant.id,
        direction: evt.direction,
        fromNumber: evt.from,
        toNumber: evt.to,
        status: evt.status,
        durationSec: evt.durationSec ?? null,
        providerCallId: evt.providerCallId,
        leadId: matched.leadId,
        contactId: matched.contactId,
        accountId: matched.accountId,
        startedAt: evt.startedAt,
        endedAt: evt.endedAt ?? null,
      },
    });
    // Guard on "previous status": for a brand-new row the previous status is
    // implicitly non-terminal (the call didn't exist yet), so a first event
    // that already arrives terminal (e.g. a very fast completed/failed call)
    // still fires "call.logged" exactly once.
    justBecameTerminal = isTerminalCallStatus(evt.status);
  } else {
    const wasTerminal = isTerminalCallStatus(existing.status);
    call = await db.call.update({
      where: { id: existing.id },
      data: {
        status: evt.status,
        durationSec: evt.durationSec ?? existing.durationSec,
        endedAt: evt.endedAt ?? existing.endedAt,
        // Don't clobber a match found on an earlier event with a null from a
        // later one (e.g. the counterpart number is blank on some Exotel leg
        // events) — only fill in ids that aren't already set.
        leadId: existing.leadId ?? matched.leadId,
        contactId: existing.contactId ?? matched.contactId,
        accountId: existing.accountId ?? matched.accountId,
      },
    });
    justBecameTerminal = isTerminalCallStatus(evt.status) && !wasTerminal;
  }

  if (justBecameTerminal) {
    await emit({
      tenantId: tenant.id,
      type: "call.logged",
      entity: "Call",
      entityId: call.id,
      payload: {
        note: `${call.direction === "inbound" ? "Inbound" : "Outbound"} call ${call.status} — ${call.fromNumber} → ${call.toNumber}`,
        status: call.status,
        durationSec: call.durationSec,
      },
    });
  }

  return NextResponse.json({ ok: true, callId: call.id, status: call.status });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
