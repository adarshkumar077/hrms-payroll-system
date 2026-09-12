import { requireSession } from "@/lib/auth";
import { aiEnabled, aiProviderLabel } from "@/lib/ai";
import { PageHeader } from "@/components/ui";
import { CopilotChat } from "./CopilotChat";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  const s = await requireSession();
  if (!(await can(s, "ai", "read"))) return <NoAccess label="AI" />;

  return (
    <div>
      <PageHeader
        title="Copilot — Chat with your data"
        subtitle="Ask a business question in plain English. Answers come from your live, tenant-scoped data."
      />

      <div className="card p-4 mb-6 border-l-4 border-l-brand-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${aiEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
            ✨ AI {aiEnabled ? `Live · ${aiProviderLabel}` : "Local fallback"}
          </span>
          <span className="text-sm text-slate-600">
            {aiEnabled
              ? `${aiProviderLabel} only classifies your question into a known metric — it never touches the database directly.`
              : "No LLM configured — questions are keyword-matched to known metrics. Everything below still works."}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          The model picks an intent; Orbit runs the safe, tenant-scoped query. No raw SQL is ever generated.
        </p>
      </div>

      <CopilotChat />
    </div>
  );
}
