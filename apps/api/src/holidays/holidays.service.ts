import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, HolidayScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateHolidayDto, UpdateHolidayDto } from './dto/holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, year?: number) {
    const y = year ?? new Date().getFullYear();
    const from = new Date(Date.UTC(y, 0, 1));
    const to = new Date(Date.UTC(y, 11, 31));
    return this.prisma.holiday.findMany({
      where: { companyId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
  }

  async create(companyId: string, actorId: string, dto: CreateHolidayDto) {
    const holiday = await this.prisma.holiday.create({
      data: {
        companyId,
        name: dto.name,
        date: new Date(dto.date),
        type: dto.type,
        scope: dto.scope,
        isOptional: dto.isOptional,
        isPaid: dto.isPaid,
        departments: dto.departments ?? [],
        employeeIds: dto.employeeIds ?? [],
        notes: dto.notes,
      },
    });
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.CREATE,
      entityType: 'Holiday',
      entityId: holiday.id,
    });
    return holiday;
  }

  async update(companyId: string, actorId: string, id: string, dto: UpdateHolidayDto) {
    const existing = await this.prisma.holiday.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Holiday not found');
    const holiday = await this.prisma.holiday.update({
      where: { id },
      data: {
        name: dto.name,
        date: dto.date ? new Date(dto.date) : undefined,
        type: dto.type,
        scope: dto.scope,
        isOptional: dto.isOptional,
        isPaid: dto.isPaid,
        departments: dto.departments,
        employeeIds: dto.employeeIds,
        notes: dto.notes,
      },
    });
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'Holiday',
      entityId: id,
    });
    return holiday;
  }

  async remove(companyId: string, actorId: string, id: string) {
    const existing = await this.prisma.holiday.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Holiday not found');
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit.log({
      companyId,
      actorId,
      action: AuditAction.DELETE,
      entityType: 'Holiday',
      entityId: id,
    });
    return { message: 'Holiday deleted' };
  }

  async calendarForEmployee(companyId: string, employeeId: string, year?: number) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const holidays = await this.list(companyId, year);
    const applicable = holidays.filter((h) => {
      if (h.scope === HolidayScope.ALL) return true;
      if (h.scope === HolidayScope.DEPARTMENT) {
        return !!emp.department && h.departments.includes(emp.department);
      }
      return h.employeeIds.includes(employeeId);
    });

    const weeklyOffSetting = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key: 'weekly_off.days' } },
    });
    const paidSat = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key: 'weekly_off.paid_saturday' } },
    });

    return {
      holidays: applicable,
      weeklyOffDays: (weeklyOffSetting?.value as number[]) ?? [0],
      paidSaturday: Boolean(paidSat?.value),
    };
  }
}
