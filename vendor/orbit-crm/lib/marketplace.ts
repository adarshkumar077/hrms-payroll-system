// Orbit — Marketplace lead ingestion core.
//
// Real Indian B2B marketplaces (IndiaMART, JustDial, TradeIndia) push buyer
// enquiries to a seller-configured webhook (a "push API" / "lead pull API").
// Each provider ships a *different* JSON shape, so we normalize every payload
// into our Lead model via a per-source adapter, then AI-score and persist it.
//
// This module is the single place that understands provider payload formats.
// The webhook route (app/api/marketplace/[source]/route.ts) just authenticates,
// resolves the tenant and delegates here.

import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { scoreLead } from "@/lib/ai";
import { getStudioConfig, options } from "@/lib/studio/config";
import { checkDuplicates } from "@/lib/studio/dedupe";

// Supported inbound sources. Kept as a const tuple so we get a union type + a
// runtime list for validation in the webhook route.
// NOTE: this is the webhook ROUTE registry (which provider adapters exist), not
// the tenant-facing source list — that's the Studio `lead_source` picklist.
export const SOURCES = ["IndiaMART", "JustDial", "TradeIndia", "Website"] as const;
export type Source = (typeof SOURCES)[number];

export function isSource(x: string): x is Source {
  return (SOURCES as readonly string[]).includes(x);
}

// Normalized shape we build before touching the DB.
export type NormalizedLead = {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  // Free-text of what the buyer asked about — folded into the AI scoring context
  // and kept human-readable for the reason string. Not a schema column, so it's
  // only used transiently here.
  enquiry: string | null;
};

// ── Provider field mappings ───────────────────────────────────
// Each block documents the *real* field names each marketplace sends, then maps
// them onto NormalizedLead. Providers are inconsistent about casing and nesting,
// so we defensively read a few aliases per field.

function first(...vals: any[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/**
 * Normalize a raw provider payload into a NormalizedLead.
 *
 * IndiaMART — Push/Pull Lead Manager CRM API. Buyer enquiries arrive with
 *   SCREAMING_SNAKE keys, e.g.:
 *     SENDER_NAME, SENDER_MOBILE, SENDER_EMAIL, SENDER_COMPANY,
 *     QUERY_PRODUCT_NAME, QUERY_MESSAGE, SENDER_CITY, SENDER_STATE,
 *     UNIQUE_QUERY_ID. (Docs: seller.indiamart.com Lead Manager → CRM API.)
 *
 * JustDial — Lead/Enquiry webhook posts lowercase keys:
 *     name, mobile, email, company, city, category, area, brancharea.
 *   (Some tenants receive `phone` instead of `mobile`.)
 *
 * TradeIndia — Inquiry API returns keys like:
 *     sender_name / c_person, sender_mobile / mobile, sender_email / email,
 *     sender_company / company, product_name, subject, message.
 *
 * Website — our own contact/enquiry form. We control the shape:
 *     name, email, phone, company, message.
 */
export function normalize(source: Source, raw: any): NormalizedLead {
  const r = raw || {};
  switch (source) {
    case "IndiaMART":
      return {
        name: first(r.SENDER_NAME, r.sender_name, r.name) || "IndiaMART Buyer",
        company: first(r.SENDER_COMPANY, r.sender_company, r.company),
        email: first(r.SENDER_EMAIL, r.sender_email, r.email),
        phone: first(r.SENDER_MOBILE, r.SENDER_PHONE, r.sender_mobile, r.mobile, r.phone),
        enquiry: first(r.QUERY_PRODUCT_NAME, r.QUERY_MESSAGE, r.query_product_name, r.message),
      };
    case "JustDial":
      return {
        name: first(r.name, r.customer_name) || "JustDial Enquiry",
        company: first(r.company, r.firm),
        email: first(r.email),
        phone: first(r.mobile, r.phone, r.contact),
        enquiry: first(r.category, r.requirement, r.message),
      };
    case "TradeIndia":
      return {
        name: first(r.sender_name, r.c_person, r.name) || "TradeIndia Buyer",
        company: first(r.sender_company, r.company),
        email: first(r.sender_email, r.email),
        phone: first(r.sender_mobile, r.mobile, r.phone),
        enquiry: first(r.product_name, r.subject, r.message),
      };
    case "Website":
    default:
      return {
        name: first(r.name, r.fullName) || "Website Visitor",
        company: first(r.company, r.organisation, r.organization),
        email: first(r.email),
        phone: first(r.phone, r.mobile, r.contact),
        enquiry: first(r.message, r.enquiry, r.subject),
      };
  }
}

/**
 * Ingest one raw provider payload for a tenant:
 *  1. normalize → NormalizedLead
 *  2. de-dup: run the tenant's Studio DedupeRule (lib/studio/dedupe.ts) against
 *     the buyer's email/phone → skip and return the existing lead's id on a hit
 *  3. create the Lead with the correct `source`
 *  4. AI-score it (scoreLead degrades to a local heuristic) and persist score
 *  5. emit `lead.captured`
 */
export async function ingestLead(
  tenantId: string,
  source: Source,
  raw: any
): Promise<{ leadId: string; deduped: boolean }> {
  const n = normalize(source, raw);

  // ── De-dup, via the configurable Studio engine ──
  // The old hardcoded rule unconditionally skipped ingestion on any 24h
  // phone/email match. checkDuplicates() defaults new tenants to the same
  // fields (email OR phone) but mode "warn", which by itself would now
  // *ingest* those matches instead of skipping them — a behavior change we
  // don't want here. Marketplace webhooks are retried liberally by providers
  // (timeouts, redelivery, etc.), and a double-ingested lead is worse than a
  // once-in-a-while missed one, so the webhook path treats ANY match as a
  // skip regardless of the configured mode (warn or block are both treated as
  // block here). Only an explicitly disabled rule (mode "off", i.e. no
  // matches returned) lets ingestion through unconditionally.
  // Note: unlike the old rule, this is not time- or status-scoped — it will
  // also match older/"Dead" leads, since DedupeRule matching is generic and
  // has no concept of a rolling window. See lib/studio/dedupe.ts.
  const dedupe = await checkDuplicates(tenantId, "leads", { email: n.email, phone: n.phone });
  if (dedupe.matches.length > 0) {
    return { leadId: dedupe.matches[0].id, deduped: true };
  }

  // ── Create the lead ──
  const lead = await db.lead.create({
    data: {
      tenantId,
      name: n.name,
      company: n.company,
      email: n.email,
      phone: n.phone,
      source, // one of SOURCES — matches the Lead.source convention
      status: "New",
    },
  });

  // ── AI score (safe: falls back to deterministic heuristic if no LLM) ──
  try {
    const config = await getStudioConfig(tenantId);
    const sourceOption = options(config, "lead_source").find((o) => o.value === lead.source);
    const { score, reason } = await scoreLead(
      {
        name: lead.name,
        company: lead.company,
        source: lead.source,
        email: lead.email,
        phone: lead.phone,
      },
      { sourceCategory: sourceOption?.category ?? null }
    );
    // Fold the buyer's enquiry text into the stored reason for sales context.
    const reasonWithEnquiry = n.enquiry ? `${reason} · re: ${n.enquiry}`.slice(0, 240) : reason;
    await db.lead.update({
      where: { id: lead.id },
      data: { score, scoreReason: reasonWithEnquiry },
    });
  } catch {
    // Never let scoring failure drop a captured lead — leave score null.
  }

  await emit({
    tenantId,
    type: "lead.captured",
    entity: "Lead",
    entityId: lead.id,
    payload: { source, name: lead.name, company: lead.company, enquiry: n.enquiry },
  });

  return { leadId: lead.id, deduped: false };
}

/**
 * A realistic example payload per source, matching each provider's real field
 * names. Used by the Integrations console "Simulate incoming lead" button and
 * handy as fixture data.
 */
export function samplePayload(source: Source): Record<string, any> {
  switch (source) {
    case "IndiaMART":
      return {
        RESPONSE: "success",
        UNIQUE_QUERY_ID: "2024" + Math.floor(Math.random() * 1e7),
        SENDER_NAME: "Ramesh Gupta",
        SENDER_MOBILE: "+91-98200-12345",
        SENDER_EMAIL: "ramesh@guptaindustries.in",
        SENDER_COMPANY: "Gupta Industries Pvt Ltd",
        SENDER_CITY: "Ahmedabad",
        SENDER_STATE: "Gujarat",
        QUERY_PRODUCT_NAME: "SS 304 Seamless Pipe 2 inch",
        QUERY_MESSAGE: "Need 500 meters, please share best rate and delivery to Ahmedabad.",
      };
    case "JustDial":
      return {
        name: "Priya Nair",
        mobile: "9847011223",
        email: "priya.nair@example.com",
        company: "Nair Constructions",
        city: "Kochi",
        category: "TMT Steel Bars Dealers",
        requirement: "Enquiry for Fe500D 12mm bars, bulk order.",
      };
    case "TradeIndia":
      return {
        sender_name: "Arjun Mehta",
        sender_mobile: "8090011223",
        sender_email: "arjun@mehtatraders.com",
        sender_company: "Mehta Traders",
        product_name: "Industrial Air Compressor 10 HP",
        subject: "Bulk enquiry — Air Compressor",
        message: "Looking for 10 units, need quotation with GST.",
      };
    case "Website":
    default:
      return {
        name: "Sunita Reddy",
        email: "sunita@reddyfoods.co.in",
        phone: "9000012345",
        company: "Reddy Foods",
        message: "Requesting a demo of your ERP for our 3 plants.",
      };
  }
}
