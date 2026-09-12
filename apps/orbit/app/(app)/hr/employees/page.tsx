import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { inr, inrLakh, shortDate } from "@/lib/format";
import { PageHeader, StatCard, MoneyStat, Empty } from "@/components/ui";
import { AddEmployeeForm } from "./AddEmployeeForm";
import { FilterBar, Pagination } from "@/components/ListControls";
import { parseListParams, pageInfo, orderByFrom } from "@/lib/list";
import { can } from "@/lib/rbac";
import { NoAccess } from "@/components/NoAccess";
import { getStudioConfig, moduleLabel } from "@/lib/studio/config";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  if (!(await can(s, "hr", "read"))) return <NoAccess label="HR" />;
  const t = s.tenantId;
  const config = await getStudioConfig(t);
  const p = parseListParams(searchParams);

  const where = {
    tenantId: t,
    active: true,
    ...(p.q ? { OR: [{ name: { contains: p.q } }, { code: { contains: p.q } }, { email: { contains: p.q } }, { department: { contains: p.q } }] } : {}),
  };

  const [employees, total, allEmployees] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: orderByFrom(p.sort, p.order, ["name", "ctc", "dateOfJoining"], { name: "asc" }),
      skip: p.skip,
      take: p.take,
    }),
    db.employee.count({ where }),
    db.employee.findMany({ where: { tenantId: t, active: true }, select: { ctc: true, department: true } }),
  ]);

  const headcount = allEmployees.length;

  // Count by department (from full table).
  const byDept = new Map<string, number>();
  for (const e of allEmployees) {
    const d = e.department || "Unassigned";
    byDept.set(d, (byDept.get(d) || 0) + 1);
  }
  const deptCount = byDept.size;
  const deptSummary = [...byDept.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${d}: ${n}`)
    .join(" · ");

  // Total monthly payroll cost = sum of ctc/12 (from full table).
  const monthlyPayroll = allEmployees.reduce((a, e) => a + e.ctc / 12, 0);

  return (
    <div>
      <PageHeader
        title={moduleLabel(config, "hr", "plural")}
        subtitle="Team roster, cost, and compliant salary structures."
        action={<AddEmployeeForm />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Headcount" value={String(headcount)} accent="brand" hint="Active employees" />
        <StatCard label="Departments" value={String(deptCount)} accent="slate" hint={deptSummary || "—"} />
        <MoneyStat label="Monthly Payroll Cost" amount={monthlyPayroll} accent="green" hint="Sum of CTC / 12" />
      </div>

      <FilterBar placeholder="Search by name, code, email, or department…" />
      {total === 0 ? (
        <Empty>No employees yet. Add your first hire to generate a compliant salary structure.</Empty>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Code</th>
                  <th className="th">Name</th>
                  <th className="th">Department</th>
                  <th className="th">Designation</th>
                  <th className="th">Date of Joining</th>
                  <th className="th text-right">CTC</th>
                  <th className="th text-right">Monthly Gross</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td className="td font-mono text-xs text-slate-500">{e.code}</td>
                    <td className="td">
                      <Link href={`/hr/employees/${e.id}`} className="font-medium text-brand-700 hover:underline">
                        {e.name}
                      </Link>
                    </td>
                    <td className="td">{e.department || "—"}</td>
                    <td className="td">{e.designation || "—"}</td>
                    <td className="td">{shortDate(e.dateOfJoining)}</td>
                    <td className="td text-right">{inr(e.ctc)}</td>
                    <td className="td text-right">{inr(e.ctc / 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination {...pageInfo(total, p.page)} />
        </>
      )}
    </div>
  );
}
