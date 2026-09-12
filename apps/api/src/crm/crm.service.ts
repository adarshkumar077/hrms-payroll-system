import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CrmDealStage, CrmLeadStatus, CrmTaskStatus, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  CreateCrmCustomerDto,
  CreateCrmDealDto,
  CreateCrmFollowUpDto,
  CreateCrmLeadDto,
  CreateCrmNoteDto,
  CreateCrmTaskCommentDto,
  CreateCrmTaskDto,
  UpdateCrmCustomerDto,
  UpdateCrmDealDto,
  UpdateCrmFollowUpDto,
  UpdateCrmLeadDto,
  UpdateCrmTaskDto,
} from './dto/crm.dto';
import { buildExport, rowsToCsv, rowsToHtmlPdf } from '../common/export.engine';

const CRM_ROLES: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN];

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  private canAccessCrm(user: AuthUser) {
    return user.roles.some((r) =>
      [...CRM_ROLES, RoleCode.EMPLOYEE].includes(r as RoleCode),
    );
  }

  private isCrmAdmin(user: AuthUser) {
    return user.roles.some((r) => CRM_ROLES.includes(r as RoleCode));
  }

  private isEmployeeOnly(user: AuthUser) {
    return user.roles.includes(RoleCode.EMPLOYEE) && !this.isCrmAdmin(user);
  }

  private isSalesOnly(user: AuthUser) {
    return user.roles.includes(RoleCode.ADMIN) && !user.roles.includes(RoleCode.SUPER_ADMIN) && !user.roles.includes(RoleCode.HR);
  }

  private ownerFilter(user: AuthUser) {
    if (this.isEmployeeOnly(user)) {
      if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
      return { ownerEmployeeId: user.employeeId };
    }
    if (!this.isSalesOnly(user)) return {};
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    return { ownerEmployeeId: user.employeeId };
  }

  private taskAssigneeFilter(user: AuthUser) {
    if (this.isEmployeeOnly(user)) {
      if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
      return { assignedToEmployeeId: user.employeeId };
    }
    if (this.isSalesOnly(user) && user.employeeId) {
      return { assignedToEmployeeId: user.employeeId };
    }
    return {};
  }

  private async logLeadActivity(
    user: AuthUser,
    leadId: string,
    action: string,
    detail?: string,
    meta?: Record<string, unknown>,
  ) {
    await this.prisma.crmActivityLog.create({
      data: {
        companyId: user.companyId,
        leadId,
        actorEmployeeId: user.employeeId ?? undefined,
        action,
        detail,
        meta: meta as object | undefined,
      },
    });
  }

  private ensureCrmAccess(user: AuthUser) {
    if (!this.canAccessCrm(user)) throw new ForbiddenException('CRM access denied');
  }

  private ensureCrmAdmin(user: AuthUser) {
    if (!this.isCrmAdmin(user)) throw new ForbiddenException('Admin CRM access required');
  }

  private ownerInclude = {
    owner: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
  };

  // ---- Customers ----
  listCustomers(user: AuthUser) {
    this.ensureCrmAccess(user);
    return this.prisma.crmCustomer.findMany({
      where: { companyId: user.companyId, ...this.ownerFilter(user) },
      include: this.ownerInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  createCustomer(user: AuthUser, dto: CreateCrmCustomerDto) {
    this.ensureCrmAccess(user);
    return this.prisma.crmCustomer.create({
      data: {
        companyId: user.companyId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        companyName: dto.companyName,
        address: dto.address,
        ownerEmployeeId: dto.ownerEmployeeId ?? user.employeeId ?? undefined,
      },
      include: this.ownerInclude,
    });
  }

  async updateCustomer(user: AuthUser, id: string, dto: UpdateCrmCustomerDto) {
    this.ensureCrmAccess(user);
    await this.getCustomerOrThrow(user, id);
    return this.prisma.crmCustomer.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        companyName: dto.companyName,
        address: dto.address,
        ownerEmployeeId: dto.ownerEmployeeId,
      },
      include: this.ownerInclude,
    });
  }

  async deleteCustomer(user: AuthUser, id: string) {
    this.ensureCrmAccess(user);
    await this.getCustomerOrThrow(user, id);
    await this.prisma.crmCustomer.delete({ where: { id } });
    return { ok: true };
  }

  private async getCustomerOrThrow(user: AuthUser, id: string) {
    const row = await this.prisma.crmCustomer.findFirst({
      where: { id, companyId: user.companyId, ...this.ownerFilter(user) },
    });
    if (!row) throw new NotFoundException('Customer not found');
    return row;
  }

  // ---- Leads ----
  listLeads(user: AuthUser, status?: CrmLeadStatus) {
    this.ensureCrmAccess(user);
    return this.prisma.crmLead.findMany({
      where: {
        companyId: user.companyId,
        ...this.ownerFilter(user),
        ...(status ? { status } : {}),
      },
      include: { ...this.ownerInclude, customer: { select: { id: true, name: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createLead(user: AuthUser, dto: CreateCrmLeadDto) {
    this.ensureCrmAccess(user);
    const lead = await this.prisma.crmLead.create({
      data: {
        companyId: user.companyId,
        title: dto.title,
        source: dto.source,
        status: dto.status ?? CrmLeadStatus.NEW,
        priority: dto.priority,
        expectedValue: dto.expectedValue,
        ownerEmployeeId: dto.ownerEmployeeId ?? user.employeeId ?? undefined,
        customerId: dto.customerId,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        whatsapp: dto.whatsapp,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
        nextAction: dto.nextAction,
        description: dto.description,
      },
      include: this.ownerInclude,
    });
    await this.logLeadActivity(user, lead.id, 'LEAD_CREATED', `Lead "${lead.title}" created`);
    return lead;
  }

  async getLead(user: AuthUser, id: string) {
    this.ensureCrmAccess(user);
    return this.prisma.crmLead.findFirst({
      where: { id, companyId: user.companyId, ...this.ownerFilter(user) },
      include: {
        ...this.ownerInclude,
        customer: { select: { id: true, name: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
  }

  listLeadActivities(user: AuthUser, leadId: string) {
    this.ensureCrmAccess(user);
    return this.getLead(user, leadId).then((lead) => {
      if (!lead) return [];
      return this.prisma.crmActivityLog.findMany({
        where: { companyId: user.companyId, leadId },
        include: {
          actor: { select: { employeeCode: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async updateLead(user: AuthUser, id: string, dto: UpdateCrmLeadDto) {
    this.ensureCrmAccess(user);
    const existing = await this.getLeadOrThrow(user, id);
    const lead = await this.prisma.crmLead.update({
      where: { id },
      data: {
        title: dto.title,
        source: dto.source,
        status: dto.status,
        priority: dto.priority,
        expectedValue: dto.expectedValue,
        ownerEmployeeId: dto.ownerEmployeeId,
        customerId: dto.customerId,
        contactName: dto.contactName,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        whatsapp: dto.whatsapp,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
        nextAction: dto.nextAction,
        description: dto.description,
      },
      include: this.ownerInclude,
    });
    if (dto.status && dto.status !== existing.status) {
      await this.logLeadActivity(user, id, 'STATUS_CHANGED', `${existing.status} → ${dto.status}`);
    } else {
      await this.logLeadActivity(user, id, 'LEAD_UPDATED', `Lead "${lead.title}" updated`);
    }
    return lead;
  }

  async deleteLead(user: AuthUser, id: string) {
    this.ensureCrmAccess(user);
    await this.getLeadOrThrow(user, id);
    await this.prisma.crmLead.delete({ where: { id } });
    return { ok: true };
  }

  private async getLeadOrThrow(user: AuthUser, id: string) {
    const row = await this.prisma.crmLead.findFirst({
      where: { id, companyId: user.companyId, ...this.ownerFilter(user) },
    });
    if (!row) throw new NotFoundException('Lead not found');
    return row;
  }

  // ---- Deals ----
  listDeals(user: AuthUser, stage?: CrmDealStage) {
    this.ensureCrmAccess(user);
    return this.prisma.crmDeal.findMany({
      where: {
        companyId: user.companyId,
        ...this.ownerFilter(user),
        ...(stage ? { stage } : {}),
      },
      include: {
        ...this.ownerInclude,
        customer: { select: { id: true, name: true } },
        lead: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  createDeal(user: AuthUser, dto: CreateCrmDealDto) {
    this.ensureCrmAccess(user);
    return this.prisma.crmDeal.create({
      data: {
        companyId: user.companyId,
        title: dto.title,
        stage: dto.stage ?? CrmDealStage.PROSPECTING,
        amount: dto.amount ?? 0,
        ownerEmployeeId: dto.ownerEmployeeId ?? user.employeeId ?? undefined,
        customerId: dto.customerId,
        leadId: dto.leadId,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        description: dto.description,
      },
      include: this.ownerInclude,
    });
  }

  async updateDeal(user: AuthUser, id: string, dto: UpdateCrmDealDto) {
    this.ensureCrmAccess(user);
    const existing = await this.getDealOrThrow(user, id);
    const stage = dto.stage ?? existing.stage;
    const closedAt =
      stage === CrmDealStage.WON || stage === CrmDealStage.LOST
        ? existing.closedAt ?? new Date()
        : null;
    return this.prisma.crmDeal.update({
      where: { id },
      data: {
        title: dto.title,
        stage: dto.stage,
        amount: dto.amount,
        ownerEmployeeId: dto.ownerEmployeeId,
        customerId: dto.customerId,
        leadId: dto.leadId,
        expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
        description: dto.description,
        closedAt,
      },
      include: this.ownerInclude,
    });
  }

  async deleteDeal(user: AuthUser, id: string) {
    this.ensureCrmAccess(user);
    await this.getDealOrThrow(user, id);
    await this.prisma.crmDeal.delete({ where: { id } });
    return { ok: true };
  }

  private async getDealOrThrow(user: AuthUser, id: string) {
    const row = await this.prisma.crmDeal.findFirst({
      where: { id, companyId: user.companyId, ...this.ownerFilter(user) },
    });
    if (!row) throw new NotFoundException('Deal not found');
    return row;
  }

  // ---- Follow-ups ----
  listFollowUps(user: AuthUser, todayOnly = false) {
    this.ensureCrmAccess(user);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.prisma.crmFollowUp.findMany({
      where: {
        companyId: user.companyId,
        ...this.ownerFilter(user),
        ...(todayOnly ? { dueAt: { gte: start, lt: end } } : {}),
      },
      include: {
        ...this.ownerInclude,
        lead: { select: { id: true, title: true } },
        deal: { select: { id: true, title: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  createFollowUp(user: AuthUser, dto: CreateCrmFollowUpDto) {
    this.ensureCrmAccess(user);
    if (!user.employeeId && !dto.ownerEmployeeId) {
      throw new ForbiddenException('Owner employee required');
    }
    return this.prisma.crmFollowUp.create({
      data: {
        companyId: user.companyId,
        title: dto.title,
        type: dto.type,
        dueAt: new Date(dto.dueAt),
        ownerEmployeeId: dto.ownerEmployeeId ?? user.employeeId!,
        leadId: dto.leadId,
        dealId: dto.dealId,
        customerId: dto.customerId,
        notes: dto.notes,
      },
      include: this.ownerInclude,
    });
  }

  async updateFollowUp(user: AuthUser, id: string, dto: UpdateCrmFollowUpDto) {
    this.ensureCrmAccess(user);
    await this.getFollowUpOrThrow(user, id);
    return this.prisma.crmFollowUp.update({
      where: { id },
      data: {
        title: dto.title,
        type: dto.type,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        ownerEmployeeId: dto.ownerEmployeeId,
        leadId: dto.leadId,
        dealId: dto.dealId,
        customerId: dto.customerId,
        notes: dto.notes,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      },
      include: this.ownerInclude,
    });
  }

  async completeFollowUp(user: AuthUser, id: string) {
    this.ensureCrmAccess(user);
    await this.getFollowUpOrThrow(user, id);
    return this.prisma.crmFollowUp.update({
      where: { id },
      data: { completedAt: new Date() },
      include: this.ownerInclude,
    });
  }

  async deleteFollowUp(user: AuthUser, id: string) {
    this.ensureCrmAccess(user);
    await this.getFollowUpOrThrow(user, id);
    await this.prisma.crmFollowUp.delete({ where: { id } });
    return { ok: true };
  }

  private async getFollowUpOrThrow(user: AuthUser, id: string) {
    const row = await this.prisma.crmFollowUp.findFirst({
      where: { id, companyId: user.companyId, ...this.ownerFilter(user) },
    });
    if (!row) throw new NotFoundException('Follow-up not found');
    return row;
  }

  // ---- Notes ----
  listNotes(user: AuthUser) {
    this.ensureCrmAccess(user);
    return this.prisma.crmNote.findMany({
      where: { companyId: user.companyId },
      include: {
        author: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        lead: { select: { id: true, title: true } },
        deal: { select: { id: true, title: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  createNote(user: AuthUser, dto: CreateCrmNoteDto) {
    this.ensureCrmAccess(user);
    return this.prisma.crmNote.create({
      data: {
        companyId: user.companyId,
        content: dto.content,
        authorEmployeeId: user.employeeId ?? undefined,
        leadId: dto.leadId,
        dealId: dto.dealId,
        customerId: dto.customerId,
      },
      include: {
        author: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      },
    });
  }

  async deleteNote(user: AuthUser, id: string) {
    this.ensureCrmAccess(user);
    const row = await this.prisma.crmNote.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!row) throw new NotFoundException('Note not found');
    await this.prisma.crmNote.delete({ where: { id } });
    return { ok: true };
  }

  // ---- Reports & Dashboard ----
  async dashboardStats(user: AuthUser) {
    this.ensureCrmAccess(user);
    const base = { companyId: user.companyId, ...this.ownerFilter(user) };
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [totalLeads, newLeads, followUpsToday, dealsWon, revenue] = await Promise.all([
      this.prisma.crmLead.count({ where: base }),
      this.prisma.crmLead.count({
        where: { ...base, status: CrmLeadStatus.NEW, createdAt: { gte: weekAgo } },
      }),
      this.prisma.crmFollowUp.count({
        where: {
          ...base,
          dueAt: { gte: start, lt: end },
          completedAt: null,
        },
      }),
      this.prisma.crmDeal.count({ where: { ...base, stage: CrmDealStage.WON } }),
      this.prisma.crmDeal.aggregate({
        where: { ...base, stage: CrmDealStage.WON },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalLeads,
      newLeads,
      followUpsToday,
      dealsWon,
      revenue: revenue._sum.amount ?? 0,
    };
  }

  async salesReport(user: AuthUser) {
    this.ensureCrmAccess(user);
    const base = { companyId: user.companyId, ...this.ownerFilter(user) };
    const [leadsByStatus, dealsByStage, topDeals, recentFollowUps] = await Promise.all([
      this.prisma.crmLead.groupBy({
        by: ['status'],
        where: base,
        _count: { _all: true },
      }),
      this.prisma.crmDeal.groupBy({
        by: ['stage'],
        where: base,
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.crmDeal.findMany({
        where: base,
        orderBy: { amount: 'desc' },
        take: 10,
        include: this.ownerInclude,
      }),
      this.prisma.crmFollowUp.findMany({
        where: { ...base, completedAt: null },
        orderBy: { dueAt: 'asc' },
        take: 20,
        include: this.ownerInclude,
      }),
    ]);

    return { leadsByStatus, dealsByStage, topDeals, recentFollowUps };
  }

  // ---- Tasks ----
  listTasks(user: AuthUser, status?: CrmTaskStatus) {
    this.ensureCrmAccess(user);
    return this.prisma.crmTask.findMany({
      where: {
        companyId: user.companyId,
        ...this.taskAssigneeFilter(user),
        ...(status ? { status } : {}),
      },
      include: {
        assignedTo: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        assignedBy: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        lead: { select: { id: true, title: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { employeeCode: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  async createTask(user: AuthUser, dto: CreateCrmTaskDto) {
    this.ensureCrmAdmin(user);
    if (!user.employeeId) throw new ForbiddenException('Assigner employee profile required');
    return this.prisma.crmTask.create({
      data: {
        companyId: user.companyId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        assignedByEmployeeId: user.employeeId,
        assignedToEmployeeId: dto.assignedToEmployeeId,
        leadId: dto.leadId,
      },
      include: {
        assignedTo: { select: { employeeCode: true, firstName: true, lastName: true } },
        assignedBy: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateTask(user: AuthUser, id: string, dto: UpdateCrmTaskDto) {
    this.ensureCrmAccess(user);
    const task = await this.getTaskOrThrow(user, id);
    const isAssignee = user.employeeId === task.assignedToEmployeeId;
    const isAdmin = this.isCrmAdmin(user);
    if (!isAssignee && !isAdmin) throw new ForbiddenException('Not allowed');

    if (dto.status === CrmTaskStatus.VERIFIED && !isAdmin) {
      throw new ForbiddenException('Only admin can verify tasks');
    }

    const verifiedAt =
      dto.status === CrmTaskStatus.VERIFIED ? new Date() : task.verifiedAt;

    return this.prisma.crmTask.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        status: dto.status,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        verifiedAt,
      },
      include: {
        assignedTo: { select: { employeeCode: true, firstName: true, lastName: true } },
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async addTaskComment(user: AuthUser, taskId: string, dto: CreateCrmTaskCommentDto) {
    this.ensureCrmAccess(user);
    await this.getTaskOrThrow(user, taskId);
    return this.prisma.crmTaskComment.create({
      data: {
        taskId,
        content: dto.content,
        authorEmployeeId: user.employeeId ?? undefined,
      },
      include: {
        author: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
    });
  }

  async verifyTask(user: AuthUser, id: string) {
    this.ensureCrmAdmin(user);
    await this.getTaskOrThrow(user, id);
    return this.prisma.crmTask.update({
      where: { id },
      data: { status: CrmTaskStatus.VERIFIED, verifiedAt: new Date() },
    });
  }

  private async getTaskOrThrow(user: AuthUser, id: string) {
    const where: { id: string; companyId: string; assignedToEmployeeId?: string } = {
      id,
      companyId: user.companyId,
    };
    if (this.isEmployeeOnly(user)) {
      if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
      where.assignedToEmployeeId = user.employeeId;
    } else if (this.isSalesOnly(user) && user.employeeId) {
      where.assignedToEmployeeId = user.employeeId;
    }
    const row = await this.prisma.crmTask.findFirst({ where });
    if (!row) throw new NotFoundException('Task not found');
    return row;
  }

  // ---- Import / Export ----
  async importLeads(user: AuthUser, leads: CreateCrmLeadDto[]) {
    this.ensureCrmAdmin(user);
    const created = [];
    for (const dto of leads) {
      created.push(await this.createLead(user, dto));
    }
    return { imported: created.length, leads: created };
  }

  async exportLeads(user: AuthUser, format: 'csv' | 'xlsx' | 'pdf') {
    this.ensureCrmAccess(user);
    const leads = await this.prisma.crmLead.findMany({
      where: { companyId: user.companyId, ...this.ownerFilter(user) },
      include: { owner: { select: { employeeCode: true, firstName: true, lastName: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    const rows = leads.map((l) => ({
      title: l.title,
      contactName: l.contactName,
      contactPhone: l.contactPhone,
      contactEmail: l.contactEmail,
      whatsapp: l.whatsapp,
      source: l.source,
      status: l.status,
      priority: l.priority,
      followUpAt: l.followUpAt?.toISOString() ?? '',
      nextAction: l.nextAction,
      owner: l.owner ? `${l.owner.firstName} ${l.owner.lastName}` : '',
    }));
    if (format === 'csv') {
      return { filename: 'leads.csv', contentType: 'text/csv', content: rowsToCsv(rows) };
    }
    if (format === 'pdf') {
      return {
        filename: 'leads.html',
        contentType: 'text/html',
        content: rowsToHtmlPdf('CRM Leads', rows),
      };
    }
    return buildExport('excel', 'CRM Leads', rows);
  }
}
