import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalActionType,
  ApprovalInstanceStatus,
  AuditAction,
  ClearanceItemStatus,
  EmploymentStatus,
  LeaveApplicationStatus,
  LeaveLedgerType,
  LoanAdvanceStatus,
  NotificationStatus,
  ReimbursementStatus,
  ResignationStatus,
  WorkflowType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { ActApprovalDto, ConfigureWorkflowDto } from './dto/workflow.dto';

const DEFAULTS: {
  type: WorkflowType;
  name: string;
  steps: { stepOrder: number; approverRole: string; label: string }[];
}[] = [
  {
    type: WorkflowType.LEAVE,
    name: 'Leave approval',
    steps: [
      { stepOrder: 1, approverRole: 'ADMIN', label: 'ADMIN' },
      { stepOrder: 2, approverRole: 'HR', label: 'HR' },
    ],
  },
  {
    type: WorkflowType.LOAN,
    name: 'Loan approval',
    steps: [{ stepOrder: 1, approverRole: 'ADMIN', label: 'ADMIN' }],
  },
  {
    type: WorkflowType.ADVANCE,
    name: 'Advance approval',
    steps: [{ stepOrder: 1, approverRole: 'ADMIN', label: 'ADMIN' }],
  },
  {
    type: WorkflowType.EXPENSE,
    name: 'Reimbursement approval',
    steps: [
      { stepOrder: 1, approverRole: 'HR', label: 'HR' },
      { stepOrder: 2, approverRole: 'SUPER_ADMIN', label: 'Super Admin' },
    ],
  },
  {
    type: WorkflowType.RESIGNATION,
    name: 'Resignation approval',
    steps: [{ stepOrder: 1, approverRole: 'HR', label: 'HR' }],
  },
  {
    type: WorkflowType.SALARY,
    name: 'Salary revision approval',
    steps: [
      { stepOrder: 1, approverRole: 'HR', label: 'HR' },
      { stepOrder: 2, approverRole: 'SUPER_ADMIN', label: 'Super Admin' },
    ],
  },
];

const CLEARANCE_STEPS = [
  { code: 'HR', title: 'HR clearance', department: 'HR' },
  { code: 'IT', title: 'IT / assets returned', department: 'IT' },
  { code: 'ADMIN', title: 'Finance / loans & ESD', department: 'ADMIN' },
  { code: 'ADMIN', title: 'Admin / access cards', department: 'Admin' },
  { code: 'ADMIN', title: 'Manager handover', department: 'ADMIN' },
];

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ensureDefaults(companyId: string) {
    for (const d of DEFAULTS) {
      const existing = await this.prisma.approvalWorkflow.findUnique({
        where: { companyId_type: { companyId, type: d.type } },
        include: { steps: true },
      });
      if (existing) continue;
      await this.prisma.approvalWorkflow.create({
        data: {
          companyId,
          type: d.type,
          name: d.name,
          steps: { create: d.steps },
        },
      });
    }
  }

  async listWorkflows(companyId: string) {
    await this.ensureDefaults(companyId);
    return this.prisma.approvalWorkflow.findMany({
      where: { companyId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { type: 'asc' },
    });
  }

  async getConfig(companyId: string, type: WorkflowType) {
    await this.ensureDefaults(companyId);
    const wf = await this.prisma.approvalWorkflow.findUnique({
      where: { companyId_type: { companyId, type } },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!wf) throw new NotFoundException('Workflow not found');
    return wf;
  }

  async configure(user: AuthUser, type: WorkflowType, dto: ConfigureWorkflowDto) {
    if (!user.roles.some((r) => (['SUPER_ADMIN', 'HR'] as string[]).includes(r))) {
      throw new ForbiddenException();
    }
    await this.ensureDefaults(user.companyId);
    const wf = await this.prisma.approvalWorkflow.findUnique({
      where: { companyId_type: { companyId: user.companyId, type } },
    });
    if (!wf) throw new NotFoundException();

    const sorted = [...dto.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    if (!sorted.length) throw new BadRequestException('At least one step required');

    await this.prisma.$transaction([
      this.prisma.approvalChainStep.deleteMany({ where: { workflowId: wf.id } }),
      this.prisma.approvalWorkflow.update({
        where: { id: wf.id },
        data: {
          name: dto.name ?? wf.name,
          steps: {
            create: sorted.map((s) => ({
              stepOrder: s.stepOrder,
              approverRole: s.approverRole.toUpperCase(),
              label: s.label,
            })),
          },
        },
      }),
    ]);

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.UPDATE,
      entityType: 'ApprovalWorkflow',
      entityId: wf.id,
      metadata: { type, steps: sorted.length },
    });

    return this.getConfig(user.companyId, type);
  }

  async startInstance(params: {
    companyId: string;
    type: WorkflowType;
    entityType: string;
    entityId: string;
    requesterId?: string;
    summary?: string;
  }) {
    await this.ensureDefaults(params.companyId);
    const open = await this.prisma.approvalInstance.findFirst({
      where: {
        entityType: params.entityType,
        entityId: params.entityId,
        status: ApprovalInstanceStatus.PENDING,
      },
    });
    if (open) return open;

    const wf = await this.getConfig(params.companyId, params.type);
    if (!wf.steps.length) throw new BadRequestException('Workflow has no steps');

    const instance = await this.prisma.approvalInstance.create({
      data: {
        companyId: params.companyId,
        workflowId: wf.id,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        requesterId: params.requesterId,
        summary: params.summary,
        currentStepOrder: wf.steps[0].stepOrder,
      },
      include: { workflow: { include: { steps: true } } },
    });

    await this.notify(
      params.companyId,
      params.requesterId,
      `Approval started: ${params.type}`,
      params.summary ?? `${params.entityType} ${params.entityId}`,
    );

    return instance;
  }

  private async notify(
    companyId: string,
    employeeId: string | undefined | null,
    title: string,
    body: string,
  ) {
    try {
      await this.prisma.notification.create({
        data: {
          companyId,
          employeeId: employeeId ?? undefined,
          title,
          body,
          category: 'approval',
          status: NotificationStatus.SENT,
        },
      });
    } catch {
      // non-fatal
    }
  }

  private userCanAct(user: AuthUser, requiredRole: string) {
    const role = requiredRole.toUpperCase();
    if (user.roles.includes(role)) return true;
    // CEO can act as HR/FINANCE/MANAGER for governance override
    if (user.roles.includes('SUPER_ADMIN')) return true;
    return false;
  }

  async act(user: AuthUser, instanceId: string, dto: ActApprovalDto) {
    if (dto.action === ApprovalActionType.COMMENT) {
      throw new BadRequestException('Use APPROVE or REJECT');
    }

    const instance = await this.prisma.approvalInstance.findFirst({
      where: { id: instanceId, companyId: user.companyId },
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: true,
      },
    });
    if (!instance) throw new NotFoundException('Approval instance not found');
    if (instance.status !== ApprovalInstanceStatus.PENDING) {
      throw new BadRequestException('Instance is not pending');
    }

    const step = instance.workflow.steps.find(
      (s) => s.stepOrder === instance.currentStepOrder,
    );
    if (!step) throw new BadRequestException('Current step missing');
    if (!this.userCanAct(user, step.approverRole)) {
      throw new ForbiddenException(`Requires role ${step.approverRole}`);
    }

    await this.prisma.approvalAction.create({
      data: {
        instanceId: instance.id,
        stepOrder: step.stepOrder,
        actorId: user.id,
        actorRole: step.approverRole,
        action: dto.action,
        comment: dto.comment,
      },
    });

    if (dto.action === ApprovalActionType.REJECT) {
      const updated = await this.prisma.approvalInstance.update({
        where: { id: instance.id },
        data: {
          status: ApprovalInstanceStatus.REJECTED,
          completedAt: new Date(),
        },
      });
      await this.applyDomain(user, updated, 'REJECTED');
      await this.notify(
        user.companyId,
        instance.requesterId,
        `${instance.type} rejected`,
        dto.comment ?? 'Your request was rejected',
      );
      return this.getInstance(user.companyId, instance.id);
    }

    const next = instance.workflow.steps.find(
      (s) => s.stepOrder > instance.currentStepOrder,
    );
    if (next) {
      await this.prisma.approvalInstance.update({
        where: { id: instance.id },
        data: { currentStepOrder: next.stepOrder },
      });
      await this.notify(
        user.companyId,
        instance.requesterId,
        `${instance.type} step approved`,
        `Advanced to ${next.label ?? next.approverRole}`,
      );
      return this.getInstance(user.companyId, instance.id);
    }

    await this.prisma.approvalInstance.update({
      where: { id: instance.id },
      data: {
        status: ApprovalInstanceStatus.APPROVED,
        completedAt: new Date(),
      },
    });
    await this.applyDomain(user, instance, 'APPROVED');
    await this.notify(
      user.companyId,
      instance.requesterId,
      `${instance.type} approved`,
      'Your request was fully approved',
    );
    return this.getInstance(user.companyId, instance.id);
  }

  async getInstance(companyId: string, id: string) {
    const row = await this.prisma.approvalInstance.findFirst({
      where: { id, companyId },
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  listPending(user: AuthUser) {
    return this.prisma.approvalInstance.findMany({
      where: {
        companyId: user.companyId,
        status: ApprovalInstanceStatus.PENDING,
      },
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    }).then((rows) =>
      rows.filter((r) => {
        const step = r.workflow.steps.find((s) => s.stepOrder === r.currentStepOrder);
        return step ? this.userCanAct(user, step.approverRole) : false;
      }),
    );
  }

  listMine(user: AuthUser) {
    if (!user.employeeId) return [];
    return this.prisma.approvalInstance.findMany({
      where: { companyId: user.companyId, requesterId: user.employeeId },
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listHistory(companyId: string, status?: string) {
    const where: any = {
      companyId,
      status: { in: [ApprovalInstanceStatus.APPROVED, ApprovalInstanceStatus.REJECTED] },
    };
    if (status === 'APPROVED') where.status = ApprovalInstanceStatus.APPROVED;
    else if (status === 'REJECTED') where.status = ApprovalInstanceStatus.REJECTED;

    const rows = await this.prisma.approvalInstance.findMany({
      where,
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { completedAt: 'desc' },
      take: 200,
    });

    const requesterIds = [...new Set(rows.map((r) => r.requesterId).filter(Boolean))] as string[];
    const employees = requesterIds.length
      ? await this.prisma.employee.findMany({
          where: { id: { in: requesterIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName ?? ''}`.trim()]));

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      entityType: r.entityType,
      entityId: r.entityId,
      summary: r.summary,
      status: r.status,
      employeeName: r.requesterId ? empMap.get(r.requesterId) ?? '' : '',
      completedAt: r.completedAt?.toISOString() ?? r.updatedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Sync helper when legacy module endpoints approve/reject */
  async syncFromLegacy(params: {
    companyId: string;
    entityType: string;
    entityId: string;
    action: 'APPROVE' | 'REJECT';
    actorId: string;
    comment?: string;
  }) {
    const instance = await this.prisma.approvalInstance.findFirst({
      where: {
        companyId: params.companyId,
        entityType: params.entityType,
        entityId: params.entityId,
        status: ApprovalInstanceStatus.PENDING,
      },
      include: { workflow: { include: { steps: true } } },
    });
    if (!instance) return null;

    const step = instance.workflow.steps.find(
      (s) => s.stepOrder === instance.currentStepOrder,
    );
    await this.prisma.approvalAction.create({
      data: {
        instanceId: instance.id,
        stepOrder: instance.currentStepOrder,
        actorId: params.actorId,
        actorRole: step?.approverRole,
        action:
          params.action === 'APPROVE'
            ? ApprovalActionType.APPROVE
            : ApprovalActionType.REJECT,
        comment: params.comment ?? 'Via legacy module endpoint',
      },
    });

    if (params.action === 'REJECT') {
      return this.prisma.approvalInstance.update({
        where: { id: instance.id },
        data: {
          status: ApprovalInstanceStatus.REJECTED,
          completedAt: new Date(),
        },
      });
    }

    const next = instance.workflow.steps.find(
      (s) => s.stepOrder > instance.currentStepOrder,
    );
    if (next) {
      return this.prisma.approvalInstance.update({
        where: { id: instance.id },
        data: { currentStepOrder: next.stepOrder },
      });
    }
    return this.prisma.approvalInstance.update({
      where: { id: instance.id },
      data: {
        status: ApprovalInstanceStatus.APPROVED,
        completedAt: new Date(),
      },
    });
  }

  private async applyDomain(
    user: AuthUser,
    instance: { type: WorkflowType; entityType: string; entityId: string },
    outcome: 'APPROVED' | 'REJECTED',
  ) {
    if (instance.type === WorkflowType.LEAVE || instance.entityType === 'LeaveApplication') {
      await this.applyLeave(user, instance.entityId, outcome);
    } else if (
      instance.type === WorkflowType.LOAN ||
      instance.type === WorkflowType.ADVANCE ||
      instance.entityType === 'LoanAdvance'
    ) {
      await this.applyLoan(user, instance.entityId, outcome);
    } else if (
      instance.type === WorkflowType.EXPENSE ||
      instance.entityType === 'ReimbursementClaim'
    ) {
      await this.applyExpense(user, instance.entityId, outcome);
    } else if (
      instance.type === WorkflowType.RESIGNATION ||
      instance.entityType === 'Resignation'
    ) {
      await this.applyResignation(user, instance.entityId, outcome);
    }
  }

  private async applyLeave(
    user: AuthUser,
    id: string,
    outcome: 'APPROVED' | 'REJECTED',
  ) {
    const app = await this.prisma.leaveApplication.findFirst({
      where: { id, companyId: user.companyId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!app || app.status !== LeaveApplicationStatus.PENDING) return;

    if (outcome === 'REJECTED') {
      await this.prisma.leaveApplication.update({
        where: { id },
        data: { status: LeaveApplicationStatus.REJECTED },
      });
      await this.prisma.leaveApprovalStep.updateMany({
        where: { applicationId: id, status: LeaveApplicationStatus.PENDING },
        data: {
          status: LeaveApplicationStatus.REJECTED,
          actedAt: new Date(),
          approverId: user.employeeId ?? undefined,
        },
      });
      return;
    }

    // Fully approved via engine
    await this.prisma.$transaction(async (tx) => {
      await tx.leaveApprovalStep.updateMany({
        where: { applicationId: id },
        data: {
          status: LeaveApplicationStatus.APPROVED,
          actedAt: new Date(),
          approverId: user.employeeId ?? undefined,
        },
      });
      await tx.leaveApplication.update({
        where: { id },
        data: { status: LeaveApplicationStatus.APPROVED },
      });
      const bal = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: app.employeeId,
            leaveTypeId: app.leaveTypeId,
            year: app.fromDate.getUTCFullYear(),
          },
        },
      });
      if (bal) {
        const updated = await tx.leaveBalance.update({
          where: { id: bal.id },
          data: { used: { increment: app.days } },
        });
        const available =
          updated.opening +
          updated.accrued +
          updated.carriedForward +
          updated.adjusted -
          updated.used -
          updated.encashed;
        await tx.leaveLedgerEntry.create({
          data: {
            companyId: app.companyId,
            employeeId: app.employeeId,
            leaveTypeId: app.leaveTypeId,
            applicationId: app.id,
            entryType: LeaveLedgerType.DEBIT,
            days: app.days,
            balanceAfter: available,
            note: 'Leave approved via workflow',
            createdBy: user.id,
          },
        });
      }
    });
  }

  private async applyLoan(
    user: AuthUser,
    id: string,
    outcome: 'APPROVED' | 'REJECTED',
  ) {
    const loan = await this.prisma.loanAdvance.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!loan || loan.status !== LoanAdvanceStatus.PENDING) return;

    if (outcome === 'REJECTED') {
      await this.prisma.loanAdvance.update({
        where: { id },
        data: {
          status: LoanAdvanceStatus.REJECTED,
          approvedBy: user.id,
          approvedAt: new Date(),
        },
      });
      return;
    }

    const now = new Date();
    const emis = [];
    for (let i = 0; i < loan.tenureMonths; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      emis.push({
        installmentNo: i + 1,
        dueYear: d.getFullYear(),
        dueMonth: d.getMonth() + 1,
        amount: loan.emiAmount,
      });
    }
    await this.prisma.loanAdvance.update({
      where: { id },
      data: {
        status: LoanAdvanceStatus.ACTIVE,
        approvedBy: user.id,
        approvedAt: now,
        startedAt: now,
        emis: { create: emis },
      },
    });
  }

  private async applyExpense(
    user: AuthUser,
    id: string,
    outcome: 'APPROVED' | 'REJECTED',
  ) {
    const claim = await this.prisma.reimbursementClaim.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!claim || claim.status !== ReimbursementStatus.PENDING) return;

    if (outcome === 'REJECTED') {
      await this.prisma.reimbursementClaim.update({
        where: { id },
        data: { status: ReimbursementStatus.REJECTED, rejectReason: 'Workflow rejected' },
      });
      return;
    }

    await this.prisma.reimbursementClaim.update({
      where: { id },
      data: {
        status: ReimbursementStatus.APPROVED,
        hrApprovedAt: claim.hrApprovedAt ?? new Date(),
        hrApprovedBy: claim.hrApprovedBy ?? user.id,
        ceoApprovedAt: new Date(),
        ceoApprovedBy: user.id,
      },
    });
  }

  private async applyResignation(
    user: AuthUser,
    id: string,
    outcome: 'APPROVED' | 'REJECTED',
  ) {
    const res = await this.prisma.resignation.findFirst({
      where: { id, companyId: user.companyId },
      include: { employee: true },
    });
    if (!res || res.status !== ResignationStatus.PENDING) return;

    if (outcome === 'REJECTED') {
      await this.prisma.resignation.update({
        where: { id },
        data: {
          status: ResignationStatus.REJECTED,
          approvedBy: user.id,
          approvedAt: new Date(),
        },
      });
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.resignation.update({
        where: { id },
        data: {
          status: ResignationStatus.APPROVED,
          approvedBy: user.id,
          approvedAt: new Date(),
          clearance: {
            create: CLEARANCE_STEPS.map((s) => ({
              code: s.code,
              title: s.title,
              department: s.department,
              status: ClearanceItemStatus.PENDING,
            })),
          },
        },
      });
      await tx.employee.update({
        where: { id: res.employeeId },
        data: { status: EmploymentStatus.NOTICE },
      });
      await tx.employeeStatusHistory.create({
        data: {
          employeeId: res.employeeId,
          fromStatus: res.employee.status,
          toStatus: EmploymentStatus.NOTICE,
          reason: 'Resignation approved via workflow',
          changedBy: user.id,
        },
      });
    });
  }
}
