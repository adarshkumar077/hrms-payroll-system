import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, ShiftChangeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  AssignShiftDto,
  BulkAssignShiftDto,
  CreateShiftDto,
  ReviewShiftChangeDto,
  ShiftChangeRequestDto,
  UpdateShiftDto,
} from './dto/shift.dto';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listShifts(companyId: string) {
    return this.prisma.shift.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
  }

  async createShift(companyId: string, actorId: string, dto: CreateShiftDto) {
    const shift = await this.prisma.shift.create({
      data: {
        companyId,
        code: dto.code,
        name: dto.name,
        startTime: dto.startTime,
        endTime: dto.endTime,
        breakMinutes: dto.breakMinutes ?? 0,
        graceMinutes: dto.graceMinutes,
        isOvernight: dto.isOvernight ?? false,
        overtimeAfterMinutes: dto.overtimeAfterMinutes,
      },
    });
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.CREATE,
      entityType: 'Shift',
      entityId: shift.id,
    });
    return shift;
  }

  async updateShift(companyId: string, actorId: string, id: string, dto: UpdateShiftDto) {
    const existing = await this.prisma.shift.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Shift not found');
    const shift = await this.prisma.shift.update({ where: { id }, data: dto });
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'Shift',
      entityId: id,
    });
    return shift;
  }

  async roster(companyId: string, from: string, to: string) {
    return this.prisma.shiftAssignment.findMany({
      where: {
        companyId,
        date: { gte: new Date(from), lte: new Date(to) },
      },
      include: {
        shift: true,
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true },
        },
      },
      orderBy: [{ date: 'asc' }, { employeeId: 'asc' }],
    });
  }

  async assign(companyId: string, actorId: string, dto: AssignShiftDto) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: dto.shiftId, companyId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const row = await this.prisma.shiftAssignment.upsert({
      where: {
        employeeId_date: { employeeId: dto.employeeId, date: new Date(dto.date) },
      },
      create: {
        companyId,
        employeeId: dto.employeeId,
        shiftId: dto.shiftId,
        date: new Date(dto.date),
        notes: dto.notes,
      },
      update: { shiftId: dto.shiftId, notes: dto.notes },
      include: { shift: true, employee: true },
    });
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'ShiftAssignment',
      entityId: row.id,
    });
    return row;
  }

  async bulkAssign(companyId: string, actorId: string, dto: BulkAssignShiftDto) {
    const results = [];
    for (const employeeId of dto.employeeIds ?? []) {
      results.push(
        await this.assign(companyId, actorId, {
          employeeId,
          shiftId: dto.shiftId,
          date: dto.date,
        }),
      );
    }
    return results;
  }

  async myShift(user: AuthUser, date?: string) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    const d = date ? new Date(date) : new Date();
    const day = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    return this.prisma.shiftAssignment.findUnique({
      where: { employeeId_date: { employeeId: user.employeeId, date: day } },
      include: { shift: true },
    });
  }

  async requestChange(user: AuthUser, dto: ShiftChangeRequestDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    const day = new Date(dto.date);
    const current = await this.prisma.shiftAssignment.findUnique({
      where: { employeeId_date: { employeeId: user.employeeId, date: day } },
    });
    const toShift = await this.prisma.shift.findFirst({
      where: { id: dto.toShiftId, companyId: user.companyId, isActive: true },
    });
    if (!toShift) throw new NotFoundException('Target shift not found');

    return this.prisma.shiftChangeRequest.create({
      data: {
        companyId: user.companyId,
        employeeId: user.employeeId,
        date: day,
        fromShiftId: current?.shiftId,
        toShiftId: dto.toShiftId,
        reason: dto.reason,
      },
      include: { toShift: true, fromShift: true },
    });
  }

  listChangeRequests(companyId: string, status?: ShiftChangeStatus) {
    return this.prisma.shiftChangeRequest.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      include: {
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        fromShift: true,
        toShift: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewChange(user: AuthUser, id: string, dto: ReviewShiftChangeDto) {
    const req = await this.prisma.shiftChangeRequest.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== ShiftChangeStatus.PENDING) {
      throw new BadRequestException('Request already reviewed');
    }
    if (dto.status !== 'APPROVED' && dto.status !== 'REJECTED') {
      throw new BadRequestException('Invalid status');
    }

    const status =
      dto.status === 'APPROVED' ? ShiftChangeStatus.APPROVED : ShiftChangeStatus.REJECTED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shiftChangeRequest.update({
        where: { id },
        data: {
          status,
          reviewedBy: user.employeeId,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote,
        },
        include: { toShift: true, employee: true },
      });

      if (status === ShiftChangeStatus.APPROVED) {
        await tx.shiftAssignment.upsert({
          where: {
            employeeId_date: { employeeId: req.employeeId, date: req.date },
          },
          create: {
            companyId: req.companyId,
            employeeId: req.employeeId,
            shiftId: req.toShiftId,
            date: req.date,
          },
          update: { shiftId: req.toShiftId },
        });
      }
      return updated;
    });
  }

  async ensureDefaultShifts(companyId: string) {
    const count = await this.prisma.shift.count({ where: { companyId } });
    if (count > 0) return this.listShifts(companyId);
    await this.prisma.shift.createMany({
      data: [
        {
          companyId,
          code: 'GEN',
          name: 'General',
          startTime: '09:30',
          endTime: '18:30',
          breakMinutes: 60,
          graceMinutes: 15,
        },
        {
          companyId,
          code: 'MOR',
          name: 'Morning',
          startTime: '06:00',
          endTime: '14:00',
          breakMinutes: 30,
        },
        {
          companyId,
          code: 'EVE',
          name: 'Evening',
          startTime: '14:00',
          endTime: '22:00',
          breakMinutes: 30,
        },
      ],
    });
    return this.listShifts(companyId);
  }
}
