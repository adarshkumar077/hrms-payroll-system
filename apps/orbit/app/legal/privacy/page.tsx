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

export default function PrivacyPage() {
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
            <b>Template notice:</b> This is a template Privacy Policy intended to reflect the basic structure of
            India&apos;s Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;). It is not legal
            advice. Have it reviewed and customized by qualified counsel before using it with real customers.
          </div>

          <h1 className="text-xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="text-xs text-slate-400 mt-1">Last updated: {new Date().toISOString().slice(0, 10)}</p>

          <Section title="1. Who this applies to">
            <p>
              Orbit is used by Indian small and medium businesses (&ldquo;tenants&rdquo;) to run CRM, HR &amp;
              payroll, inventory, and finance workflows. This policy explains how personal data of employees,
              customers, leads, and vendors entered into Orbit (&ldquo;Personal Data&rdquo;) is collected, used,
              and protected, consistent with the DPDP Act.
            </p>
          </Section>

          <Section title="2. What data we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li><b>CRM data</b> — lead and contact names, phone numbers, emails, company details, deal/opportunity notes.</li>
              <li><b>HR &amp; payroll data</b> — employee names, contact details, bank details, PAN/Aadhaar-linked identifiers, salary and statutory (PF/ESI/TDS) records.</li>
              <li><b>Finance data</b> — GST invoices, vendor bills, bank statements used for reconciliation.</li>
              <li><b>Account data</b> — login email, hashed password/TOTP secrets, role and session activity.</li>
              <li><b>Uploaded documents</b> — files attached to leads, invoices, or bills, including OCR-scanned bills.</li>
            </ul>
          </Section>

          <Section title="3. Purpose of processing (DPDP &ldquo;specified purpose&rdquo;)">
            <p>
              Personal Data is processed strictly for the purpose it was collected for — operating the CRM, HR,
              payroll, inventory, and finance functions your organization enabled Orbit for. We do not sell
              Personal Data or use it for unrelated advertising.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Providing and improving the Service (e.g. lead scoring, AI drafting, OCR extraction).</li>
              <li>Meeting statutory obligations (GST filings, PF/ESI/TDS compliance, e-invoicing).</li>
              <li>Account security, audit logging, and fraud prevention.</li>
            </ul>
          </Section>

          <Section title="4. Legal basis / consent">
            <p>
              Where Orbit processes data on behalf of a tenant (a &ldquo;Data Fiduciary&rdquo; under the DPDP
              Act), the tenant is responsible for obtaining valid consent or relying on a legitimate use ground
              (e.g. employment, statutory compliance) before entering Data Principals&apos; Personal Data into
              the Service.
            </p>
          </Section>

          <Section title="5. AI processing">
            <p>
              Some features (lead scoring, call summaries, OCR, copilot) may send relevant data to a configured
              AI provider to generate suggestions. When no live provider is configured, Orbit falls back to a
              local, non-AI heuristic and no data leaves the deployment for that feature. Live AI usage is shown
              via the &ldquo;AI&rdquo; status badge in the app header.
            </p>
          </Section>

          <Section title="6. Data retention & deletion">
            <p>
              Data is retained for as long as the tenant account is active, or as required by statutory
              retention rules (e.g. GST/payroll records). A tenant&apos;s CEO/admin can permanently delete the
              organization and all its data — including users, CRM, HR, payroll, inventory, and finance records
              — from <b>Admin &amp; Users</b> in the app. This action is irreversible.
            </p>
          </Section>

          <Section title="7. Your rights as a Data Principal">
            <p>Consistent with the DPDP Act, individuals whose Personal Data is held in Orbit have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><b>Access &amp; export</b> — obtain a copy of the data held about them. Tenant admins can export the full organization&apos;s data as JSON from <b>Admin &amp; Users → Export my data</b>.</li>
              <li><b>Correction</b> — request corrections to inaccurate or outdated data.</li>
              <li><b>Erasure</b> — request deletion of their data once it is no longer needed for the purpose it was collected for.</li>
              <li><b>Grievance redressal</b> — raise concerns about how their data is handled with the tenant&apos;s designated contact.</li>
              <li><b>Withdraw consent</b> — where processing is based on consent, withdraw it at any time (subject to statutory retention obligations).</li>
            </ul>
            <p>
              Requests should be directed to your organization&apos;s Orbit administrator, who is the Data
              Fiduciary for that tenant&apos;s data.
            </p>
          </Section>

          <Section title="8. Data security">
            <p>
              Access is restricted by role-based permissions (RBAC), sessions are authenticated, and sensitive
              fields (e.g. payroll net pay) can be masked per role. Two-factor authentication (TOTP) is
              available for account login.
            </p>
          </Section>

          <Section title="9. Data storage & transfers">
            <p>
              This demo deployment runs on a local SQLite database with no external infrastructure by default.
              Production deployments may use PostgreSQL and/or India-based hosting — see your deployment&apos;s
              configuration for details. Third-party integrations (e-invoicing, payments, SSO, messaging, OCR)
              only transmit data when explicitly configured with live credentials; otherwise they run in a
              local mock/manual mode.
            </p>
          </Section>

          <Section title="10. Children's data">
            <p>Orbit is a business tool and is not directed at or knowingly used to collect data from children.</p>
          </Section>

          <Section title="11. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. Continued use of the Service after changes
              constitutes acceptance of the revised policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions about this policy, or requests to exercise your rights above, can be directed to your
              Orbit administrator.
            </p>
          </Section>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400 space-x-3">
          <Link href="/legal/terms" className="hover:text-slate-600">Terms of Service</Link>
          <span>·</span>
          <Link href="/login" className="hover:text-slate-600">Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
