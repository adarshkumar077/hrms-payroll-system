import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  AssetStatus,
  AuditAction,
  ClearanceItemStatus,
  DamageChargeStatus,
  DocumentTypeCode,
  EmploymentStatus,
  EsdEntryType,
  FnfStatus,
  LoanAdvanceStatus,
  OnboardingStatus,
  OnboardingTaskStatus,
  Prisma,
  ResignationStatus,
  RoleCode,
  WorkflowType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { WorkflowService } from '../workflow/workflow.service';
import { StorageService } from '../documents/storage.service';
import {
  AllocateAssetDto,
  ReturnAssetDto,
  ClearanceStepDto,
  CreateAssetDto,
  DamageChargeDto,
  ExitInterviewDto,
  ResignDto,
  ReviewResignationDto,
  UpdateOnboardingTaskDto,
} from './dto/lifecycle.dto';

const ONBOARDING_TASKS = [
  { code: 'REGISTRATION', title: 'Employee registration complete', sortOrder: 1 },
  { code: 'DOCUMENTS', title: 'KYC / documents collected', sortOrder: 2 },
  { code: 'ACCOUNT', title: 'User account created', sortOrder: 3 },
  { code: 'WELCOME_EMAIL', title: 'Welcome email sent', sortOrder: 4 },
  { code: 'ASSET_ASSIGNMENT', title: 'Assets assigned', sortOrder: 5 },
  { code: 'TRAINING_ASSIGNMENT', title: 'Training assigned', sortOrder: 6 },
];

const CLEARANCE_STEPS = [
  { code: 'HR', title: 'HR clearance', department: 'HR' },
  { code: 'IT', title: 'IT / assets returned', department: 'IT' },
  { code: 'ADMIN', title: 'Finance / loans & ESD', department: 'ADMIN' },
  { code: 'ADMIN', title: 'Admin / access cards', department: 'Admin' },
  { code: 'ADMIN', title: 'Manager handover', department: 'ADMIN' },
];

@Injectable()
export class LifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @Inject(forwardRef(() => WorkflowService))
    private readonly workflow: WorkflowService,
  ) {}

  private isHr(user: AuthUser) {
    return user.roles.some((r) => ([RoleCode.SUPER_ADMIN, RoleCode.HR] as string[]).includes(r));
  }

  private isFinance(user: AuthUser) {
    return user.roles.some((r) =>
      ([RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN] as string[]).includes(r),
    );
  }

  // ---- Onboarding ----
  async startOnboarding(companyId: string, employeeId: string, actorId?: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      include: { user: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const existing = await this.prisma.onboardingChecklist.findUnique({
      where: { employeeId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
    if (existing) return existing;

    const checklist = await this.prisma.onboardingChecklist.create({
      data: {
        companyId,
        employeeId,
        tasks: {
          create: ONBOARDING_TASKS.map((t) => ({
            ...t,
            status:
              t.code === 'REGISTRATION'
                ? OnboardingTaskStatus.DONE
                : t.code === 'ACCOUNT' && emp.user
                  ? OnboardingTaskStatus.DONE
                  : OnboardingTaskStatus.PENDING,
            completedAt:
              t.code === 'REGISTRATION' || (t.code === 'ACCOUNT' && emp.user)
                ? new Date()
                : undefined,
            completedBy: actorId,
            note:
              t.code === 'WELCOME_EMAIL'
                ? 'Queued (console notification stub)'
                : undefined,
          })),
        },
      },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });

    // Mark welcome email task as done with stub note (Module 25 later)
    await this.prisma.onboardingTask.updateMany({
      where: { checklistId: checklist.id, code: 'WELCOME_EMAIL' },
      data: {
        status: OnboardingTaskStatus.DONE,
        completedAt: new Date(),
        note: `Welcome stub for ${emp.email ?? emp.mobile ?? emp.employeeCode}`,
        completedBy: actorId,
      },
    });

    return this.prisma.onboardingChecklist.findUniqueOrThrow({
      where: { id: checklist.id },
      include: { tasks: { orderBy: { sortOrder: 'asc' } }, employee: true },
    });
  }

  async getOnboarding(companyId: string, employeeId: string) {
    const row = await this.prisma.onboardingChecklist.findFirst({
      where: { companyId, employeeId },
      include: {
        tasks: { orderBy: { sortOrder: 'asc' } },
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Onboarding not started');
    return row;
  }

  listOnboarding(companyId: string) {
    return this.prisma.onboardingChecklist.findMany({
      where: { companyId },
      include: {
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true },
        },
        tasks: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  async updateTask(
    user: AuthUser,
    checklistId: string,
    taskId: string,
    dto: UpdateOnboardingTaskDto,
  ) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const checklist = await this.prisma.onboardingChecklist.findFirst({
      where: { id: checklistId, companyId: user.companyId },
      include: { tasks: true },
    });
    if (!checklist) throw new NotFoundException();
    const task = checklist.tasks.find((t) => t.id === taskId);
    if (!task) throw new NotFoundException('Task not found');

    await this.prisma.onboardingTask.update({
      where: { id: taskId },
      data: {
        status: dto.status,
        note: dto.note,
        completedAt: ([OnboardingTaskStatus.DONE, OnboardingTaskStatus.SKIPPED] as OnboardingTaskStatus[]).includes(
          dto.status,
        )
          ? new Date()
          : null,
        completedBy: user.id,
      },
    });

    const fresh = await this.prisma.onboardingChecklist.findUniqueOrThrow({
      where: { id: checklistId },
      include: { tasks: { orderBy: { sortOrder: 'asc' } } },
    });
    const allDone = fresh.tasks.every((t) =>
      ([OnboardingTaskStatus.DONE, OnboardingTaskStatus.SKIPPED] as OnboardingTaskStatus[]).includes(t.status),
    );
    if (allDone && fresh.status !== OnboardingStatus.COMPLETED) {
      await this.prisma.onboardingChecklist.update({
        where: { id: checklistId },
        data: { status: OnboardingStatus.COMPLETED, completedAt: new Date() },
      });
    }
    return this.getOnboarding(user.companyId, checklist.employeeId);
  }

  // ---- Assets ----
  listAssets(companyId: string) {
    return this.prisma.asset.findMany({
      where: { companyId },
      include: {
        allocations: {
          where: { returnedAt: null },
          include: {
            employee: {
              select: { employeeCode: true, firstName: true, lastName: true },
            },
          },
          take: 1,
          orderBy: { allocatedAt: 'desc' },
        },
      },
      orderBy: { assetTag: 'asc' },
    });
  }

  async createAsset(user: AuthUser, dto: CreateAssetDto) {
    if (!this.isHr(user) && !this.isFinance(user)) throw new ForbiddenException();
    return this.prisma.asset.create({
      data: {
        companyId: user.companyId,
        assetTag: dto.assetTag,
        type: dto.type,
        name: dto.name,
        serialNo: dto.serialNo,
        brand: dto.brand,
        model: dto.model,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        purchaseCost: dto.purchaseCost,
        notes: dto.notes,
      },
    });
  }

  async allocate(user: AuthUser, assetId: string, dto: AllocateAssetDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId: user.companyId },
    });
    if (!asset) throw new NotFoundException('Asset not found');
    if (asset.status === AssetStatus.ALLOCATED) {
      throw new BadRequestException('Asset already allocated');
    }
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: user.companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const [allocation] = await this.prisma.$transaction([
      this.prisma.assetAllocation.create({
        data: {
          assetId,
          employeeId: dto.employeeId,
          allocatedBy: user.id,
          expectedReturnAt: dto.expectedReturnAt
            ? new Date(dto.expectedReturnAt)
            : undefined,
        },
      }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: { status: AssetStatus.ALLOCATED },
      }),
    ]);

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.UPDATE,
      entityType: 'Asset',
      entityId: assetId,
      metadata: { event: 'allocated', employeeId: dto.employeeId },
    });
    return allocation;
  }

  async returnAsset(user: AuthUser, assetId: string, dto: ReturnAssetDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId: user.companyId },
      include: {
        allocations: { where: { returnedAt: null }, orderBy: { allocatedAt: 'desc' }, take: 1 },
      },
    });
    if (!asset) throw new NotFoundException();
    const open = asset.allocations[0];
    if (!open) throw new BadRequestException('No open allocation');

    await this.prisma.$transaction([
      this.prisma.assetAllocation.update({
        where: { id: open.id },
        data: {
          returnedAt: new Date(),
          returnCondition: dto.returnCondition,
          returnNote: dto.returnNote,
          returnedBy: user.id,
        },
      }),
      this.prisma.asset.update({
        where: { id: assetId },
        data: {
          status:
            dto.returnCondition?.toLowerCase() === 'damaged'
              ? AssetStatus.DAMAGED
              : AssetStatus.AVAILABLE,
        },
      }),
    ]);
    return this.prisma.asset.findUnique({
      where: { id: assetId },
      include: { allocations: { orderBy: { allocatedAt: 'desc' }, take: 5 } },
    });
  }

  async damageCharge(user: AuthUser, assetId: string, dto: DamageChargeDto) {
    if (!this.isHr(user) && !this.isFinance(user)) throw new ForbiddenException();
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, companyId: user.companyId },
      include: {
        allocations: { orderBy: { allocatedAt: 'desc' }, take: 1 },
      },
    });
    if (!asset) throw new NotFoundException();
    const employeeId =
      dto.employeeId ?? asset.allocations[0]?.employeeId;
    if (!employeeId) throw new BadRequestException('employeeId required');

    return this.prisma.assetDamageCharge.create({
      data: {
        companyId: user.companyId,
        assetId,
        employeeId,
        amount: dto.amount,
        description: dto.description,
        createdBy: user.id,
      },
    });
  }

  myAssets(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException();
    return this.prisma.assetAllocation.findMany({
      where: { employeeId: user.employeeId, returnedAt: null },
      include: { asset: true },
      orderBy: { allocatedAt: 'desc' },
    });
  }

  // ---- Exit / F&F ----
  async resign(user: AuthUser, dto: ResignDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    const open = await this.prisma.resignation.findFirst({
      where: {
        employeeId: user.employeeId,
        status: { in: [ResignationStatus.PENDING, ResignationStatus.APPROVED] },
      },
    });
    if (open) throw new BadRequestException('Active resignation already exists');

    const row = await this.prisma.resignation.create({
      data: {
        companyId: user.companyId,
        employeeId: user.employeeId,
        lastWorkingDay: new Date(dto.lastWorkingDay),
        noticeDays: dto.noticeDays ?? 30,
        reason: dto.reason,
        resignedAt: dto.resignedAt ? new Date(dto.resignedAt) : new Date(),
      },
    });
    try {
      await this.workflow.startInstance({
        companyId: user.companyId,
        type: WorkflowType.RESIGNATION,
        entityType: 'Resignation',
        entityId: row.id,
        requesterId: user.employeeId,
        summary: `LWD ${dto.lastWorkingDay}`,
      });
    } catch {
      // non-fatal
    }
    return row;
  }

  listResignations(companyId: string) {
    return this.prisma.resignation.findMany({
      where: { companyId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: true,
            designation: true,
            joinedAt: true,
            email: true,
            documents: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
        clearance: true,
        fnf: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getResignation(companyId: string, id: string) {
    const row = await this.prisma.resignation.findFirst({
      where: { id, companyId },
      include: {
        employee: {
          include: {
            documents: {
              where: { deletedAt: null },
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
          },
        },
        clearance: { orderBy: { code: 'asc' } },
        fnf: true,
      },
    });
    if (!row) throw new NotFoundException();
    return row;
  }

  async uploadExitDocument(
    user: AuthUser,
    resignationId: string,
    file: Express.Multer.File | undefined,
    type?: string,
  ) {
    if (!this.isHr(user)) throw new ForbiddenException();
    if (!file) throw new BadRequestException('File is required');
    const resignation = await this.getResignation(user.companyId, resignationId);

    let docType = await this.prisma.documentType.findUnique({
      where: {
        companyId_code: { companyId: user.companyId, code: DocumentTypeCode.CUSTOM },
      },
    });
    if (!docType) {
      docType = await this.prisma.documentType.create({
        data: {
          companyId: user.companyId,
          code: DocumentTypeCode.CUSTOM,
          name: 'Custom',
          isSystem: true,
        },
      });
    }

    const saved = await this.storage.saveLocal(
      user.companyId,
      resignation.employeeId,
      file.originalname,
      file.buffer,
    );
    const title =
      type === 'leaving_letter' ? 'Leaving Letter' : type === 'exit_document' ? 'Exit Document' : file.originalname;
    const doc = await this.prisma.employeeDocument.create({
      data: {
        companyId: user.companyId,
        employeeId: resignation.employeeId,
        documentTypeId: docType.id,
        title,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey: saved.storageKey,
        storageProvider: saved.storageProvider,
        uploadedBy: user.id,
        notes: `exit:${resignationId}:${type ?? 'document'}`,
      },
    });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'ExitDocument',
      entityId: doc.id,
      metadata: { resignationId, employeeId: resignation.employeeId, type: type ?? 'document' },
    });

    return doc;
  }

  async reviewResignation(user: AuthUser, id: string, dto: ReviewResignationDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const res = await this.getResignation(user.companyId, id);
    if (res.status !== ResignationStatus.PENDING) {
      throw new BadRequestException('Not pending');
    }

    if (dto.status === ResignationStatus.REJECTED) {
      const rejected = await this.prisma.resignation.update({
        where: { id },
        data: {
          status: ResignationStatus.REJECTED,
          approvedBy: user.id,
          approvedAt: new Date(),
        },
      });
      await this.workflow.syncFromLegacy({
        companyId: user.companyId,
        entityType: 'Resignation',
        entityId: id,
        action: 'REJECT',
        actorId: user.id,
      });
      return rejected;
    }

    if (dto.status !== ResignationStatus.APPROVED) {
      throw new BadRequestException('Use APPROVED or REJECTED');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.resignation.update({
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
            })),
          },
        },
        include: { clearance: true },
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
          reason: 'Resignation approved',
          changedBy: user.id,
          effectiveAt: new Date(),
        },
      });
      return r;
    });

    await this.workflow.syncFromLegacy({
      companyId: user.companyId,
      entityType: 'Resignation',
      entityId: id,
      action: 'APPROVE',
      actorId: user.id,
    });

    return updated;
  }

  async clearanceStep(
    user: AuthUser,
    resignationId: string,
    stepCode: string,
    dto: ClearanceStepDto,
  ) {
    if (!this.isHr(user) && !this.isFinance(user)) throw new ForbiddenException();
    const res = await this.getResignation(user.companyId, resignationId);
    const item = res.clearance.find((c) => c.code === stepCode);
    if (!item) throw new NotFoundException('Clearance step not found');

    await this.prisma.exitClearanceItem.update({
      where: { id: item.id },
      data: {
        status: dto.status,
        note: dto.note,
        completedAt: dto.status === ClearanceItemStatus.DONE ? new Date() : null,
        completedBy: user.id,
      },
    });
    return this.getResignation(user.companyId, resignationId);
  }

  async exitInterview(user: AuthUser, id: string, dto: ExitInterviewDto) {
    const res = await this.getResignation(user.companyId, id);
    if (
      user.employeeId !== res.employeeId &&
      !this.isHr(user)
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.resignation.update({
      where: { id },
      data: { exitInterview: dto.answers as Prisma.InputJsonValue },
    });
  }

  async generateFnf(user: AuthUser, resignationId: string) {
    if (!this.isFinance(user)) throw new ForbiddenException();
    const res = await this.getResignation(user.companyId, resignationId);
    if (res.status !== ResignationStatus.APPROVED) {
      throw new BadRequestException('Resignation must be approved');
    }
    const uncleared = res.clearance.filter((c) => c.status !== ClearanceItemStatus.DONE);
    if (uncleared.length) {
      throw new BadRequestException(
        `Clearance incomplete: ${uncleared.map((c) => c.code).join(', ')}`,
      );
    }

    const empId = res.employeeId;
    const structure = await this.prisma.employeeSalaryStructure.findFirst({
      where: { employeeId: empId, isActive: true },
      include: { lines: { include: { component: true } } },
    });
    const monthlyGross =
      structure?.lines
        .filter((l) => l.component.type === 'EARNING')
        .reduce((s, l) => s + l.amount, 0) ?? 0;

    // Pending salary: half-month proxy (config-free MVP)
    const pendingSalary = Math.round((monthlyGross / 2) * 100) / 100;

    const year = new Date().getFullYear();
    const leaveBalances = await this.prisma.leaveBalance.findMany({
      where: { employeeId: empId, year },
      include: { leaveType: true },
    });
    const encashable = leaveBalances
      .filter((b) => b.leaveType.code === 'EL')
      .reduce((s, b) => s + (b.opening + b.accrued + b.carriedForward + b.adjusted - b.used - b.encashed), 0);
    const perDay = monthlyGross / 30;
    const leaveEncash = Math.round(encashable * perDay * 100) / 100;

    const esdLast = await this.prisma.esdLedgerEntry.findFirst({
      where: { employeeId: empId },
      orderBy: { createdAt: 'desc' },
    });
    const esdRefund = esdLast?.balanceAfter ?? 0;

    const loans = await this.prisma.loanAdvance.findMany({
      where: { employeeId: empId, status: LoanAdvanceStatus.ACTIVE },
    });
    const loanOutstanding = loans.reduce((s, l) => s + l.outstanding, 0);

    const damages = await this.prisma.assetDamageCharge.findMany({
      where: { employeeId: empId, status: DamageChargeStatus.PENDING },
    });
    const damageTotal = damages.reduce((s, d) => s + d.amount, 0);

    type Line = { code: string; name: string; side: 'CREDIT' | 'DEBIT'; amount: number };
    const lines: Line[] = [];
    if (pendingSalary > 0) {
      lines.push({ code: 'PENDING_SALARY', name: 'Pending salary (pro-rata)', side: 'CREDIT', amount: pendingSalary });
    }
    if (leaveEncash > 0) {
      lines.push({ code: 'LEAVE_ENCASH', name: 'Leave encashment', side: 'CREDIT', amount: leaveEncash });
    }
    if (esdRefund > 0) {
      lines.push({ code: 'ESD_REFUND', name: 'ESD refund', side: 'CREDIT', amount: esdRefund });
    }
    if (loanOutstanding > 0) {
      lines.push({ code: 'LOAN_OS', name: 'Loan/advance outstanding', side: 'DEBIT', amount: loanOutstanding });
    }
    if (damageTotal > 0) {
      lines.push({ code: 'ASSET_DAMAGE', name: 'Asset damage charges', side: 'DEBIT', amount: damageTotal });
    }

    const grossCredits = lines.filter((l) => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0);
    const grossDebits = lines.filter((l) => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0);
    const netPayable = Math.round((grossCredits - grossDebits) * 100) / 100;

    const emp = res.employee;
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
    });
    const lwd = res.lastWorkingDay.toISOString().slice(0, 10);
    const joined = emp.joinedAt?.toISOString().slice(0, 10) ?? 'N/A';
    const fullName = `${emp.firstName} ${emp.lastName ?? ''}`.trim();

    const experienceLetter = [
      company.name,
      '',
      'EXPERIENCE CERTIFICATE',
      '',
      `This is to certify that ${fullName} (Emp Code: ${emp.employeeCode})`,
      `worked with us from ${joined} to ${lwd} as ${emp.designation ?? 'Employee'}`,
      `in the ${emp.department ?? 'organization'} department.`,
      '',
      'We wish them success in future endeavors.',
      '',
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      'Authorized Signatory',
    ].join('\n');

    const relievingLetter = [
      company.name,
      '',
      'RELIEVING LETTER',
      '',
      `This is to confirm that ${fullName} (${emp.employeeCode}) has been relieved`,
      `from duties effective ${lwd} after completion of exit formalities.`,
      '',
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      'HR Department',
    ].join('\n');

    const existing = await this.prisma.fnfSettlement.findUnique({
      where: { resignationId },
    });

    const data = {
      companyId: user.companyId,
      employeeId: empId,
      linesJson: lines,
      grossCredits,
      grossDebits,
      netPayable,
      generatedAt: new Date(),
      status: FnfStatus.DRAFT,
      experienceLetter,
      relievingLetter,
    };

    if (existing && existing.status !== FnfStatus.DRAFT) {
      throw new BadRequestException('F&F already finalized');
    }

    const fnf = existing
      ? await this.prisma.fnfSettlement.update({ where: { id: existing.id }, data })
      : await this.prisma.fnfSettlement.create({
          data: { ...data, resignationId },
        });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.CREATE,
      entityType: 'FnfSettlement',
      entityId: fnf.id,
    });

    return fnf;
  }

  async finalizeFnf(user: AuthUser, resignationId: string) {
    if (!this.isFinance(user)) throw new ForbiddenException();
    const fnf = await this.prisma.fnfSettlement.findFirst({
      where: { resignationId, companyId: user.companyId },
    });
    if (!fnf) throw new NotFoundException('Generate F&F first');
    if (fnf.status !== FnfStatus.DRAFT) throw new BadRequestException('Already finalized');

    const res = await this.getResignation(user.companyId, resignationId);

    await this.prisma.$transaction(async (tx) => {
      await tx.fnfSettlement.update({
        where: { id: fnf.id },
        data: {
          status: FnfStatus.FINALIZED,
          finalizedAt: new Date(),
          finalizedBy: user.id,
        },
      });
      await tx.employee.update({
        where: { id: res.employeeId },
        data: {
          status: EmploymentStatus.RESIGNED,
          isActive: false,
          exitAt: res.lastWorkingDay,
        },
      });
      await tx.employeeStatusHistory.create({
        data: {
          employeeId: res.employeeId,
          fromStatus: EmploymentStatus.NOTICE,
          toStatus: EmploymentStatus.RESIGNED,
          reason: 'F&F finalized',
          changedBy: user.id,
          effectiveAt: new Date(),
        },
      });

      // Close loans & write ESD refund ledger
      const loans = await tx.loanAdvance.findMany({
        where: { employeeId: res.employeeId, status: LoanAdvanceStatus.ACTIVE },
      });
      for (const loan of loans) {
        await tx.loanAdvance.update({
          where: { id: loan.id },
          data: { outstanding: 0, status: LoanAdvanceStatus.CLOSED },
        });
      }

      const esdLast = await tx.esdLedgerEntry.findFirst({
        where: { employeeId: res.employeeId },
        orderBy: { createdAt: 'desc' },
      });
      if (esdLast && esdLast.balanceAfter > 0) {
        await tx.esdLedgerEntry.create({
          data: {
            companyId: user.companyId,
            employeeId: res.employeeId,
            entryType: EsdEntryType.REFUND,
            amount: -esdLast.balanceAfter,
            balanceAfter: 0,
            year: new Date().getFullYear(),
            month: new Date().getMonth() + 1,
            note: 'F&F ESD refund',
            createdBy: user.id,
          },
        });
      }

      await tx.assetDamageCharge.updateMany({
        where: { employeeId: res.employeeId, status: DamageChargeStatus.PENDING },
        data: { status: DamageChargeStatus.DEDUCTED },
      });
    });

    return this.getResignation(user.companyId, resignationId);
  }

  async letter(user: AuthUser, resignationId: string, kind: 'experience' | 'relieving') {
    const res = await this.getResignation(user.companyId, resignationId);
    if (
      user.employeeId !== res.employeeId &&
      !this.isHr(user) &&
      !this.isFinance(user)
    ) {
      throw new ForbiddenException();
    }
    if (!res.fnf) throw new NotFoundException('Generate F&F first');
    return {
      kind,
      text: kind === 'experience' ? res.fnf.experienceLetter : res.fnf.relievingLetter,
    };
  }
}
