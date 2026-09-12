// Orbit — "Chat with your data" NL Copilot.
//
// Design law (safety): the LLM NEVER writes SQL. It only *classifies* a free-text
// question into one of a FIXED set of intents (+ an optional param). Our own code
// then runs the corresponding tenant-scoped Prisma aggregation and formats a
// natural-language answer. So the DB surface is always a curated allow-list.
//
// The classifier calls an OpenAI-compatible endpoint (same env vars as @/lib/ai:
// LLM_BASE_URL / LLM_API_KEY / LLM_MODEL). If that's unset or fails, it degrades to
// deterministic keyword matching — the copilot is ALWAYS demoable.

import { db } from "@/lib/db";
import { inr, inrLakh } from "@/lib/format";
import { formatElapsed } from "@/lib/tat";
import { getStudioConfig, optionValues, valuesByCategory } from "@/lib/studio/config";

// ── Intent registry ───────────────────────────────────────────
export const INTENTS = [
  "revenue_won",
  "cash_position",
  "receivables_outstanding",
  "pipeline_by_stage",
  "top_opportunities",
  "open_leads_count",
  "leads_by_source",
  "headcount",
  "payroll_liability",
  "low_stock_items",
  "gst_tax_collected",
  "open_tickets",
  "overdue_followups",
  "unknown",
] as const;

export type Intent = (typeof INTENTS)[number];

export type CopilotResult = { answer: string; data?: any; intent: Intent; source: "model" | "fallback" };

// Human-readable one-liners — used for the classifier prompt AND as UI hints.
export const INTENT_HELP: Record<Intent, string> = {
  revenue_won: "Total revenue from closed-won opportunities",
  cash_position: "Cash actually collected (paid invoices)",
  receivables_outstanding: "Money owed by customers (unpaid invoices)",
  pipeline_by_stage: "Open pipeline value grouped by deal stage",
  top_opportunities: "Largest open opportunities by amount",
  open_leads_count: "How many leads are still open (not converted/dead)",
  leads_by_source: "Lead counts broken down by acquisition source",
  headcount: "Number of active employees",
  payroll_liability: "Monthly payroll cost from the latest run",
  low_stock_items: "Inventory items at or below their reorder level",
  gst_tax_collected: "GST tax collected on finalized/paid invoices",
  open_tickets: "Support tickets that are open or in progress",
  overdue_followups: "Leads/opportunities whose follow-up date has passed and aren't closed yet",
  unknown: "Question not understood",
};

// ── LLM env (mirrors @/lib/ai, kept self-contained to avoid touching that file) ──
const llmBase = process.env.LLM_BASE_URL;
const llmKey = process.env.LLM_API_KEY;
const llmModel = process.env.LLM_MODEL || "llama-3.3-70b-versatile";

function trimSlash(u: string) {
  return u.replace(/\/+$/, "");
}

// Ask the LLM to classify → {intent, param?}. Throws on any problem so the caller
// can fall back to keyword matching.
async function classifyWithLLM(question: string): Promise<{ intent: Intent; param?: string }> {
  if (!llmBase || !llmKey) throw new Error("NO_LLM");

  const system =
    "You classify a business question into exactly ONE intent for an Indian SMB business OS. " +
    "Respond with ONLY compact JSON: {\"intent\":\"<one of the list>\",\"param\":\"<optional string>\"}. " +
    "No prose, no markdown. Use \"unknown\" if nothing fits. " +
    "Intents: " +
    INTENTS.map((i) => `${i} (${INTENT_HELP[i]})`).join("; ") +
    ".";

  const res = await fetch(`${trimSlash(llmBase)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmKey}`,
    },
    body: JSON.stringify({
      model: llmModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: question },
      ],
      max_tokens: 80,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}`);
  const data = await res.json();
  const txt: string = data?.choices?.[0]?.message?.content ?? "";
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("NO_JSON");
  const parsed = JSON.parse(m[0]);
  const intent = (INTENTS as readonly string[]).includes(parsed.intent) ? (parsed.intent as Intent) : "unknown";
  const param = parsed.param ? String(parsed.param) : undefined;
  return { intent, param };
}

// Deterministic fallback: keyword-match the question to an intent.
export function keywordIntent(question: string): Intent {
  const q = question.toLowerCase();
  const has = (...ws: string[]) => ws.some((w) => q.includes(w));

  if (has("overdue", "follow-up", "followup", "follow up")) return "overdue_followups";
  if (has("receivable", "owed", "outstanding", "unpaid", "collect from", "pending payment")) return "receivables_outstanding";
  if (has("cash", "collected", "in the bank", "cash position", "money in")) return "cash_position";
  if (has("revenue", "won", "closed won", "sales closed", "booked")) return "revenue_won";
  if (has("pipeline", "by stage", "funnel", "stages")) return "pipeline_by_stage";
  if (has("top opportunit", "biggest deal", "largest deal", "top deal", "biggest opportunit")) return "top_opportunities";
  if (has("lead") && has("source", "channel", "where", "come from")) return "leads_by_source";
  if (has("lead")) return "open_leads_count";
  if (has("headcount", "how many employee", "team size", "staff", "employees")) return "headcount";
  if (has("payroll", "salary cost", "wage bill", "payslip")) return "payroll_liability";
  if (has("low stock", "reorder", "stock out", "running low", "inventory low", "restock")) return "low_stock_items";
  if (has("gst", "tax collected", "tax", "cgst", "sgst", "igst")) return "gst_tax_collected";
  if (has("ticket", "support", "complaint")) return "open_tickets";

  return "unknown";
}

// ── Public entry point ────────────────────────────────────────
export async function askCopilot(tenantId: string, question: string): Promise<CopilotResult> {
  const clean = (question || "").trim();
  if (!clean) {
    return { answer: "Ask me a question about your business data.", intent: "unknown", source: "fallback" };
  }

  let intent: Intent;
  let source: "model" | "fallback";
  try {
    const r = await classifyWithLLM(clean);
    // If the model shrugs, still give keyword matching a chance to catch it.
    if (r.intent === "unknown") {
      intent = keywordIntent(clean);
      source = "fallback";
    } else {
      intent = r.intent;
      source = "model";
    }
  } catch {
    intent = keywordIntent(clean);
    source = "fallback";
  }

  const result = await runIntent(tenantId, intent);
  return { ...result, source };
}

// ── Intent → tenant-scoped Prisma query → answer ──────────────
// (`source` is attached by the caller, askCopilot — omitted from this return type
// since it reflects how the *intent* was classified, not this per-intent lookup.)
async function runIntent(t: string, intent: Intent): Promise<Omit<CopilotResult, "source">> {
  const config = await getStudioConfig(t);
  switch (intent) {
    case "revenue_won": {
      const agg = await db.opportunity.aggregate({
        where: { tenantId: t, stage: { in: valuesByCategory(config, "opportunity_stage", "won") } },
        _sum: { amount: true },
        _count: true,
      });
      const total = agg._sum.amount || 0;
      return {
        intent,
        data: { total, deals: agg._count },
        answer: `You've won ${inrLakh(total)} in revenue across ${agg._count} closed-won ${agg._count === 1 ? "deal" : "deals"}.`,
      };
    }

    case "cash_position": {
      const agg = await db.invoice.aggregate({
        where: { tenantId: t, status: "Paid" },
        _sum: { grandTotal: true },
        _count: true,
      });
      const cash = agg._sum.grandTotal || 0;
      return {
        intent,
        data: { cash, paidInvoices: agg._count },
        answer: `Your cash position is ${inrLakh(cash)}, collected from ${agg._count} paid ${agg._count === 1 ? "invoice" : "invoices"}.`,
      };
    }

    case "receivables_outstanding": {
      const agg = await db.invoice.aggregate({
        where: { tenantId: t, status: { in: ["Draft", "Finalized"] } },
        _sum: { grandTotal: true },
        _count: true,
      });
      const owed = agg._sum.grandTotal || 0;
      return {
        intent,
        data: { outstanding: owed, invoices: agg._count },
        answer: `You have ${inrLakh(owed)} in outstanding receivables across ${agg._count} unpaid ${agg._count === 1 ? "invoice" : "invoices"}.`,
      };
    }

    case "pipeline_by_stage": {
      const rows = await db.opportunity.groupBy({
        by: ["stage"],
        where: { tenantId: t },
        _sum: { amount: true },
        _count: true,
      });
      const order = optionValues(config, "opportunity_stage");
      const openStageValues = new Set(valuesByCategory(config, "opportunity_stage", "open"));
      const stages = order
        .map((st) => {
          const r = rows.find((x) => x.stage === st);
          return { stage: st, amount: r?._sum.amount || 0, count: r?._count || 0 };
        })
        .filter((s) => s.count > 0);
      const openValue = stages
        .filter((s) => openStageValues.has(s.stage))
        .reduce((a, s) => a + s.amount, 0);
      return {
        intent,
        data: { stages },
        answer: `Open pipeline is ${inrLakh(openValue)}. ${stages
          .map((s) => `${s.stage}: ${inrLakh(s.amount)} (${s.count})`)
          .join(" · ")}.`,
      };
    }

    case "top_opportunities": {
      const rows = await db.opportunity.findMany({
        where: { tenantId: t, stage: { in: valuesByCategory(config, "opportunity_stage", "open") } },
        orderBy: { amount: "desc" },
        take: 5,
        select: { id: true, name: true, amount: true, stage: true, probability: true },
      });
      if (rows.length === 0) return { intent, data: { rows }, answer: "No open opportunities right now." };
      return {
        intent,
        data: { rows },
        answer: `Your top ${rows.length} open ${rows.length === 1 ? "opportunity is" : "opportunities are"}: ${rows
          .map((r) => `${r.name} (${inrLakh(r.amount)}, ${r.stage})`)
          .join(", ")}.`,
      };
    }

    case "open_leads_count": {
      const [open, total] = await Promise.all([
        db.lead.count({ where: { tenantId: t, status: { notIn: valuesByCategory(config, "lead_status", "converted", "dead") } } }),
        db.lead.count({ where: { tenantId: t } }),
      ]);
      return {
        intent,
        data: { open, total },
        answer: `You have ${open} open ${open === 1 ? "lead" : "leads"} (out of ${total} total) still to work.`,
      };
    }

    case "leads_by_source": {
      const rows = await db.lead.groupBy({
        by: ["source"],
        where: { tenantId: t },
        _count: true,
      });
      const sources = rows
        .map((r) => ({ source: r.source, count: r._count }))
        .sort((a, b) => b.count - a.count);
      if (sources.length === 0) return { intent, data: { sources }, answer: "No leads yet." };
      return {
        intent,
        data: { sources },
        answer: `Leads by source — ${sources.map((s) => `${s.source}: ${s.count}`).join(", ")}.`,
      };
    }

    case "headcount": {
      const count = await db.employee.count({ where: { tenantId: t, active: true } });
      return {
        intent,
        data: { headcount: count },
        answer: `You have ${count} active ${count === 1 ? "employee" : "employees"} on the payroll.`,
      };
    }

    case "payroll_liability": {
      const run = await db.payrollRun.findFirst({ where: { tenantId: t }, orderBy: { createdAt: "desc" } });
      if (!run) return { intent, data: null, answer: "No payroll run has been created yet." };
      const liability = run.netTotal + run.pfTotal + run.esiTotal;
      return {
        intent,
        data: { month: run.month, year: run.year, net: run.netTotal, pf: run.pfTotal, esi: run.esiTotal, liability },
        answer: `Your latest payroll liability (${run.month}/${run.year}) is ${inrLakh(liability)} — net pay ${inrLakh(
          run.netTotal
        )} + PF ${inr(run.pfTotal)} + ESI ${inr(run.esiTotal)}.`,
      };
    }

    case "low_stock_items": {
      const items = await db.item.findMany({
        where: { tenantId: t },
        select: { id: true, name: true, sku: true, onHand: true, reorderLevel: true, uom: true },
      });
      const low = items
        .filter((i) => i.onHand <= i.reorderLevel)
        .sort((a, b) => a.onHand - b.onHand);
      if (low.length === 0) return { intent, data: { low }, answer: "All items are above their reorder level — no restocking needed." };
      return {
        intent,
        data: { low },
        answer: `${low.length} ${low.length === 1 ? "item is" : "items are"} at or below reorder level: ${low
          .map((i) => `${i.name} (${i.onHand}/${i.reorderLevel} ${i.uom})`)
          .join(", ")}.`,
      };
    }

    case "gst_tax_collected": {
      const agg = await db.invoice.aggregate({
        where: { tenantId: t, status: { in: ["Finalized", "Paid"] } },
        _sum: { cgst: true, sgst: true, igst: true },
      });
      const cgst = agg._sum.cgst || 0;
      const sgst = agg._sum.sgst || 0;
      const igst = agg._sum.igst || 0;
      const total = cgst + sgst + igst;
      return {
        intent,
        data: { cgst, sgst, igst, total },
        answer: `GST collected on finalized/paid invoices is ${inrLakh(total)} — CGST ${inr(cgst)}, SGST ${inr(
          sgst
        )}, IGST ${inr(igst)}.`,
      };
    }

    case "open_tickets": {
      const rows = await db.ticket.groupBy({
        by: ["priority"],
        where: { tenantId: t, status: { in: valuesByCategory(config, "ticket_status", "open") } },
        _count: true,
      });
      const total = rows.reduce((a, r) => a + r._count, 0);
      const byPriority = rows.map((r) => ({ priority: r.priority, count: r._count })).sort((a, b) => b.count - a.count);
      if (total === 0) return { intent, data: { total, byPriority }, answer: "No open tickets — support queue is clear." };
      return {
        intent,
        data: { total, byPriority },
        answer: `You have ${total} open ${total === 1 ? "ticket" : "tickets"}${
          byPriority.length ? ` (${byPriority.map((p) => `${p.priority}: ${p.count}`).join(", ")})` : ""
        }.`,
      };
    }

    case "overdue_followups": {
      const now = new Date();
      // Same shape as the dashboard's "Overdue follow-ups" card (app/(app)/dashboard/page.tsx):
      // followUpAt in the past AND the record hasn't reached a terminal category yet.
      const overdueLeadWhere = {
        tenantId: t,
        followUpAt: { lt: now },
        status: { notIn: valuesByCategory(config, "lead_status", "converted", "dead") },
      };
      const overdueOppWhere = {
        tenantId: t,
        followUpAt: { lt: now },
        stage: { notIn: valuesByCategory(config, "opportunity_stage", "won", "lost") },
      };
      const [leads, leadTotal, opps, oppTotal] = await Promise.all([
        db.lead.findMany({ where: overdueLeadWhere, orderBy: { followUpAt: "asc" }, take: 5, select: { id: true, name: true, followUpAt: true } }),
        db.lead.count({ where: overdueLeadWhere }),
        db.opportunity.findMany({ where: overdueOppWhere, orderBy: { followUpAt: "asc" }, take: 5, select: { id: true, name: true, followUpAt: true } }),
        db.opportunity.count({ where: overdueOppWhere }),
      ]);
      const items = [
        ...leads.map((l) => ({ id: l.id, module: "leads" as const, name: l.name, followUpAt: l.followUpAt as Date })),
        ...opps.map((o) => ({ id: o.id, module: "opportunities" as const, name: o.name, followUpAt: o.followUpAt as Date })),
      ]
        .sort((a, b) => a.followUpAt.getTime() - b.followUpAt.getTime())
        .slice(0, 5);
      const total = leadTotal + oppTotal;
      if (total === 0) return { intent, data: { total, items }, answer: "No overdue follow-ups — you're all caught up." };
      return {
        intent,
        data: { total, items },
        answer: `You have ${total} overdue ${total === 1 ? "follow-up" : "follow-ups"}: ${items
          .map((i) => `${i.name} (${formatElapsed(i.followUpAt, now)} overdue)`)
          .join(", ")}.`,
      };
    }

    default:
      return {
        intent: "unknown",
        answer:
          "I couldn't map that to a known metric. Try asking about revenue, cash position, receivables, pipeline, top opportunities, open leads, leads by source, headcount, payroll, low stock, GST collected, open tickets, or overdue follow-ups.",
      };
  }
}
