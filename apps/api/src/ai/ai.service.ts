import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, RoleCode, AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  suggestedPrompts(roles: string[]) {
    const base = [
      'Explain our leave policy and how to apply.',
      'How is overtime calculated on attendance?',
      'Why might my payslip net be lower this month?',
    ];
    if (roles.includes(RoleCode.HR) || roles.includes(RoleCode.SUPER_ADMIN) || roles.includes(RoleCode.ADMIN)) {
      return [
        ...base,
        'Summarize this month attendance risk.',
        'What payroll deductions apply company-wide?',
      ];
    }
    return [...base, 'Show my leave balance guidance.', 'How do I mark attendance with GPS?'];
  }

  async chat(
    user: AuthUser,
    message: string,
    opts?: { conversationId?: string; regenerate?: boolean },
  ) {
    const trimmed = message?.trim();
    if (!trimmed) {
      return { reply: 'Please select a topic or type your question.', engine: 'rules' as const };
    }
    const started = Date.now();
    const conversation = await this.ensureConversation(user, opts?.conversationId, trimmed);
    const engine = this.config.get('OPENAI_API_KEY') ? 'openai' : 'rules';

    if (!opts?.regenerate) {
      await this.prisma.aiMessage.create({
        data: { conversationId: conversation.id, role: 'user', content: trimmed },
      });
    }

    let reply: string;
    let status = 'OK';
    let errorMessage: string | null = null;
    try {
      reply = await this.generateReply(user.companyId, trimmed, user.employeeId, user.roles);
    } catch (err) {
      status = 'ERROR';
      errorMessage = err instanceof Error ? err.message : 'AI error';
      reply = 'I could not complete that request. Please try again or contact HR.';
    }

    await this.prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
        meta: { engine, regenerated: Boolean(opts?.regenerate) },
      },
    });
    await this.prisma.aiChatMessage.create({
      data: { companyId: user.companyId, userId: user.id, role: 'assistant', content: reply, meta: { engine } },
    }).catch(() => undefined);

    const latencyMs = Date.now() - started;
    await this.recordUsage(user, conversation.id, engine, latencyMs, status, errorMessage);
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.OTHER,
      entityType: 'AiConversation',
      entityId: conversation.id,
      metadata: { event: 'ai.chat', status },
    });

    return {
      reply,
      engine,
      conversationId: conversation.id,
      suggested: this.suggestedPrompts(user.roles),
    };
  }

  async listHistory(user: AuthUser) {
    const where = this.historyWhere(user);
    return this.prisma.aiConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdAt: true,
        userId: true,
        _count: { select: { messages: true } },
      },
    });
  }

  async getHistory(user: AuthUser, id: string) {
    const conv = await this.prisma.aiConversation.findFirst({
      where: { id, ...this.historyWhere(user) },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async deleteHistory(user: AuthUser, id: string) {
    const conv = await this.prisma.aiConversation.findFirst({
      where: { id, ...this.historyWhere(user) },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    if (!this.canManageAllConversations(user) && conv.userId !== user.id) {
      throw new ForbiddenException();
    }
    await this.prisma.aiConversation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.DELETE,
      entityType: 'AiConversation',
      entityId: id,
    });
    return { ok: true };
  }

  private canManageAllConversations(user: AuthUser) {
    return user.roles.includes(RoleCode.SUPER_ADMIN) || user.roles.includes(RoleCode.ADMIN);
  }

  private historyWhere(user: AuthUser) {
    const base = { companyId: user.companyId, deletedAt: null };
    if (this.canManageAllConversations(user)) return base;
    return { ...base, userId: user.id };
  }

  private async ensureConversation(user: AuthUser, conversationId: string | undefined, firstMessage: string) {
    if (conversationId) {
      const existing = await this.prisma.aiConversation.findFirst({
        where: { id: conversationId, companyId: user.companyId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('Conversation not found');
      if (!this.canManageAllConversations(user) && existing.userId !== user.id) {
        throw new ForbiddenException();
      }
      await this.prisma.aiConversation.update({
        where: { id: existing.id },
        data: { updatedAt: new Date() },
      });
      return existing;
    }
    return this.prisma.aiConversation.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        title: firstMessage.slice(0, 72) || 'New conversation',
      },
    });
  }

  private async recordUsage(
    user: AuthUser,
    conversationId: string,
    model: string,
    latencyMs: number,
    status: string,
    errorMessage: string | null,
  ) {
    await this.prisma.aiLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        conversationId,
        model,
        latencyMs,
        status,
        errorMessage: errorMessage ?? undefined,
      },
    });
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    const existing = await this.prisma.aiUsage.findUnique({
      where: { companyId_day: { companyId: user.companyId, day } },
    });
    if (!existing) {
      await this.prisma.aiUsage.create({
        data: {
          companyId: user.companyId,
          day,
          requests: 1,
          errorCount: status === 'ERROR' ? 1 : 0,
          avgLatencyMs: latencyMs,
        },
      });
      return;
    }
    const requests = existing.requests + 1;
    await this.prisma.aiUsage.update({
      where: { id: existing.id },
      data: {
        requests,
        errorCount: existing.errorCount + (status === 'ERROR' ? 1 : 0),
        avgLatencyMs: Math.round((existing.avgLatencyMs * existing.requests + latencyMs) / requests),
      },
    });
  }

  async ensureDefaultPrompts(companyId: string) {
    const defaults = [
      { category: 'Leave', title: 'Leave policy', body: 'Explain EITF leave types, balances, approval steps, and carry-forward rules.' },
      { category: 'Payroll', title: 'Payslip breakdown', body: 'Explain CTC, LOP, ESD, PF, and how net pay is calculated.' },
      { category: 'Attendance', title: 'Attendance & OT', body: 'Explain selfie/GPS mark, late marks, ULOB, overtime, and geofence.' },
      { category: 'HR', title: 'Employee self-service', body: 'Guide the employee through ESS: profile, documents, leave apply, payslips.' },
    ];
    for (const p of defaults) {
      const found = await this.prisma.aiPrompt.findFirst({
        where: { companyId, title: p.title, category: p.category },
      });
      if (!found) {
        await this.prisma.aiPrompt.create({ data: { companyId, ...p, isSystem: true } });
      }
    }
  }

  async listPrompts(companyId: string) {
    await this.ensureDefaultPrompts(companyId);
    return this.prisma.aiPrompt.findMany({ where: { companyId }, orderBy: [{ category: 'asc' }, { title: 'asc' }] });
  }

  async upsertPrompt(
    user: AuthUser,
    input: { id?: string; category: string; title: string; body: string; isActive?: boolean },
  ) {
    if (input.id) {
      return this.prisma.aiPrompt.update({
        where: { id: input.id },
        data: { category: input.category, title: input.title, body: input.body, isActive: input.isActive ?? true },
      });
    }
    return this.prisma.aiPrompt.create({
      data: {
        companyId: user.companyId,
        category: input.category,
        title: input.title,
        body: input.body,
        createdBy: user.id,
      },
    });
  }

  async deletePrompt(companyId: string, id: string) {
    const row = await this.prisma.aiPrompt.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Prompt not found');
    if (row.isSystem) throw new ForbiddenException('System prompts cannot be deleted');
    await this.prisma.aiPrompt.delete({ where: { id } });
    return { ok: true };
  }

  async consoleAnalytics(companyId: string) {
    const [logs, usage, prompts] = await Promise.all([
      this.prisma.aiLog.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.aiUsage.findMany({ where: { companyId }, orderBy: { day: 'desc' }, take: 30 }),
      this.listPrompts(companyId),
    ]);
    const errors = logs.filter((l) => l.status !== 'OK').length;
    const avg = logs.length ? Math.round(logs.reduce((s, l) => s + l.latencyMs, 0) / logs.length) : 0;
    return {
      model: this.config.get('OPENAI_MODEL') ?? 'rules-engine',
      systemPrompt: this.config.get('AI_SYSTEM_PROMPT') ?? 'You are the EITF HRMS assistant.',
      totals: { requests: logs.length, errors, avgLatencyMs: avg },
      logs,
      usage,
      prompts,
    };
  }

  async updateAiSettings(user: AuthUser, body: { systemPrompt?: string; model?: string }) {
    if (body.systemPrompt != null) {
      await this.prisma.companySetting.upsert({
        where: { companyId_key: { companyId: user.companyId, key: 'ai.system_prompt' } },
        create: { companyId: user.companyId, key: 'ai.system_prompt', value: body.systemPrompt, group: 'ai', updatedBy: user.id },
        update: { value: body.systemPrompt, updatedBy: user.id },
      });
    }
    if (body.model != null) {
      await this.prisma.companySetting.upsert({
        where: { companyId_key: { companyId: user.companyId, key: 'ai.model' } },
        create: { companyId: user.companyId, key: 'ai.model', value: body.model, group: 'ai', updatedBy: user.id },
        update: { value: body.model, updatedBy: user.id },
      });
    }
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      entityType: 'AiSettings',
      metadata: { fields: Object.keys(body) },
    });
    return this.consoleAnalytics(user.companyId);
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
    roles: string[] = [],
  ): Promise<string> {
    const key = this.config.get<string>('OPENAI_API_KEY');
    if (key) {
      try {
        return await this.openAiReply(key, message, roles);
      } catch {
        // fall through to rules
      }
    }
    return this.rulesReply(companyId, message, employeeId, roles);
  }

  private async openAiReply(apiKey: string, message: string, roles: string[]): Promise<string> {
    const setting = await this.prisma.companySetting.findFirst({
      where: { key: 'ai.system_prompt' },
    });
    const modelSetting = await this.prisma.companySetting.findFirst({
      where: { key: 'ai.model' },
    });
    const system =
      (typeof setting?.value === 'string' ? setting.value : null) ??
      this.config.get('AI_SYSTEM_PROMPT') ??
      `You are the EITF HRMS assistant for Enhance IT Infrastructure (EITF). Answer in Markdown about leave, attendance, payroll, and HR policies. Do not invent employee-specific balances. Role context: ${roles.join(', ') || 'EMPLOYEE'}.`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:
          (typeof modelSetting?.value === 'string' ? modelSetting.value : null) ??
          this.config.get('OPENAI_MODEL') ??
          'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
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
    roles: string[] = [],
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
            ? 'ADMIN'
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
