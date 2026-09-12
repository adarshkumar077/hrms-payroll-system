import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listNotifications } from "@/lib/notify";
import { shortDate } from "@/lib/format";
import { PageHeader, Badge, Empty } from "@/components/ui";
import { MarkAllReadButton } from "./MarkAllReadButton";
import { SendTestNotificationButton } from "./SendTestNotificationButton";

export const dynamic = "force-dynamic";

const typeTone: Record<string, string> = {
  info: "slate",
  alert: "red",
  reminder: "amber",
};

export default async function NotificationsPage() {
  const s = await requireSession();
  const notifications = await listNotifications(s.tenantId, s.userId);

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="All messages and alerts"
        action={
          <div className="flex gap-2">
            <SendTestNotificationButton />
            <MarkAllReadButton />
          </div>
        }
      />

      {notifications.length === 0 ? (
        <Empty>No notifications yet. Stay tuned!</Empty>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`card p-4 border-l-4 border-l-slate-200 ${
                !n.read ? "bg-brand-50" : ""
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge tone={typeTone[n.type] || "slate"}>{n.type}</Badge>
                    <span className="text-xs text-slate-400">{shortDate(n.createdAt)}</span>
                  </div>
                  <h3 className="font-semibold text-slate-900">{n.title}</h3>
                  {n.body && (
                    <p className="text-sm text-slate-600 mt-1">{n.body}</p>
                  )}
                  {n.link && (
                    <div className="mt-2">
                      <Link
                        href={n.link}
                        className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                      >
                        View →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
