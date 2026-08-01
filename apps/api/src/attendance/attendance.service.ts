import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceDayStatus,
  AttendanceMethod,
  AuditAction,
  RoleCode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import {
  BiometricWebhookDto,
  CorrectAttendanceDto,
  MarkAttendanceDto,
} from './dto/attendance.dto';

function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseHm(hm: string, on: Date) {
  const [h, m] = hm.split(':').map(Number);
  const x = new Date(on);
  x.setHours(h || 0, m || 0, 0, 0);
  return x;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async setting<T>(companyId: string, key: string, fallback: T): Promise<T> {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    return (row?.value as T) ?? fallback;
  }

  private isHr(user: AuthUser) {
    const allowed: string[] = [RoleCode.CEO, RoleCode.HR, RoleCode.MANAGER, RoleCode.ADMIN];
    return user.roles.some((r) => allowed.includes(r));
  }

  async mark(user: AuthUser, dto: MarkAttendanceDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    return this.markForEmployee(user.companyId, user.employeeId, dto, user.id);
  }

  async markForEmployee(
    companyId: string,
    employeeId: string,
    dto: MarkAttendanceDto,
    actorId?: string,
  ) {
    const methods = await this.setting<string[]>(companyId, 'attendance.methods_enabled', [
      'MANUAL',
      'WEB',
    ]);
    if (!methods.includes(dto.method) && dto.method !== AttendanceMethod.BIOMETRIC) {
      throw new BadRequestException(`Method ${dto.method} is not enabled`);
    }

    if (dto.method === AttendanceMethod.GEOFENCE || dto.method === AttendanceMethod.GPS) {
      if (dto.latitude == null || dto.longitude == null) {
        throw new BadRequestException('GPS coordinates required');
      }
    }

    if (dto.method === AttendanceMethod.GEOFENCE) {
      const lat = await this.setting<number>(companyId, 'attendance.geofence_lat', 0);
      const lng = await this.setting<number>(companyId, 'attendance.geofence_lng', 0);
      const radius = await this.setting<number>(companyId, 'attendance.geofence_radius_m', 200);
      if (lat === 0 && lng === 0) {
        throw new BadRequestException('Geofence not configured in Company Settings');
      }
      const dist = haversineM(dto.latitude!, dto.longitude!, lat, lng);
      if (dist > radius) {
        throw new BadRequestException(`Outside geofence (${Math.round(dist)}m > ${radius}m)`);
      }
    }

    if (dto.method === AttendanceMethod.QR) {
      const secret = await this.setting<string>(companyId, 'attendance.qr_secret', '');
      if (!dto.qrPayload || dto.qrPayload !== secret) {
        throw new BadRequestException('Invalid QR code');
      }
    }

    if (dto.method === AttendanceMethod.SELFIE && !dto.selfieUrl) {
      throw new BadRequestException('Selfie URL required');
    }

    const punchedAt = dto.punchedAt ? new Date(dto.punchedAt) : new Date();
    const day = dateOnly(punchedAt);

    // Holiday / weekly off awareness
    const weeklyOff = await this.setting<number[]>(companyId, 'weekly_off.days', [0]);
    const isWeeklyOff = weeklyOff.includes(punchedAt.getDay());

    let record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
    });

    const punchType =
      dto.punchType ??
      (!record?.checkInAt ? 'IN' : record.checkOutAt ? 'IN' : 'OUT');

    if (punchType === 'IN' && record?.checkInAt && !record.checkOutAt) {
      throw new BadRequestException('Already checked in. Check out first.');
    }

    const workStart = await this.setting<string>(companyId, 'office.work_start', '10:15');
    const grace = await this.setting<number>(companyId, 'office.grace_minutes', 0);
    const lateEnabled = await this.setting<boolean>(companyId, 'attendance.late_mark_enabled', true);

    // Prefer shift start if assigned
    const assignment = await this.prisma.shiftAssignment.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
      include: { shift: true },
    });
    const startHm = assignment?.shift.startTime ?? workStart;
    const shiftGrace = assignment?.shift.graceMinutes ?? grace;
    const expectedStart = parseHm(startHm, punchedAt);
    const graceEnd = new Date(expectedStart.getTime() + shiftGrace * 60_000);

    let isLate = false;
    let lateMinutes = 0;
    if (punchType === 'IN' && lateEnabled && punchedAt > graceEnd && !isWeeklyOff) {
      isLate = true;
      lateMinutes = Math.round((punchedAt.getTime() - expectedStart.getTime()) / 60_000);
    }

    if (!record) {
      record = await this.prisma.attendanceRecord.create({
        data: {
          companyId,
          employeeId,
          date: day,
          status: isWeeklyOff ? AttendanceDayStatus.WO : AttendanceDayStatus.P,
          checkInAt: punchType === 'IN' ? punchedAt : undefined,
          checkOutAt: punchType === 'OUT' ? punchedAt : undefined,
          isLate,
          lateMinutes,
          method: dto.method,
          latitude: dto.latitude,
          longitude: dto.longitude,
          selfieUrl: dto.selfieUrl,
          sourceNote: JSON.stringify({
            address: dto.address ?? null,
            deviceInfo: dto.deviceInfo ?? null,
            accuracyM: dto.accuracyM ?? null,
          }),
        },
      });
    } else {
      const data: Record<string, unknown> = {
        method: dto.method,
        latitude: dto.latitude ?? record.latitude,
        longitude: dto.longitude ?? record.longitude,
        selfieUrl: dto.selfieUrl ?? record.selfieUrl,
        sourceNote: JSON.stringify({
          address: dto.address ?? null,
          deviceInfo: dto.deviceInfo ?? null,
          accuracyM: dto.accuracyM ?? null,
        }),
      };
      if (punchType === 'IN') {
        data.checkInAt = punchedAt;
        data.isLate = isLate;
        data.lateMinutes = lateMinutes;
        if (record.status === AttendanceDayStatus.A) data.status = AttendanceDayStatus.P;
      } else {
        data.checkOutAt = punchedAt;
        if (record.checkInAt) {
          data.workMinutes = Math.round(
            (punchedAt.getTime() - new Date(record.checkInAt).getTime()) / 60_000,
          );
          const halfHours = await this.setting<number>(companyId, 'office.half_day_hours', 4);
          const fullHours = await this.setting<number>(companyId, 'office.full_day_hours', 8);
          const hours = (data.workMinutes as number) / 60;
          if (hours < halfHours) data.status = AttendanceDayStatus.A;
          else if (hours < fullHours) data.status = AttendanceDayStatus.HD;
          else data.status = record.isLate ? AttendanceDayStatus.PL : AttendanceDayStatus.P;
        }
      }
      record = await this.prisma.attendanceRecord.update({
        where: { id: record.id },
        data,
      });
    }

    await this.prisma.attendancePunch.create({
      data: {
        companyId,
        employeeId,
        recordId: record.id,
        punchedAt,
        punchType,
        method: dto.method,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracyM: dto.accuracyM,
        qrPayload: dto.qrPayload,
        selfieUrl: dto.selfieUrl,
        deviceInfo: dto.deviceInfo,
      },
    });

    if (punchType === 'IN' && isLate) {
      await this.applyLateMark(companyId, employeeId, day);
      record = await this.prisma.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } });
    }

    if (actorId) {
      await this.audit.log({
        companyId,
        actorId,
        action: AuditAction.CREATE,
        entityType: 'AttendancePunch',
        entityId: record.id,
        metadata: { method: dto.method, punchType, isLate },
      });
    }

    const counter = await this.prisma.employeeAttendanceCounter.findUnique({
      where: { employeeId },
    });
    const incentive = await this.incentiveEligibility(companyId, employeeId);

    return { record, counter, incentive };
  }

  private async applyLateMark(companyId: string, employeeId: string, day: Date) {
    const windowMonths = await this.setting<number>(
      companyId,
      'attendance.ulob_window_months',
      6,
    );
    const ulobThreshold = await this.setting<number>(companyId, 'attendance.ulob_threshold', 4);
    const lateToHalf = await this.setting<number>(
      companyId,
      'attendance.late_marks_to_half_day',
      3,
    );

    const now = day;
    let counter = await this.prisma.employeeAttendanceCounter.findUnique({
      where: { employeeId },
    });

    if (!counter || now > counter.windowEnd) {
      const start = dateOnly(now);
      const end = new Date(start);
      end.setMonth(end.getMonth() + windowMonths);
      counter = await this.prisma.employeeAttendanceCounter.upsert({
        where: { employeeId },
        create: {
          companyId,
          employeeId,
          lateMarkCount: 1,
          ulobCount: 0,
          windowStart: start,
          windowEnd: end,
          lastResetAt: start,
        },
        update: {
          lateMarkCount: 1,
          ulobCount: 0,
          windowStart: start,
          windowEnd: end,
          lastResetAt: start,
        },
      });
    } else {
      counter = await this.prisma.employeeAttendanceCounter.update({
        where: { employeeId },
        data: { lateMarkCount: { increment: 1 } },
      });
    }

    // Convert every N late marks to half-day on this record
    if (counter.lateMarkCount > 0 && counter.lateMarkCount % lateToHalf === 0) {
      await this.prisma.attendanceRecord.updateMany({
        where: { employeeId, date: day },
        data: { status: AttendanceDayStatus.HD },
      });
    }

    if (counter.lateMarkCount >= ulobThreshold) {
      await this.prisma.employeeAttendanceCounter.update({
        where: { employeeId },
        data: { ulobCount: { increment: 1 }, lateMarkCount: 0 },
      });
      await this.prisma.attendanceRecord.updateMany({
        where: { employeeId, date: day },
        data: { status: AttendanceDayStatus.ULOB },
      });
    }
  }

  async incentiveEligibility(companyId: string, employeeId: string) {
    const enabled = await this.setting<boolean>(companyId, 'incentive.enabled', true);
    const amount = await this.setting<number>(companyId, 'incentive.amount', 0);
    const maxLate = await this.setting<number>(companyId, 'incentive.max_late_marks', 0);
    const counter = await this.prisma.employeeAttendanceCounter.findUnique({
      where: { employeeId },
    });
    const late = counter?.lateMarkCount ?? 0;
    const eligible = enabled && late <= maxLate;
    return { enabled, amount, maxLateMarks: maxLate, currentLateMarks: late, eligible };
  }

  async mySummary(user: AuthUser, year?: number, month?: number) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));

    const records = await this.prisma.attendanceRecord.findMany({
      where: { employeeId: user.employeeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    const counter = await this.prisma.employeeAttendanceCounter.findUnique({
      where: { employeeId: user.employeeId },
    });
    const incentive = await this.incentiveEligibility(user.companyId, user.employeeId);
    const counts = records.reduce(
      (acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { year: y, month: m, records, counts, counter, incentive };
  }

  async console(companyId: string, date: string) {
    const day = new Date(date);
    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: true,
      },
      orderBy: { employeeCode: 'asc' },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { companyId, date: dateOnly(day) },
    });
    const byEmp = new Map(records.map((r) => [r.employeeId, r]));
    return employees.map((e) => ({
      employee: e,
      record: byEmp.get(e.id) ?? null,
    }));
  }

  async monthlyGrid(companyId: string, year: number, month: number) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));
    const employees = await this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
      orderBy: { employeeCode: 'asc' },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { companyId, date: { gte: from, lte: to } },
    });
    return { year, month, employees, records };
  }

  async correct(user: AuthUser, employeeId: string, date: string, dto: CorrectAttendanceDto) {
    if (!this.isHr(user)) throw new ForbiddenException();
    const day = dateOnly(new Date(date));
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: user.companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const record = await this.prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: day } },
      create: {
        companyId: user.companyId,
        employeeId,
        date: day,
        status: dto.status,
        checkInAt: dto.checkInAt ? new Date(dto.checkInAt) : undefined,
        checkOutAt: dto.checkOutAt ? new Date(dto.checkOutAt) : undefined,
        method: dto.method ?? AttendanceMethod.MANUAL,
        correctedBy: user.id,
        correctionNote: dto.correctionNote,
      },
      update: {
        status: dto.status,
        checkInAt: dto.checkInAt ? new Date(dto.checkInAt) : undefined,
        checkOutAt: dto.checkOutAt ? new Date(dto.checkOutAt) : undefined,
        method: dto.method,
        correctedBy: user.id,
        correctionNote: dto.correctionNote,
      },
    });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.UPDATE,
      entityType: 'AttendanceRecord',
      entityId: record.id,
      metadata: { correction: true, status: dto.status },
    });
    return record;
  }

  async counters(companyId: string) {
    return this.prisma.employeeAttendanceCounter.findMany({
      where: { companyId },
      include: {
        employee: {
          select: { id: true, employeeCode: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async biometricDevices(companyId: string) {
    return this.prisma.biometricDevice.findMany({ where: { companyId } });
  }

  async biometricWebhook(companyId: string, dto: BiometricWebhookDto) {
    const expectedSecret = await this.setting(
      companyId,
      'integrations.biometric_webhook_secret',
      '',
    );
    if (!expectedSecret || dto.secret !== expectedSecret) {
      throw new ForbiddenException('Invalid biometric webhook secret');
    }

    const device = await this.prisma.biometricDevice.findUnique({
      where: { companyId_deviceCode: { companyId, deviceCode: dto.deviceCode } },
    });
    if (device) {
      await this.prisma.biometricDevice.update({
        where: { id: device.id },
        data: { lastSyncAt: new Date(), isOnline: true },
      });
    }
    const emp = await this.prisma.employee.findFirst({
      where: { companyId, employeeCode: dto.employeeCode, isActive: true },
    });
    if (!emp) throw new NotFoundException('Employee code not found');
    return this.markForEmployee(companyId, emp.id, {
      method: AttendanceMethod.BIOMETRIC,
      punchedAt: dto.punchedAt,
      punchType: dto.punchType,
      deviceInfo: dto.deviceCode,
    });
  }

  async teamAttendance(user: AuthUser, date: string) {
    if (!user.employeeId && !this.isHr(user)) throw new ForbiddenException();
    const day = dateOnly(new Date(date));
    const where = this.isHr(user)
      ? { companyId: user.companyId, isActive: true }
      : { companyId: user.companyId, isActive: true, reportingToId: user.employeeId! };

    const team = await this.prisma.employee.findMany({
      where,
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { companyId: user.companyId, date: day, employeeId: { in: team.map((t) => t.id) } },
    });
    const map = new Map(records.map((r) => [r.employeeId, r]));
    return team.map((t) => ({ employee: t, record: map.get(t.id) ?? null }));
  }
}
