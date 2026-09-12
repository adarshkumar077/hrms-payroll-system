"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";
import { scoreLead, draftFollowUp, summarizeCall } from "@/lib/ai";
import { getStudioConfig, options } from "@/lib/studio/config";

// ── AI-5: Lead Scoring ────────────────────────────────────────
// Re-score every lead for the tenant: persist score + scoreReason, emit "lead.scored".
export async function rescoreAllLeadsAction() {
  const s = await requireSession();
  const leads = await db.lead.findMany({ where: { tenantId: s.tenantId } });

  // Load config once and build a source value → category map, instead of
  // re-fetching per lead inside the loop.
  const config = await getStudioConfig(s.tenantId);
  const categoryBySource = new Map(options(config, "lead_source").map((o) => [o.value, o.category]));

  for (const lead of leads) {
    const { score, reason } = await scoreLead(
      {
        name: lead.name,
        company: lead.company,
        source: lead.source,
        email: lead.email,
        phone: lead.phone,
      },
      { sourceCategory: categoryBySource.get(lead.source) ?? null }
    );
    await db.lead.update({ where: { id: lead.id }, data: { score, scoreReason: reason } });
    await emit({
      tenantId: s.tenantId,
      type: "lead.scored",
      entity: "Lead",
      entityId: lead.id,
      actorId: s.userId,
      payload: { note: `AI re-scored ${lead.name}: ${score}`, score, reason },
    });
  }

  revalidatePath("/ai");
  revalidatePath("/leads");
}

// ── AI-2: Follow-up Drafting ──────────────────────────────────
// Draft (never send) a follow-up. If a leadId is given, prefer that lead's real data;
// otherwise fall back to typed name/company. Returns text for a human to review + edit.
export async function draftFollowUpAction(input: {
  leadId?: string;
  name?: string;
  company?: string;
  channel: "email" | "whatsapp";
  context?: string;
}): Promise<{ text: string }> {
  const s = await requireSession();

  let leadName = (input.name || "").trim();
  let company = (input.company || "").trim();
  let context = input.context || "";

  if (input.leadId) {
    const lead = await db.lead.findFirst({ where: { id: input.leadId, tenantId: s.tenantId } });
    if (lead) {
      leadName = lead.name;
      company = lead.company || company;
      context = `${context} Lead source: ${lead.source}. Current status: ${lead.status}.`.trim();
    }
  }

  if (!leadName) return { text: "" };

  const text = await draftFollowUp({
    leadName,
    company: company || null,
    channel: input.channel,
    context,
  });

  return { text };
}

// ── AI-3: Call Summarizer ─────────────────────────────────────
// Summarize a pasted transcript (2 bullets + next-step). No writes here — pure suggestion.
export async function summarizeCallAction(transcript: string): Promise<{ summary: string }> {
  await requireSession();
  const clean = (transcript || "").trim();
  if (!clean) return { summary: "" };
  const summary = await summarizeCall(clean);
  return { summary };
}

// Human-confirmed step: persist the reviewed summary as a Call activity, emit "call.summarized".
export async function saveCallActivityAction(input: {
  subject: string;
  summary: string;
}): Promise<{ ok: boolean }> {
  const s = await requireSession();
  const summary = (input.summary || "").trim();
  if (!summary) return { ok: false };

  const subject = (input.subject || "").trim() || "Call summary";

  const activity = await db.activity.create({
    data: {
      tenantId: s.tenantId,
      type: "Call",
      subject,
      summary,
      done: true,
      ownerId: s.userId,
    },
  });

  await emit({
    tenantId: s.tenantId,
    type: "call.summarized",
    entity: "Activity",
    entityId: activity.id,
    actorId: s.userId,
    payload: { note: `Call summary saved: ${subject}` },
  });

  revalidatePath("/ai");
  return { ok: true };
}
