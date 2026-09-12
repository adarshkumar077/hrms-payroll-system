import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { LeaveActions } from "./LeaveActions";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

function dayBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export default async function LeavePage() {
  const s = await requireSession();
  if (!(await can(s, "hr", "read"))) return <NoAccess label="HR" />;
  const t = s.tenantId;
  const { start, end } = dayBounds(new Date());

  const [leaves, pendingCount, todayAttendance] = await Promise.all([
    db.leaveApplication.findMany({
      where: { tenantId: t },
      include: { employee: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
    db.leaveApplication.count({ where: { tenantId: t, status: "Pending" } }),
    db.attendance.findMany({
      where: { tenantId: t, date: { gte: start, lt: end } },
      include: { employee: true },
      orderBy: { checkIn: "asc" },
    }),
  ]);

  const presentToday = todayAttendance.filter((a) => a.status === "Present").length;
  const halfDayToday = todayAttendance.filter((a) => a.status === "HalfDay").length;
  const onLeaveToday = todayAttendance.filter((a) => a.status === "Leave").length;

  const leaveTypeTone: Record<string, string> = {
    Casual: "blue",
    Sick: "amber",
    Earned: "green",
    Unpaid: "slate",
  };
  const leaveStatusTone: Record<string, string> = {
    Approved: "green",
    Pending: "amber",
    Rejected: "red",
  };
  const attTone: Record<string, string> = {
    Present: "green",
    HalfDay: "amber",
    Leave: "blue",
    WeekOff: "slate",
    Absent: "red",
  };

  return (
    <div>
      <PageHeader title="Leave & Attendance" subtitle="Approvals, presence, and geofenced check-ins." />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending Leaves" value={String(pendingCount)} accent="amber" hint="Awaiting approval" />
        <StatCard label="On Leave Today" value={String(onLeaveToday)} accent="blue" hint="Approved leave" />
        <StatCard
          label="Present Today"
          value={String(presentToday)}
          accent="green"
          hint={halfDayToday ? `${halfDayToday} half-day` : "Checked in"}
        />
      </div>

      {/* Section A — Leave applications */}
      <div className="font-semibold text-slate-800 mb-2">Leave Applications</div>
      {leaves.length === 0 ? (
        <Empty>No leave applications.</Empty>
      ) : (
        <div className="card overflow-hidden mb-8">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Employee</th>
                <th className="th">Type</th>
                <th className="th">From–To</th>
                <th className="th text-right">Days</th>
                <th className="th">Status</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.id}>
                  <td className="td font-medium text-slate-800">{l.employee.name}</td>
                  <td className="td">
                    <Badge tone={leaveTypeTone[l.type] || "slate"}>{l.type}</Badge>
                  </td>
                  <td className="td">
                    {shortDate(l.fromDate)} – {shortDate(l.toDate)}
                  </td>
                  <td className="td text-right">{l.days}</td>
                  <td className="td">
                    <Badge tone={leaveStatusTone[l.status] || "slate"}>{l.status}</Badge>
                  </td>
                  <td className="td text-right">
                    {l.status === "Pending" ? <LeaveActions id={l.id} /> : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section B — Today's attendance */}
      <div className="font-semibold text-slate-800 mb-2">
        Today's Attendance <span className="text-xs font-normal text-slate-400">· {shortDate(start)}</span>
      </div>
      {todayAttendance.length === 0 ? (
        <Empty>No check-ins recorded today.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Employee</th>
                <th className="th">Status</th>
                <th className="th">Check-in</th>
                <th className="th text-right">Geofence Distance</th>
              </tr>
            </thead>
            <tbody>
              {todayAttendance.map((a) => {
                const far = a.distanceM != null && a.distanceM > 100;
                return (
                  <tr key={a.id}>
                    <td className="td font-medium text-slate-800">{a.employee.name}</td>
                    <td className="td">
                      <Badge tone={attTone[a.status] || "slate"}>{a.status}</Badge>
                    </td>
                    <td className="td">
                      {a.checkIn
                        ? new Date(a.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                        : "—"}
                    </td>
                    <td className={`td text-right ${far ? "text-rose-600 font-medium" : ""}`}>
                      {a.distanceM != null ? (
                        <span className="inline-flex items-center gap-1.5">
                          {far && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                          {Math.round(a.distanceM)} m
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
