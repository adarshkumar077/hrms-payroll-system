import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { aiEnabled, aiProviderLabel } from "@/lib/ai";
import { planLimits, getSubscription, planOf, PLANS } from "@/lib/billing";
import { PageHeader, Empty } from "@/components/ui";
import { InterviewForm } from "./InterviewForm";

export const dynamic = "force-dynamic";

/**
 * Orbit Studio — AI onboarding interview (WS8): "describe your business,
 * Orbit configures itself." AI drafts a configuration (module renames +
 * picklists + custom fields), human reviews the diff, human applies —
 * nothing is written until the explicit Apply click (InterviewForm.tsx +
 * actions.ts). Degrades silently: with no LLM configured, the interview
 * still works — it returns the closest of the 5 built-in industry packs
 * (lib/ai.ts's draftStudioConfig keyword-matches the answers) instead of a
 * model-drafted config.
 */
export default async function StudioInterviewPage() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Describe your business" subtitle="Orbit configures itself from a short interview." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  const [sub, limits] = await Promise.all([getSubscription(s.tenantId), planLimits(s.tenantId)]);
  const planName = PLANS[planOf(sub.plan)].name;

  return (
    <div>
      <PageHeader
        title="Describe your business"
        subtitle="Answer four questions — Orbit drafts a configuration you can review before anything changes."
        action={
          <Link href="/studio/templates" className="btn-ghost text-xs py-1.5">
            ← Templates
          </Link>
        }
      />

      {!limits.aiOnboarding ? (
        <div className="card p-5 border-l-4 border-l-amber-500 bg-amber-50">
          <div className="font-semibold text-amber-800">AI onboarding is a Growth &amp; Scale feature</div>
          <p className="mt-1 text-sm text-amber-700">
            You&apos;re on the {planName} plan. Upgrade to Growth or Scale to have Orbit draft a tailored
            configuration from a plain-language description of your business — you can still apply any of our
            ready-made industry templates today.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href="/billing" className="btn text-xs py-1.5">
              Upgrade in Billing
            </Link>
            <Link href="/studio/templates" className="btn-ghost text-xs py-1.5">
              ← Back to Templates
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="card p-4 mb-6 border-l-4 border-l-brand-600">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${aiEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                ✨ AI {aiEnabled ? `Live · ${aiProviderLabel}` : "Offline"}
              </span>
              <span className="text-sm text-slate-600">
                {aiEnabled
                  ? `Connected to ${aiProviderLabel} — your answers go to the model to draft a tailored configuration.`
                  : "AI offline — you'll get the closest of our 5 industry templates instead, no model call made."}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Every AI action here is a suggestion into a human-approved step — the model drafts, you decide what's applied.
            </p>
          </div>

          <InterviewForm />
        </>
      )}
    </div>
  );
}
