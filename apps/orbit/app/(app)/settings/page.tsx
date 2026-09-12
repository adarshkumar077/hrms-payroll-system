import { requireSession, is2FAEnabled } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, Badge } from "@/components/ui";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { TwoFactorSection } from "./TwoFactorSection";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await requireSession();
  const tenant = await db.tenant.findUnique({ where: { id: s.tenantId } });
  const twoFactorEnabled = await is2FAEnabled(s.userId);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your profile, workspace and security." />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Profile</h2>
          <div className="space-y-3 text-sm">
            <div>
              <div className="label mb-0.5">Name</div>
              <div className="text-slate-700">{s.name}</div>
            </div>
            <div>
              <div className="label mb-0.5">Email</div>
              <div className="text-slate-700">{s.email}</div>
            </div>
            <div>
              <div className="label mb-0.5">Role</div>
              <div>
                <Badge tone={s.isCeo ? "brand" : "slate"}>{s.isCeo ? "CEO" : "Member"}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Workspace</h2>
          <div className="space-y-3 text-sm">
            <div>
              <div className="label mb-0.5">Organization</div>
              <div className="text-slate-700">{tenant?.name || "—"}</div>
            </div>
            <div>
              <div className="label mb-0.5">Plan</div>
              <div>
                <Badge tone="amber">{tenant?.plan || "free"}</Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5 md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Change password</h2>
          <ChangePasswordForm />
        </div>

        <div className="card p-5 md:col-span-2">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Two-factor authentication</h2>
          <TwoFactorSection enabled={twoFactorEnabled} />
        </div>
      </div>
    </div>
  );
}
