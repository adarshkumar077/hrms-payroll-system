import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, shortDate } from "@/lib/format";
import { PageHeader, StatCard, Badge, Empty } from "@/components/ui";
import { isWageCompliant } from "@/lib/compliance/payroll";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!(await can(s, "hr", "read"))) return <NoAccess label="HR" />;
  const t = s.tenantId;

  const employee = await db.employee.findFirst({
    where: { id: params.id, tenantId: t },
    include: {
      salaryStructure: true,
      attendances: { orderBy: { date: "desc" }, take: 10 },
      leaves: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!employee) notFound();

  const ss = employee.salaryStructure;
  const compliant = ss ? isWageCompliant(ss.gross, ss.basic) : false;

  const attTone: Record<string, string> = {
    Present: "green",
    HalfDay: "amber",
    Leave: "blue",
    WeekOff: "slate",
    Absent: "red",
  };
  const leaveStatusTone: Record<string, string> = {
    Approved: "green",
    Pending: "amber",
    Rejected: "red",
  };
  const leaveTypeTone: Record<string, string> = {
    Casual: "blue",
    Sick: "amber",
    Earned: "green",
    Unpaid: "slate",
  };

  return (
    <div>
      <PageHeader
        title={employee.name}
        subtitle={`${employee.designation || "—"}${employee.department ? " · " + employee.department : ""}`}
        action={
          <Link href="/hr/employees" className="btn-ghost">
            ← Back to employees
          </Link>
        }
      />

      {/* Profile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Employee Code" value={employee.code} accent="slate" />
        <StatCard label="Date of Joining" value={shortDate(employee.dateOfJoining)} accent="brand" />
        <StatCard label="Annual CTC" value={inr(employee.ctc)} accent="green" />
        <StatCard label="Monthly Gross" value={inr(employee.ctc / 12)} accent="green" />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {/* Salary structure breakdown */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-800">Salary Structure (monthly)</div>
            {ss && compliant ? (
              <Badge tone="green">Labour-Code compliant: basic ≥ 50% gross</Badge>
            ) : ss ? (
              <Badge tone="red">Non-compliant: basic &lt; 50% gross</Badge>
            ) : null}
          </div>
          {ss ? (
            <div className="space-y-2 text-sm">
              <Row label="Gross" value={inr(ss.gross)} strong />
              <Row label="Basic" value={inr(ss.basic)} hint={`${Math.round((ss.basic / (ss.gross || 1)) * 100)}% of gross`} />
              <Row label="HRA" value={inr(ss.hra)} />
              <Row label="Allowances" value={inr(ss.allowances)} />
            </div>
          ) : (
            <Empty>No salary structure configured for this employee.</Empty>
          )}
        </div>

        {/* Contact card */}
        <div className="card p-4">
          <div className="font-semibold text-slate-800 mb-3">Profile</div>
          <div className="space-y-2 text-sm">
            <Row label="Name" value={employee.name} />
            <Row label="Email" value={employee.email || "—"} />
            <Row label="Department" value={employee.department || "—"} />
            <Row label="Designation" value={employee.designation || "—"} />
            <Row label="Status" value={employee.active ? "Active" : "Inactive"} />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent attendance */}
        <div>
          <div className="font-semibold text-slate-800 mb-2">Recent Attendance</div>
          {employee.attendances.length === 0 ? (
            <Empty>No attendance records.</Empty>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Status</th>
                    <th className="th">Check-in</th>
                    <th className="th text-right">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {employee.attendances.map((a) => (
                    <tr key={a.id}>
                      <td className="td">{shortDate(a.date)}</td>
                      <td className="td">
                        <Badge tone={attTone[a.status] || "slate"}>{a.status}</Badge>
                      </td>
                      <td className="td">
                        {a.checkIn
                          ? new Date(a.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      <td className={`td text-right ${a.distanceM != null && a.distanceM > 100 ? "text-rose-600 font-medium" : ""}`}>
                        {a.distanceM != null ? `${Math.round(a.distanceM)} m` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent leaves */}
        <div>
          <div className="font-semibold text-slate-800 mb-2">Recent Leaves</div>
          {employee.leaves.length === 0 ? (
            <Empty>No leave applications.</Empty>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Type</th>
                    <th className="th">From–To</th>
                    <th className="th text-right">Days</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employee.leaves.map((l) => (
                    <tr key={l.id}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-800 ${strong ? "font-semibold" : ""}`}>
        {value}
        {hint && <span className="ml-2 text-xs text-slate-400">({hint})</span>}
      </span>
    </div>
  );
}
