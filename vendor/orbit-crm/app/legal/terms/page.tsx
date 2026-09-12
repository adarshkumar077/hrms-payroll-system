import Link from "next/link";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-slate-900 mb-1.5">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <span className="text-2xl">🛰️</span>
          <div>
            <div className="text-lg font-bold text-brand-700 leading-tight">Orbit</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">Business Operating System</div>
          </div>
        </div>

        <div className="card p-8">
          <div className="mb-6 rounded-lg bg-amber-50 text-amber-800 text-sm px-4 py-3">
            <b>Template notice:</b> This is a skeleton Terms of Service for demo purposes. It is not legal advice.
            Have it reviewed and customized by qualified counsel before using it with real customers.
          </div>

          <h1 className="text-xl font-bold text-slate-900">Terms of Service</h1>
          <p className="text-xs text-slate-400 mt-1">Last updated: {new Date().toISOString().slice(0, 10)}</p>

          <Section title="1. Acceptance of terms">
            <p>
              By accessing or using Orbit (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of
              Service. If you do not agree, do not use the Service.
            </p>
          </Section>

          <Section title="2. The service">
            <p>
              Orbit is a business operating system providing CRM, HR &amp; payroll, inventory, GST-compliant
              finance, and AI-assisted workflows for Indian small and medium businesses (&ldquo;SMBs&rdquo;).
              Features may change, and some integrations run in mock/manual mode until configured with live
              credentials.
            </p>
          </Section>

          <Section title="3. Accounts & access">
            <ul className="list-disc pl-5 space-y-1">
              <li>You are responsible for safeguarding your login credentials and any activity under your account.</li>
              <li>Access within an organization is controlled by role-based permissions set by your administrator.</li>
              <li>You must notify us promptly of any unauthorized use of your account.</li>
            </ul>
          </Section>

          <Section title="4. Customer data">
            <p>
              Data you enter into Orbit (leads, contacts, employee records, financial documents, etc.) remains
              your property. We process it only to provide the Service, as described in our{" "}
              <Link href="/legal/privacy" className="text-brand-700 hover:underline">Privacy Policy</Link>.
            </p>
          </Section>

          <Section title="5. Acceptable use">
            <p>
              You agree not to misuse the Service — including attempting to breach security, reverse-engineer
              the application, or use it to store or transmit unlawful content.
            </p>
          </Section>

          <Section title="6. AI-assisted features">
            <p>
              Orbit includes AI features (lead scoring, drafting, OCR, copilot) that may fall back to local
              heuristics when no live AI provider is configured. AI output is assistive and should be reviewed
              by a human before being relied upon for business, legal, or financial decisions.
            </p>
          </Section>

          <Section title="7. Fees & billing">
            <p>
              Fees, billing cycles, and plan limits (if applicable) are as agreed at signup or shown in the
              Billing section of the app. This is a demo/template environment and may not reflect a live
              commercial plan.
            </p>
          </Section>

          <Section title="8. Termination">
            <p>
              Either party may terminate access to the Service as agreed in an order form or, absent one, with
              reasonable notice. On termination you may export your data as described in the Privacy Policy.
            </p>
          </Section>

          <Section title="9. Disclaimer & limitation of liability">
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum extent
              permitted by law, we are not liable for indirect, incidental, or consequential damages arising
              from use of the Service.
            </p>
          </Section>

          <Section title="10. Governing law">
            <p>
              These Terms are governed by the laws of India, without regard to conflict-of-law principles,
              unless otherwise agreed in writing.
            </p>
          </Section>

          <Section title="11. Changes to these terms">
            <p>
              We may update these Terms from time to time. Continued use of the Service after changes
              constitutes acceptance of the revised Terms.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>Questions about these Terms can be directed to your Orbit administrator.</p>
          </Section>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400 space-x-3">
          <Link href="/legal/privacy" className="hover:text-slate-600">Privacy Policy</Link>
          <span>·</span>
          <Link href="/login" className="hover:text-slate-600">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
