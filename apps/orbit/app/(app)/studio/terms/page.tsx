import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/rbac";
import { PageHeader, Empty, Badge } from "@/components/ui";
import { TermsForm } from "./TermsForm";
import { TermsRowActions } from "./TermsRowActions";

export const dynamic = "force-dynamic";

/**
 * Orbit Studio — Quote Terms (WS10).
 * Two independent template collections: Terms & Conditions and Payment terms.
 * Each tenant can set a default for each kind. Templates are used when
 * creating quotations.
 */
export default async function StudioTermsPage() {
  const s = await requireSession();
  if (!(await can(s, "studio", "write"))) {
    return (
      <div>
        <PageHeader title="Quote Terms" subtitle="Manage terms & conditions and payment terms templates." />
        <Empty>Studio is admin-only — ask your administrator for access.</Empty>
      </div>
    );
  }

  const terms = await db.quoteTerms.findMany({
    where: { tenantId: s.tenantId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });

  const termsTemplates = terms.filter((t) => t.kind === "terms");
  const paymentTemplates = terms.filter((t) => t.kind === "payment");

  return (
    <div>
      <PageHeader
        title="Quote Terms"
        subtitle="Create and manage templates for terms & conditions and payment terms in quotations."
        action={
          <Link href="/studio" className="btn-ghost text-xs py-1.5">
            ← Studio
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Terms & Conditions Templates */}
        <div className="card overflow-hidden">
          <div className="px-4 pt-4 pb-2 font-semibold text-slate-800">Terms & Conditions Templates</div>
          <p className="px-4 pb-3 text-xs text-slate-500">
            Template text for quotation terms & conditions. Mark one as default.
          </p>

          {termsTemplates.length === 0 ? (
            <div className="px-4 pb-4">
              <Empty>No terms templates yet — add one below.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">Name</th>
                    <th className="th">Preview</th>
                    <th className="th">Default</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {termsTemplates.map((t) => (
                    <TermsRowActions key={t.id} term={t} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Payment Terms Templates */}
        <div className="card overflow-hidden">
          <div className="px-4 pt-4 pb-2 font-semibold text-slate-800">Payment Terms Templates</div>
          <p className="px-4 pb-3 text-xs text-slate-500">
            Template text for quotation payment terms. Mark one as default.
          </p>

          {paymentTemplates.length === 0 ? (
            <div className="px-4 pb-4">
              <Empty>No payment terms templates yet — add one below.</Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="th">Name</th>
                    <th className="th">Preview</th>
                    <th className="th">Default</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentTemplates.map((t) => (
                    <TermsRowActions key={t.id} term={t} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <TermsForm />
    </div>
  );
}
