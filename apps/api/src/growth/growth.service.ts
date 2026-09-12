import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  AuditAction,
  RoleCode,
  TicketCategory,
  TicketPriority,
  TicketStatus,
  TrainingStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  AssignTrainingDto,
  CompleteTrainingDto,
  CreateGoalDto,
  CreateTicketDto,
  CreateTrainingDto,
  ManagerReviewDto,
  SelfAssessmentDto,
  TicketCommentDto,
  UpdateTicketStatusDto,
} from './dto/growth.dto';

@Injectable()
export class GrowthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isHr(user: AuthUser) {
    return user.roles.some((r) => (['SUPER_ADMIN', 'HR'] as string[]).includes(r));
  }

  private isManagerish(user: AuthUser) {
    return user.roles.some((r) =>
      (['SUPER_ADMIN', 'HR', 'ADMIN'] as string[]).includes(r),
    );
  }

  // ---- Performance ----
  async createGoal(user: AuthUser, dto: CreateGoalDto) {
    if (!this.isManagerish(user)) throw new ForbiddenException();
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: user.companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const goal = await this.prisma.performanceGoal.create({
      data: {
        companyId: user.companyId,
        employeeId: dto.employeeId,
        cycleYear: dto.cycleYear,
        title: dto.title,
        description: dto.description,
        kra: dto.kra,
        kpi: dto.kpi,
        targetValue: dto.targetValue,
        weight: dto.weight ?? 1,
        status: dto.status,
        createdBy: user.id,
      },
    });
    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'PerformanceGoal',
      entityId: goal.id,
    });
    return goal;
  }

  listGoals(companyId: string, employeeId?: string, cycleYear?: number) {
    return this.prisma.performanceGoal.findMany({
      where: {
        companyId,
        ...(employeeId ? { employeeId } : {}),
        ...(cycleYear ? { cycleYear } : {}),
      },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
      },
      orderBy: [{ cycleYear: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async selfAssessment(user: AuthUser, dto: SelfAssessmentDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    return this.prisma.selfAssessment.upsert({
      where: {
        employeeId_cycleYear: {
          employeeId: user.employeeId,
          cycleYear: dto.cycleYear,
        },
      },
      create: {
        companyId: user.companyId,
        employeeId: user.employeeId,
        cycleYear: dto.cycleYear,
        summary: dto.summary,
        achievements: dto.achievements,
        challenges: dto.challenges,
        selfRating: dto.selfRating,
      },
      update: {
        summary: dto.summary,
        achievements: dto.achievements,
        challenges: dto.challenges,
        selfRating: dto.selfRating,
        submittedAt: new Date(),
      },
    });
  }

  async managerReview(user: AuthUser, dto: ManagerReviewDto) {
    if (!this.isManagerish(user)) throw new ForbiddenException();
    if (!user.employeeId && !this.isHr(user)) {
      throw new ForbiddenException('Manager profile required');
    }

    // HR/CEO without employeeId: use a synthetic manager — find any active manager or self via first HR employee
    let managerId = user.employeeId;
    if (!managerId) {
      const any = await this.prisma.employee.findFirst({
        where: { companyId: user.companyId, isActive: true },
        orderBy: { employeeCode: 'asc' },
      });
      if (!any) throw new BadRequestException('No employee to act as reviewer');
      // For CEO without employee link, require employeeId of a peer manager OR use reportingTo of subject
      const subject = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, companyId: user.companyId },
      });
      if (!subject) throw new NotFoundException('Employee not found');
      managerId = subject.reportingToId ?? any.id;
    }

    const review = await this.prisma.managerReview.upsert({
      where: {
        employeeId_cycleYear: {
          employeeId: dto.employeeId,
          cycleYear: dto.cycleYear,
        },
      },
      create: {
        companyId: user.companyId,
        employeeId: dto.employeeId,
        managerId,
        cycleYear: dto.cycleYear,
        feedback: dto.feedback,
        rating: dto.rating,
        strengths: dto.strengths,
        improvements: dto.improvements,
      },
      update: {
        feedback: dto.feedback,
        rating: dto.rating,
        strengths: dto.strengths,
        improvements: dto.improvements,
        managerId,
        reviewedAt: new Date(),
      },
    });

    if (dto.recommendPromotion) {
      await this.prisma.promotionRecommendation.create({
        data: {
          companyId: user.companyId,
          employeeId: dto.employeeId,
          cycleYear: dto.cycleYear,
          recommended: true,
          proposedDesignation: dto.proposedDesignation,
          rationale: dto.promotionRationale,
          createdBy: user.id,
        },
      });
    }

    return review;
  }

  async performanceSummary(companyId: string, employeeId: string, cycleYear?: number) {
    const year = cycleYear ?? new Date().getFullYear();
    const [goals, self, review, promotions] = await Promise.all([
      this.prisma.performanceGoal.findMany({
        where: { companyId, employeeId, cycleYear: year },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.selfAssessment.findUnique({
        where: { employeeId_cycleYear: { employeeId, cycleYear: year } },
      }),
      this.prisma.managerReview.findUnique({
        where: { employeeId_cycleYear: { employeeId, cycleYear: year } },
        include: {
          manager: { select: { employeeCode: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.promotionRecommendation.findMany({
        where: { employeeId, cycleYear: year },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { cycleYear: year, goals, selfAssessment: self, managerReview: review, promotions };
  }

  async myRewards(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    const [promotions, revisions, reviews] = await Promise.all([
      this.prisma.promotionRecommendation.findMany({
        where: { employeeId: user.employeeId, recommended: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.salaryRevision.findMany({
        where: { employeeId: user.employeeId },
        orderBy: { effectiveFrom: 'desc' },
        take: 20,
      }),
      this.prisma.managerReview.findMany({
        where: { employeeId: user.employeeId, rating: { gte: 4 } },
        orderBy: { reviewedAt: 'desc' },
        take: 20,
      }),
    ]);

    return [
      ...promotions.map((item) => ({
        id: `promotion-${item.id}`,
        type: 'PROMOTION',
        title: item.proposedDesignation
          ? `Promotion recommendation: ${item.proposedDesignation}`
          : 'Promotion recommendation',
        description: item.rationale ?? 'Recommended by manager/HR.',
        date: item.createdAt.toISOString(),
      })),
      ...revisions.map((item) => ({
        id: `increment-${item.id}`,
        type: 'INCREMENT',
        title: 'Salary increment',
        description: item.reason ?? 'Compensation revision recorded.',
        amount: item.newCtc - (item.previousCtc ?? 0),
        date: item.effectiveFrom.toISOString(),
      })),
      ...reviews.map((item) => ({
        id: `recognition-${item.id}`,
        type: 'RECOGNITION',
        title: `Performance recognition (${item.rating}/5)`,
        description: item.feedback,
        date: item.reviewedAt.toISOString(),
      })),
    ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }

  // ---- Training ----
  listTrainings(companyId: string) {
    return this.prisma.training.findMany({
      where: { companyId },
      include: { _count: { select: { assignments: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTraining(user: AuthUser, dto: CreateTrainingDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    return this.prisma.training.create({
      data: {
        companyId: user.companyId,
        code: dto.code,
        title: dto.title,
        description: dto.description,
        provider: dto.provider,
        durationHrs: dto.durationHrs,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: TrainingStatus.OPEN,
      },
    });
  }

  async assignTraining(user: AuthUser, trainingId: string, dto: AssignTrainingDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const training = await this.prisma.training.findFirst({
      where: { id: trainingId, companyId: user.companyId },
    });
    if (!training) throw new NotFoundException('Training not found');
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: user.companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    return this.prisma.trainingAssignment.upsert({
      where: {
        trainingId_employeeId: { trainingId, employeeId: dto.employeeId },
      },
      create: {
        trainingId,
        employeeId: dto.employeeId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      update: {
        status: AssignmentStatus.ASSIGNED,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      include: { training: true, employee: true },
    });
  }

  async completeTraining(
    user: AuthUser,
    trainingId: string,
    dto: CompleteTrainingDto,
    employeeId?: string,
  ) {
    const targetId = employeeId ?? user.employeeId;
    if (!targetId) throw new ForbiddenException();
    if (employeeId && employeeId !== user.employeeId && !this.isHr(user)) {
      throw new ForbiddenException();
    }

    const assignment = await this.prisma.trainingAssignment.findUnique({
      where: {
        trainingId_employeeId: { trainingId, employeeId: targetId },
      },
      include: { training: true },
    });
    if (!assignment || assignment.training.companyId !== user.companyId) {
      throw new NotFoundException('Assignment not found');
    }

    const updated = await this.prisma.trainingAssignment.update({
      where: { id: assignment.id },
      data: {
        status: AssignmentStatus.COMPLETED,
        completedAt: new Date(),
        score: dto.score,
        notes: dto.notes,
        certificateNo:
          dto.issueCertificate !== false
            ? `CERT-${assignment.training.code}-${Date.now().toString(36).toUpperCase()}`
            : undefined,
      },
    });

    if (dto.issueCertificate !== false) {
      await this.prisma.certification.upsert({
        where: { assignmentId: updated.id },
        create: {
          employeeId: targetId,
          assignmentId: updated.id,
          name: assignment.training.title,
          certificateNo: updated.certificateNo ?? undefined,
        },
        update: {
          name: assignment.training.title,
          certificateNo: updated.certificateNo ?? undefined,
          issuedAt: new Date(),
        },
      });
    }

    return updated;
  }

  myTrainings(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException();
    return this.prisma.trainingAssignment.findMany({
      where: { employeeId: user.employeeId },
      include: { training: true, certification: true },
      orderBy: { assignedAt: 'desc' },
    });
  }

  certifications(companyId: string, employeeId: string) {
    return this.prisma.certification.findMany({
      where: { employeeId, employee: { companyId } },
      orderBy: { issuedAt: 'desc' },
    });
  }

  // ---- Helpdesk ----
  async ensureSlaDefaults(companyId: string) {
    const defaults: {
      category: TicketCategory;
      priority: TicketPriority;
      responseMins: number;
      resolveMins: number;
      escalateAfterMins: number;
    }[] = [
      { category: TicketCategory.HR, priority: TicketPriority.MEDIUM, responseMins: 240, resolveMins: 2880, escalateAfterMins: 1440 },
      { category: TicketCategory.IT, priority: TicketPriority.HIGH, responseMins: 60, resolveMins: 480, escalateAfterMins: 240 },
      { category: TicketCategory.FINANCE, priority: TicketPriority.MEDIUM, responseMins: 240, resolveMins: 2880, escalateAfterMins: 1440 },
      { category: TicketCategory.ADMIN, priority: TicketPriority.LOW, responseMins: 480, resolveMins: 4320, escalateAfterMins: 2880 },
      { category: TicketCategory.IT, priority: TicketPriority.URGENT, responseMins: 30, resolveMins: 240, escalateAfterMins: 120 },
    ];
    for (const d of defaults) {
      await this.prisma.ticketSlaConfig.upsert({
        where: {
          companyId_category_priority: {
            companyId,
            category: d.category,
            priority: d.priority,
          },
        },
        create: { companyId, ...d },
        update: {},
      });
    }
  }

  async createTicket(user: AuthUser, dto: CreateTicketDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    await this.ensureSlaDefaults(user.companyId);

    const priority = dto.priority ?? TicketPriority.MEDIUM;
    const sla = await this.prisma.ticketSlaConfig.findUnique({
      where: {
        companyId_category_priority: {
          companyId: user.companyId,
          category: dto.category,
          priority,
        },
      },
    });

    const count = await this.prisma.ticket.count({ where: { companyId: user.companyId } });
    const ticketNo = `TKT-${String(count + 1).padStart(5, '0')}`;
    const dueAt = sla
      ? new Date(Date.now() + sla.resolveMins * 60_000)
      : new Date(Date.now() + 48 * 3600_000);

    return this.prisma.ticket.create({
      data: {
        companyId: user.companyId,
        ticketNo,
        requesterId: user.employeeId,
        category: dto.category,
        priority,
        subject: dto.subject,
        description: dto.description,
        dueAt,
      },
    });
  }

  listTickets(user: AuthUser, mineOnly = false) {
    const where = mineOnly
      ? { companyId: user.companyId, requesterId: user.employeeId ?? '__none__' }
      : this.isHr(user)
        ? { companyId: user.companyId }
        : {
            companyId: user.companyId,
            OR: [
              { requesterId: user.employeeId ?? '__none__' },
              { assigneeId: user.employeeId ?? '__none__' },
            ],
          };

    return this.prisma.ticket.findMany({
      where,
      include: {
        requester: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
        assignee: {
          select: { employeeCode: true, firstName: true, lastName: true },
        },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTicket(user: AuthUser, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        requester: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        },
        assignee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        },
        comments: {
          include: {
            author: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) throw new NotFoundException();
    if (
      !this.isHr(user) &&
      ticket.requesterId !== user.employeeId &&
      ticket.assigneeId !== user.employeeId
    ) {
      throw new ForbiddenException();
    }
    return ticket;
  }

  async comment(user: AuthUser, id: string, dto: TicketCommentDto) {
    if (!user.employeeId) throw new ForbiddenException();
    await this.getTicket(user, id);
    return this.prisma.ticketComment.create({
      data: {
        ticketId: id,
        authorId: user.employeeId,
        body: dto.body,
        isInternal: dto.isInternal ?? false,
      },
    });
  }

  async updateTicketStatus(user: AuthUser, id: string, dto: UpdateTicketStatusDto) {
    if (!this.isHr(user) && !user.roles.includes(RoleCode.ADMIN)) {
      throw new ForbiddenException();
    }
    await this.getTicket(user, id);
    return this.prisma.ticket.update({
      where: { id },
      data: {
        status: dto.status,
        assigneeId: dto.assigneeId,
        resolvedAt: ([TicketStatus.RESOLVED, TicketStatus.CLOSED] as TicketStatus[]).includes(
          dto.status,
        )
          ? new Date()
          : undefined,
      },
    });
  }

  async escalate(user: AuthUser, id: string) {
    if (!this.isHr(user) && !user.roles.includes(RoleCode.ADMIN)) {
      throw new ForbiddenException();
    }
    const ticket = await this.getTicket(user, id);
    return this.prisma.ticket.update({
      where: { id },
      data: {
        status: TicketStatus.ESCALATED,
        escalatedAt: new Date(),
        priority:
          ticket.priority === TicketPriority.URGENT
            ? TicketPriority.URGENT
            : ticket.priority === TicketPriority.HIGH
              ? TicketPriority.URGENT
              : TicketPriority.HIGH,
      },
    });
  }

  /** Manual/cron-friendly: escalate tickets past SLA escalate window */
  async runSlaEscalation(companyId: string) {
    await this.ensureSlaDefaults(companyId);
    const open = await this.prisma.ticket.findMany({
      where: {
        companyId,
        status: { in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.WAITING] },
      },
    });
    let count = 0;
    for (const t of open) {
      const sla = await this.prisma.ticketSlaConfig.findUnique({
        where: {
          companyId_category_priority: {
            companyId,
            category: t.category,
            priority: t.priority,
          },
        },
      });
      if (!sla) continue;
      const ageMins = (Date.now() - t.createdAt.getTime()) / 60_000;
      if (ageMins >= sla.escalateAfterMins && t.status !== TicketStatus.ESCALATED) {
        await this.prisma.ticket.update({
          where: { id: t.id },
          data: {
            status: TicketStatus.ESCALATED,
            escalatedAt: new Date(),
          },
        });
        count++;
      }
    }
    return { escalated: count };
  }
}
