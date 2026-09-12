import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { shortDate } from "@/lib/format";
import { ssoConfigured } from "@/lib/sso";
import { headers } from "next/headers";
import { InviteUserForm } from "./InviteUserForm";
import { UserRowActions } from "./UserRowActions";
import { RoleEditor } from "./RoleEditor";
import { TenantSettingsForm } from "./TenantSettingsForm";
import { ExportDataButton, DeleteOrgButton } from "./DpdpPanel";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const s = await requireSession();
  if (!(await can(s, "admin", "read"))) return <NoAccess label="Admin" />;
  const t = s.tenantId;
  const host = headers().get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const ssoCallbackUrl = `${proto}://${host}/api/auth/sso/google/callback`;

  const [tenant, users, roles, activeCount, eventLog] = await Promise.all([
    db.tenant.findUnique({ where: { id: t } }),
    db.user.findMany({ where: { tenantId: t }, orderBy: { createdAt: "asc" }, include: { role: true } }),
    db.role.findMany({ where: { tenantId: t }, orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } }),
    db.user.count({ where: { tenantId: t, active: true } }),
    db.eventLog.findMany({ where: { tenantId: t }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);

  // actorId on EventLog is a raw user id — resolve names for display.
  const actorIds = Array.from(new Set(eventLog.map((e) => e.actorId).filter(Boolean))) as string[];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorName = new Map(actors.map((a) => [a.id, a.name]));

  return (
    <div>
      <PageHeader title="Admin" subtitle="Users, roles, company settings, audit log and data privacy." />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="Users" value={String(users.length)} accent="brand" hint={`${activeCount} active`} />
        <StatCard label="Roles" value={String(roles.length)} accent="blue" />
        <StatCard label="Plan" value={tenant?.plan ?? "free"} accent="amber" hint={`${tenant?.seats ?? 0} seats`} />
      </div>

      {/* ── Users ───────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Users</h2>
        <InviteUserForm roles={roles} />

        {users.length === 0 ? (
          <Empty>No users yet.</Empty>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Email</th>
                  <th className="th">Role</th>
                  <th className="th">CEO</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="td font-medium text-slate-900">{u.name}</td>
                    <td className="td text-slate-600">{u.email}</td>
                    <td className="td">
                      {u.role ? <Badge tone="blue">{u.role.name}</Badge> : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="td">{u.isCeo ? <Badge tone="brand">CEO</Badge> : <span className="text-slate-300">—</span>}</td>
                    <td className="td">
                      <Badge tone={u.active ? "green" : "red"}>{u.active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="td">
                      <UserRowActions
                        userId={u.id}
                        active={u.active}
                        roleId={u.roleId}
                        roles={roles}
                        disabled={u.isCeo && u.id === s.userId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Roles ───────────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Roles</h2>
        {roles.length === 0 ? <Empty>No roles yet.</Empty> : <RoleEditor roles={roles} />}
      </section>

      {/* ── Company settings ───────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Company settings</h2>
        <TenantSettingsForm name={tenant?.name ?? ""} gstin={tenant?.gstin ?? ""} aato={tenant?.aato ?? 0} />
      </section>

      {/* ── Single Sign-On ──────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Single Sign-On</h2>
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={ssoConfigured ? "green" : "amber"}>{ssoConfigured ? "Configured" : "Not configured"}</Badge>
            <span className="text-sm text-slate-600">Google OAuth</span>
          </div>
          <p className="text-xs text-slate-500 mb-2">
            Register this callback URL in Google Cloud Console (APIs &amp; Services → Credentials → your OAuth
            client → Authorized redirect URIs):
          </p>
          <div className="rounded-md bg-slate-50 border border-slate-100 px-3 py-2 font-mono text-xs text-slate-700 mb-2 break-all">
            {ssoCallbackUrl}
          </div>
          <p className="text-xs text-slate-400">
            Set <span className="font-mono">GOOGLE_CLIENT_ID</span> + <span className="font-mono">GOOGLE_CLIENT_SECRET</span> in{" "}
            <span className="font-mono">.env</span> (see <span className="font-mono">.env.sso.example</span>) to enable it — existing
            users are matched by email; new accounts are not auto-created via SSO.
          </p>
        </div>
      </section>

      {/* ── Audit log ───────────────────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Audit log</h2>
        <p className="text-xs text-slate-500 mb-2">Last 50 events across the tenant.</p>
        {eventLog.length === 0 ? (
          <Empty>No events recorded yet.</Empty>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Type</th>
                  <th className="th">Entity</th>
                  <th className="th">Actor</th>
                  <th className="th">Time</th>
                </tr>
              </thead>
              <tbody>
                {eventLog.map((ev) => (
                  <tr key={ev.id}>
                    <td className="td font-mono text-xs text-slate-700">{ev.type}</td>
                    <td className="td text-slate-600">
                      {ev.entity}
                      <span className="text-slate-400"> · {ev.entityId.slice(0, 8)}</span>
                    </td>
                    <td className="td text-slate-600">{ev.actorId ? actorName.get(ev.actorId) ?? "—" : "—"}</td>
                    <td className="td text-slate-500 text-xs">{shortDate(ev.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── DPDP: Data & privacy ──────────────────────────── */}
      <section className="mb-10">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Data &amp; privacy (DPDP)</h2>
        <div className="card p-4 space-y-6">
          <div>
            <div className="font-medium text-slate-800 mb-1">Export my data</div>
            <p className="text-sm text-slate-500 mb-3">
              Download a JSON dump of this organization&apos;s key records (users, CRM, HR, invoices).
            </p>
            <ExportDataButton />
          </div>
          <div className="border-t border-slate-100 pt-4">
            <div className="font-medium text-rose-700 mb-1">Delete organization</div>
            <p className="text-sm text-slate-500 mb-3">
              Permanently erase all data for this organization. Destructive and irreversible — CEO only.
            </p>
            <DeleteOrgButton orgName={tenant?.name ?? ""} isCeo={s.isCeo} />
          </div>
        </div>
      </section>
    </div>
  );
}
