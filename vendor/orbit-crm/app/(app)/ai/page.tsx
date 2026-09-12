import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { aiEnabled, aiProviderLabel } from "@/lib/ai";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { RescoreButton } from "./RescoreButton";
import { FollowUpCard } from "./FollowUpCard";
import { CallSummarizerCard } from "./CallSummarizerCard";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

function scoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

const barColor: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
};

function ScoreBar({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${barColor[tone]}`} style={{ width: `${score}%` }} />
      </div>
      <Badge tone={tone}>{score}</Badge>
    </div>
  );
}

export default async function AiConsolePage() {
  const s = await requireSession();
  if (!(await can(s, "ai", "read"))) return <NoAccess label="AI" />;
  const t = s.tenantId;

  const [leads, hot, cold, scoredCount] = await Promise.all([
    db.lead.findMany({ where: { tenantId: t }, orderBy: [{ score: "desc" }, { createdAt: "desc" }] }),
    db.lead.count({ where: { tenantId: t, score: { gte: 70 } } }),
    db.lead.count({ where: { tenantId: t, score: { lt: 40, not: null } } }),
    db.lead.count({ where: { tenantId: t, score: { not: null } } }),
  ]);

  const leadOptions = leads.map((l) => ({ id: l.id, name: l.name, company: l.company }));

  return (
    <div>
      <PageHeader
        title="AI Console"
        subtitle="Three shipped AI capabilities — each embedded in a human-approved workflow step."
      />

      {/* Explainer banner */}
      <div className="card p-4 mb-6 border-l-4 border-l-brand-600">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`badge ${
              aiEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            ✨ AI {aiEnabled ? `Live · ${aiProviderLabel}` : "Local fallback"}
          </span>
          <span className="text-sm text-slate-600">
            {aiEnabled
              ? `Connected to ${aiProviderLabel} — live model responses.`
              : "No LLM configured in .env — using deterministic local heuristics. Everything below still works."}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Every AI action is a suggestion into a human-approved step. This is why it lands where 95% of
          GenAI pilots fail.
        </p>
      </div>

      {/* ── AI-5: Lead Scoring ── */}
      <section className="mb-8">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">Lead Scoring</h2>
              <span className="badge bg-amber-100 text-amber-700">AI-5</span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              Score = conversion likelihood. Green ≥ 70, amber 40–69, red &lt; 40.
            </p>
          </div>
          <RescoreButton count={leads.length} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <StatCard label="Hot leads" value={String(hot)} accent="green" hint="Score ≥ 70" />
          <StatCard label="Cold leads" value={String(cold)} accent="red" hint="Score < 40" />
          <StatCard
            label="Scored"
            value={`${scoredCount} / ${leads.length}`}
            accent="brand"
            hint="Leads with an AI score"
          />
        </div>

        {leads.length === 0 ? (
          <Empty>No leads yet — add leads under /leads to score them.</Empty>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Company</th>
                  <th className="th">Source</th>
                  <th className="th">Status</th>
                  <th className="th">Score</th>
                  <th className="th">Scored by</th>
                  <th className="th">AI reason</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="td font-medium text-slate-800">{lead.name}</td>
                    <td className="td text-slate-600">{lead.company || "—"}</td>
                    <td className="td">
                      <Badge tone="slate">{lead.source}</Badge>
                    </td>
                    <td className="td">
                      <Badge tone="slate">{lead.status}</Badge>
                    </td>
                    <td className="td">
                      {lead.score == null ? (
                        <span className="text-slate-400">Unscored</span>
                      ) : (
                        <ScoreBar score={lead.score} />
                      )}
                    </td>
                    <td className="td">
                      {lead.score == null ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span
                          className={`badge text-[10px] ${
                            aiEnabled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                          }`}
                          title={
                            aiEnabled
                              ? "Scored by the live model when this ran (falls back per-call if the model errors)."
                              : "No LLM configured — this score is from the local heuristic, not a model."
                          }
                        >
                          {aiEnabled ? "AI" : "estimated"}
                        </span>
                      )}
                    </td>
                    <td className="td text-slate-500 max-w-[220px] truncate" title={lead.scoreReason || ""}>
                      {lead.scoreReason || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── AI-2 + AI-3 ── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <FollowUpCard leads={leadOptions} />
        <CallSummarizerCard />
      </section>
    </div>
  );
}
