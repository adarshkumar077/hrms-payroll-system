import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reports: ReportsService,
  ) {}

  async chat(companyId: string, userId: string, message: string, employeeId?: string | null) {
    const trimmed = message?.trim();
    if (!trimmed) {
      return { reply: 'Please select a topic or type your question.', engine: 'rules' as const };
    }

    try {
      await this.prisma.aiChatMessage.create({
        data: { companyId, userId, role: 'user', content: trimmed },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist user chat message: ${err}`);
    }

    const reply = await this.generateReply(companyId, trimmed, employeeId);

    try {
      await this.prisma.aiChatMessage.create({
        data: {
          companyId,
          userId,
          role: 'assistant',
          content: reply,
          meta: { engine: this.config.get('OPENAI_API_KEY') ? 'openai' : 'rules' },
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist assistant chat message: ${err}`);
    }

    return { reply, engine: this.config.get('OPENAI_API_KEY') ? 'openai' : 'rules' };
  }

  async history(companyId: string, userId: string, limit = 40) {
    try {
      return await this.prisma.aiChatMessage.findMany({
        where: { companyId, userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 100),
      });
    } catch (err) {
      this.logger.warn(`Failed to load chat history: ${err}`);
      return [];
    }
  }

  private async generateReply(
    companyId: string,
    message: string,
    employeeId?: string | null,
  ): Promise<string> {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key) {
      try {
        return await this.openAiReply(key, message);
      } catch {
        // fall through to rules
      }
    }
    return this.rulesReply(companyId, message, employeeId);
  }

  private async openAiReply(apiKey: string, message: string): Promise<string> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.get('OPENAI_MODEL') ?? 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are the EITF HRMS assistant. Answer briefly about leave, attendance, payroll, and HR policies. Do not invent employee-specific balances.',
          },
          { role: 'user', content: message },
        ],
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || 'No response from model.';
  }

  private async rulesReply(
    companyId: string,
    message: string,
    employeeId?: string | null,
  ): Promise<string> {
    const q = message.toLowerCase();
    const settings = await this.prisma.companySetting.findMany({
      where: { companyId, group: { in: ['leave', 'attendance', 'security'] } },
    });
    const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    if (/leave|privilege|casual|sick/.test(q)) {
      return [
        'Leave tips:',
        `- Probation months: ${map['leave.probation_months'] ?? 6}`,
        `- Monthly credit after probation: ${map['leave.monthly_credit_after'] ?? 1}`,
        `- Carry-forward max: ${map['leave.carry_forward_max'] ?? 12}`,
        'Apply leave from ESS → Leave, or ask your manager for approvals.',
      ].join('\n');
    }
    if (/attendance|punch|late|ulob/.test(q)) {
      return [
        'Attendance tips:',
        `- Work window: ${map['office.work_start'] ?? '09:30'}–${map['office.work_end'] ?? '18:30'}`,
        `- Grace minutes: ${map['office.grace_minutes'] ?? 15}`,
        `- Late marks → half day after: ${map['attendance.late_marks_to_half_day'] ?? 3}`,
        'Mark attendance from mobile Attendance or web punch.',
      ].join('\n');
    }
    if (/payslip|salary|payroll|ctc|less than expected|not received/.test(q)) {
      const hint = employeeId
        ? 'Open ESS → Payslips to view your latest payslip and salary breakdown.'
        : 'Payslips are available under ESS → Payslips after payroll is locked.';
      return [
        'Based on company payroll policy, your salary depends on attendance, leave, late marks, half days, PF, TDS, security deposit, and other deductions.',
        hint,
        'Would you like help with: Salary Breakdown, Attendance Summary, Payslip access, or Contact HR?',
      ].join('\n\n');
    }
    if (/password|2fa|login|security/.test(q)) {
      return `Password min length is ${map['security.password_min_length'] ?? 5}. Use Security Settings (Super Admin/HR) for 2FA enforcement and IP allow-list.`;
    }
    if (/resign|exit|fnf|reliev/.test(q)) {
      return 'Resignations are submitted from Exit. Clearance and F&F are managed by HR. Experience/relieving letters generate after F&F finalize.';
    }
    return [
      'I am the EITF HR assistant (rules engine). Try asking about: leave, attendance, payslips, password/2FA, or resignation.',
      'Set OPENAI_API_KEY on the API for LLM answers.',
    ].join('\n');
  }

  async predictions(companyId: string) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));

    const [employees, attendance, resignations] = await Promise.all([
      this.prisma.employee.findMany({
        where: { companyId, isActive: true },
        select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { companyId, date: { gte: from, lte: to } },
      }),
      this.prisma.resignation.findMany({
        where: { companyId, createdAt: { gte: new Date(Date.UTC(y, 0, 1)) } },
      }),
    ]);

    const byEmp = new Map<string, { late: number; absent: number; present: number }>();
    for (const a of attendance) {
      const cur = byEmp.get(a.employeeId) ?? { late: 0, absent: 0, present: 0 };
      if (a.isLate) cur.late++;
      if (a.status === 'A') cur.absent++;
      if (['P', 'HD', 'WFH', 'OD'].includes(a.status)) cur.present++;
      byEmp.set(a.employeeId, cur);
    }

    const attendanceRisk = employees
      .map((e) => {
        const s = byEmp.get(e.id) ?? { late: 0, absent: 0, present: 0 };
        const days = s.late + s.absent + s.present || 1;
        const risk = Math.min(100, Math.round((s.late * 8 + s.absent * 15) / days * 10));
        return {
          employeeCode: e.employeeCode,
          name: `${e.firstName} ${e.lastName ?? ''}`.trim(),
          department: e.department ?? '',
          late: s.late,
          absent: s.absent,
          riskScore: risk,
          prediction: risk >= 60 ? 'Likely irregular next month' : risk >= 30 ? 'Watch' : 'Stable',
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 20);

    const headcount = Math.max(1, employees.length);
    const attritionPct = Math.round((resignations.length / headcount) * 1000) / 10;
    const highRiskDepts = Object.entries(
      attendanceRisk.reduce<Record<string, number>>((acc, r) => {
        if (r.riskScore >= 50) acc[r.department || 'Unassigned'] = (acc[r.department || 'Unassigned'] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([department, count]) => ({ department, highRiskCount: count }));

    return {
      month: m,
      year: y,
      attrition: {
        yearToDateResignations: resignations.length,
        activeHeadcount: employees.length,
        attritionRatePct: attritionPct,
        outlook:
          attritionPct >= 15 ? 'Elevated' : attritionPct >= 8 ? 'Moderate' : 'Healthy',
      },
      attendanceRisk,
      departmentHotspots: highRiskDepts,
      note: 'Heuristic predictions (not ML). Suitable for Super Admin dashboard widgets.',
    };
  }

  async screenResume(
    companyId: string,
    actorId: string,
    input: { candidateName: string; roleTarget: string; resumeText: string },
  ) {
    const text = input.resumeText.toLowerCase();
    const role = input.roleTarget.toLowerCase();
    const keywordsByRole: Record<string, string[]> = {
      default: ['communication', 'team', 'project', 'javascript', 'sql', 'agile'],
      developer: ['typescript', 'react', 'node', 'api', 'sql', 'git', 'nestjs'],
      hr: ['recruitment', 'payroll', 'onboarding', 'compliance', 'hrms'],
      finance: ['gst', 'tds', 'accounting', 'tally', 'excel', 'audit'],
    };
    const bucket =
      /dev|engineer|software/.test(role)
        ? 'developer'
        : /hr|human/.test(role)
          ? 'hr'
          : /finance|account/.test(role)
            ? 'finance'
            : 'default';
    const keywords = keywordsByRole[bucket];
    const hits = keywords.filter((k) => text.includes(k));
    const gaps = keywords.filter((k) => !text.includes(k));
    const years = text.match(/(\d+)\+?\s*years?/)?.[1];
    const score = Math.min(
      100,
      Math.round((hits.length / keywords.length) * 70 + (years ? Math.min(30, Number(years) * 3) : 10)),
    );
    const summary = `${input.candidateName} scored ${score}/100 for ${input.roleTarget}. Matched ${hits.length}/${keywords.length} role keywords${years ? `; experience signal ~${years}y` : ''}.`;
    const row = await this.prisma.resumeScreening.create({
      data: {
        companyId,
        candidateName: input.candidateName,
        roleTarget: input.roleTarget,
        resumeText: input.resumeText,
        score,
        strengthsJson: hits as Prisma.InputJsonValue,
        gapsJson: gaps as Prisma.InputJsonValue,
        summary,
        screenedBy: actorId,
      },
    });
    return row;
  }

  async listScreenings(companyId: string) {
    return this.prisma.resumeScreening.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        candidateName: true,
        roleTarget: true,
        score: true,
        strengthsJson: true,
        gapsJson: true,
        summary: true,
        createdAt: true,
      },
    });
  }

  async payrollAnomalies(companyId: string, year?: number, month?: number) {
    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    const run = await this.prisma.payrollRun.findUnique({
      where: { companyId_year_month: { companyId, year: y, month: m } },
      include: {
        lines: {
          include: {
            employee: { select: { employeeCode: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!run || !run.lines.length) {
      return { year: y, month: m, anomalies: [], note: 'No payroll lines for period' };
    }
    const nets = run.lines.map((l) => l.netPay);
    const avg = nets.reduce((a, b) => a + b, 0) / nets.length;
    const anomalies = run.lines
      .map((l) => {
        const flags: string[] = [];
        if (l.netPay <= 0) flags.push('Zero/negative net');
        if (l.netPay > avg * 2.2) flags.push('Net >> team average');
        if (l.netPay < avg * 0.35 && avg > 0) flags.push('Net << team average');
        if (l.lopDays >= 10) flags.push('High LOP days');
        if (l.totalDeductions > l.grossEarnings * 0.55) flags.push('Deductions >55% of gross');
        return flags.length
          ? {
              employeeCode: l.employee.employeeCode,
              name: `${l.employee.firstName} ${l.employee.lastName ?? ''}`.trim(),
              net: l.netPay,
              gross: l.grossEarnings,
              lopDays: l.lopDays,
              flags,
            }
          : null;
      })
      .filter(Boolean);
    return {
      year: y,
      month: m,
      averageNet: Math.round(avg),
      anomalies,
      note: 'Heuristic anomaly flags for Finance review',
    };
  }

  async performanceInsights(companyId: string) {
    const goals = await this.prisma.performanceGoal.findMany({
      where: { companyId },
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } },
      },
    });
    const byStatus: Record<string, number> = {};
    for (const g of goals) byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;
    const stalled = goals
      .filter((g) => g.status === 'ACTIVE')
      .slice(0, 15)
      .map((g) => ({
        employeeCode: g.employee.employeeCode,
        name: `${g.employee.firstName} ${g.employee.lastName ?? ''}`.trim(),
        title: g.title,
        status: g.status,
      }));
    const completionRate =
      goals.length === 0
        ? 0
        : Math.round(((byStatus['COMPLETED'] ?? 0) / goals.length) * 1000) / 10;
    return {
      totals: byStatus,
      completionRatePct: completionRate,
      insight:
        completionRate >= 70
          ? 'Strong goal completion — maintain coaching cadence.'
          : completionRate >= 40
            ? 'Moderate progress — focus managers on stalled ACTIVE goals.'
            : 'Low completion — review goal quality and capacity.',
      activeGoalsSample: stalled,
    };
  }

  async reportSummary(companyId: string, kind: string, year?: number, month?: number) {
    const data = await this.reports.resolveReport(companyId, kind, { year, month });
    const n = data.rows.length;
    const sample = data.rows.slice(0, 5);
    const summary = [
      `Automated summary for ${data.title}.`,
      `Rows: ${n}.`,
      n
        ? `First row keys: ${Object.keys(data.rows[0]).join(', ')}.`
        : 'No data for the selected filters.',
      kind === 'employee'
        ? `Active-ish count (isActive true): ${data.rows.filter((r) => r.isActive === true || r.isActive === 'true').length}.`
        : '',
      kind === 'payroll'
        ? `Net pay sum (sample period): ${data.rows.reduce((s, r) => s + Number(r.net ?? 0), 0)}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
    return { title: data.title, summary, rowCount: n, sample };
  }
}
