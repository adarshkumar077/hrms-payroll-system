import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, HolidayScope, HolidayType, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateHolidayDto,
  HolidayImportDto,
  QuickAttendanceDto,
  UpdateHolidayDto,
} from './dto/holiday.dto';
import {
  LAST_SATURDAY_OVERRIDE_TAG,
  WORKING_DAY_TAG,
  mapQuickActionStatus,
  toDateKey,
} from '../attendance/attendance-calendar';
import { AuthUser } from '../auth/decorators/current-user.decorator';

@Injectable()
export class HolidaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    companyId: string,
    opts?: { year?: number; month?: number; status?: string; paid?: string; q?: string },
  ) {
    const y = opts?.year ?? new Date().getFullYear();
    const from = new Date(Date.UTC(y, 0, 1));
    const to = new Date(Date.UTC(y, 11, 31));

    const rows = await this.prisma.holiday.findMany({
      where: {
        companyId,
        OR: [{ date: { gte: from, lte: to } }, { repeatYearly: true }],
      },
      orderBy: { date: 'asc' },
    });

    const actorIds = [...new Set(rows.map((r) => r.createdById).filter(Boolean))] as string[];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true, email: true },
        })
      : [];
    const actorById = new Map(actors.map((a) => [a.id, a]));

    let mapped = rows.map((h) => {
      const actor = h.createdById ? actorById.get(h.createdById) : null;
      return {
        ...h,
        date: toDateKey(h.date),
        payment: h.isPaid ? 'Paid' : 'Unpaid',
        statusLabel: this.statusLabel(h.dayStatus, h.type, h.systemTag),
        createdByName: actor?.displayName || actor?.email || '—',
        createdById: h.createdById,
      };
    });

    if (opts?.month) {
      mapped = mapped.filter((h) => {
        const key = toDateKey(h.date);
        const m = Number(key.slice(5, 7));
        if (m === opts.month && (key.startsWith(`${y}-`) || h.repeatYearly)) return true;
        return false;
      });
    }
    if (opts?.status) {
      const s = opts.status.toUpperCase();
      mapped = mapped.filter((h) => {
        const label = String(h.statusLabel).toUpperCase();
        const ds = (h.dayStatus ?? '').toUpperCase();
        return label.includes(s) || ds === s || h.type === s;
      });
    }
    if (opts?.paid === 'Paid' || opts?.paid === 'paid') {
      mapped = mapped.filter((h) => h.isPaid);
    } else if (opts?.paid === 'Unpaid' || opts?.paid === 'unpaid') {
      mapped = mapped.filter((h) => !h.isPaid);
    }
    if (opts?.q?.trim()) {
      const q = opts.q.trim().toLowerCase();
      mapped = mapped.filter((h) => h.name.toLowerCase().includes(q));
    }

    return mapped;
  }

  private statusLabel(dayStatus: string | null, type: string, systemTag: string | null) {
    if (systemTag === WORKING_DAY_TAG || dayStatus === 'WORK') return 'Working Day';
    if (dayStatus === 'WO') return 'Weekly Off (WO)';
    if (dayStatus === 'HD') return 'Half Day (HD)';
    if (type === 'FESTIVAL') return 'Festival Holiday';
    if (type === 'OFFICE') return 'Office Holiday';
    if (dayStatus === 'PH' || type === 'NATIONAL') return 'Paid Holiday (PH)';
    return dayStatus || type;
  }

  private async clearOtherLastSaturdayOverrides(
    companyId: string,
    year: number,
    month: number,
    exceptId?: string,
  ) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    await this.prisma.holiday.updateMany({
      where: {
        companyId,
        systemTag: LAST_SATURDAY_OVERRIDE_TAG,
        date: { gte: from, lte: to },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { systemTag: null },
    });
  }

  private async writeAudit(opts: {
    companyId: string;
    actorId: string;
    action: AuditAction;
    entityId: string;
    oldValue?: unknown;
    newValue?: unknown;
  }) {
    const actor = await this.prisma.user.findFirst({
      where: { id: opts.actorId },
      select: {
        displayName: true,
        email: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });
    await this.audit.log({
      companyId: opts.companyId,
      actorId: opts.actorId,
      action: opts.action,
      entityType: 'Holiday',
      entityId: opts.entityId,
      metadata: {
        userName: actor?.displayName || actor?.email || opts.actorId,
        role: actor?.userRoles?.map((r) => r.role.code).join(',') ?? '',
        oldValue: opts.oldValue ?? null,
        newValue: opts.newValue ?? null,
        at: new Date().toISOString(),
      },
    });
  }

  async create(companyId: string, actorId: string, dto: CreateHolidayDto) {
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid holiday date');

    let systemTag: string | null = null;
    if (dto.lastSaturdayOverride) {
      systemTag = LAST_SATURDAY_OVERRIDE_TAG;
      await this.clearOtherLastSaturdayOverrides(
        companyId,
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
      );
    }

    const holiday = await this.prisma.holiday.create({
      data: {
        companyId,
        name: dto.name,
        date,
        type: dto.type,
        scope: dto.scope,
        isOptional: dto.isOptional ?? false,
        isPaid: dto.isPaid ?? true,
        systemTag,
        dayStatus: dto.dayStatus ?? 'PH',
        repeatYearly: dto.repeatYearly ?? false,
        createdById: actorId,
        departments: dto.departments ?? [],
        employeeIds: dto.employeeIds ?? [],
        notes: dto.notes,
      },
    });
    await this.writeAudit({
      companyId,
      actorId,
      action: AuditAction.CREATE,
      entityId: holiday.id,
      newValue: holiday,
    });
    return holiday;
  }

  async update(companyId: string, actorId: string, id: string, dto: UpdateHolidayDto) {
    const existing = await this.prisma.holiday.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Holiday not found');

    const nextDate = dto.date ? new Date(dto.date) : existing.date;
    let systemTag = existing.systemTag;
    if (dto.lastSaturdayOverride === true) {
      systemTag = LAST_SATURDAY_OVERRIDE_TAG;
      await this.clearOtherLastSaturdayOverrides(
        companyId,
        nextDate.getUTCFullYear(),
        nextDate.getUTCMonth() + 1,
        id,
      );
    } else if (dto.lastSaturdayOverride === false && systemTag === LAST_SATURDAY_OVERRIDE_TAG) {
      systemTag = null;
    }

    const holiday = await this.prisma.holiday.update({
      where: { id },
      data: {
        name: dto.name,
        date: dto.date ? nextDate : undefined,
        type: dto.type,
        scope: dto.scope,
        isOptional: dto.isOptional,
        isPaid: dto.isPaid,
        systemTag,
        dayStatus: dto.dayStatus,
        repeatYearly: dto.repeatYearly,
        departments: dto.departments,
        employeeIds: dto.employeeIds,
        notes: dto.notes,
      },
    });
    await this.writeAudit({
      companyId,
      actorId,
      action: AuditAction.UPDATE,
      entityId: id,
      oldValue: existing,
      newValue: holiday,
    });
    return holiday;
  }

  async remove(companyId: string, actorId: string, id: string) {
    const existing = await this.prisma.holiday.findFirst({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Holiday not found');
    await this.prisma.holiday.delete({ where: { id } });
    await this.writeAudit({
      companyId,
      actorId,
      action: AuditAction.DELETE,
      entityId: id,
      oldValue: existing,
    });
    return { message: 'Holiday deleted' };
  }

  /** Upsert from Attendance Sheet Quick Action Bar */
  async quickUpsert(companyId: string, actorId: string, dto: QuickAttendanceDto) {
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Title is required');
    const date = new Date(dto.date);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');

    const mapped = mapQuickActionStatus(dto.status);
    // WO / Festival / Office / PH default Paid; HD/WORK still honor dropdown.
    const defaultPaid =
      mapped.dayStatus === 'WO' ||
      mapped.dayStatus === 'PH' ||
      mapped.type === 'FESTIVAL' ||
      mapped.type === 'OFFICE' ||
      mapped.type === 'NATIONAL';
    const isPaid = dto.payment
      ? /^paid$/i.test(dto.payment)
      : defaultPaid;
    const repeatYearly = /^yearly$/i.test(dto.repeat ?? 'ONE_TIME');

    let systemTag: string | null = mapped.systemTag;
    // Weekly off on last Saturday → mark as override so paid flag applies
    if (mapped.dayStatus === 'WO') {
      const lastSat = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
      const dow = lastSat.getUTCDay();
      const daysBack = (dow - 6 + 7) % 7;
      const lastSatDate = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), lastSat.getUTCDate() - daysBack),
      );
      if (toDateKey(lastSatDate) === toDateKey(date)) {
        systemTag = LAST_SATURDAY_OVERRIDE_TAG;
        await this.clearOtherLastSaturdayOverrides(
          companyId,
          date.getUTCFullYear(),
          date.getUTCMonth() + 1,
          dto.id,
        );
      }
    }

    const existing = dto.id
      ? await this.prisma.holiday.findFirst({ where: { id: dto.id, companyId } })
      : await this.prisma.holiday.findFirst({
          where: { companyId, date },
          orderBy: { createdAt: 'desc' },
        });

    const data = {
      name: title,
      date,
      type: mapped.type as HolidayType,
      scope: HolidayScope.ALL,
      isPaid,
      dayStatus: mapped.dayStatus,
      systemTag,
      repeatYearly,
      createdById: actorId,
    };

    if (existing) {
      const holiday = await this.prisma.holiday.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          date: data.date,
          type: data.type,
          isPaid: data.isPaid,
          dayStatus: data.dayStatus,
          systemTag: data.systemTag,
          repeatYearly: data.repeatYearly,
        },
      });
      await this.writeAudit({
        companyId,
        actorId,
        action: AuditAction.UPDATE,
        entityId: holiday.id,
        oldValue: existing,
        newValue: holiday,
      });
      return { holiday, created: false, message: 'Attendance entry saved successfully.' };
    }

    const holiday = await this.prisma.holiday.create({
      data: { companyId, ...data },
    });
    await this.writeAudit({
      companyId,
      actorId,
      action: AuditAction.CREATE,
      entityId: holiday.id,
      newValue: holiday,
    });
    return { holiday, created: true, message: 'Attendance entry saved successfully.' };
  }

  async importRows(companyId: string, actorId: string, dto: HolidayImportDto) {
    if (!dto.rows?.length) throw new BadRequestException('No rows to import');
    const results: { date: string; title: string; ok: boolean; error?: string }[] = [];
    for (const row of dto.rows) {
      try {
        await this.quickUpsert(companyId, actorId, {
          date: row.date,
          title: row.title,
          status: row.status,
          payment: row.payment,
          repeat: row.repeat,
        });
        results.push({ date: row.date, title: row.title, ok: true });
      } catch (e) {
        results.push({
          date: row.date,
          title: row.title,
          ok: false,
          error: e instanceof Error ? e.message : 'Failed',
        });
      }
    }
    return {
      message: 'Attendance entry saved successfully.',
      imported: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async auditTrail(user: AuthUser, limit = 100) {
    if (!user.roles.includes(RoleCode.SUPER_ADMIN)) {
      throw new ForbiddenException('Only Super Admin can view the full holiday audit log');
    }
    const logs = await this.prisma.auditLog.findMany({
      where: { companyId: user.companyId, entityType: 'Holiday' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
    return logs.map((l) => {
      const meta = (l.metadata ?? {}) as Record<string, unknown>;
      return {
        id: l.id,
        action: l.action,
        entityId: l.entityId,
        userName: meta.userName ?? l.actorId,
        role: meta.role ?? '',
        date: l.createdAt.toISOString().slice(0, 10),
        time: l.createdAt.toISOString().slice(11, 19),
        oldValue: meta.oldValue ?? null,
        newValue: meta.newValue ?? null,
        createdAt: l.createdAt,
      };
    });
  }

  async calendarForEmployee(companyId: string, employeeId: string, year?: number) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const holidays = await this.list(companyId, { year });
    const applicable = holidays.filter((h) => {
      if (h.scope === HolidayScope.ALL) return true;
      if (h.scope === HolidayScope.DEPARTMENT) {
        return !!emp.department && h.departments.includes(emp.department);
      }
      return h.employeeIds.includes(employeeId);
    });

    return {
      holidays: applicable,
      weeklyOffDays: [0],
      paidSaturday: true,
      sundayPaidWeeklyOff: true,
      lastSaturdayPaidWeeklyOff: true,
    };
  }
}
