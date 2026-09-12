import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
  ManualMarkDto,
  MarkAttendanceDto,
} from './dto/attendance.dto';
import { isHrOrAbove, assertEmployeeScope } from '../common/authorization.util';
import { calcDailyEarning } from '../payroll/payroll-calculator';
import {
  buildMapsUrl,
  formatMinutes,
  formatTime,
  shortLocation,
} from './attendance-format';
import {
  CHECK_OUT_SOURCE,
  checkOutSourceLabel,
  isDueForSystemLogout,
  nextSystemLogoutAt,
  sanitizeAttendanceRecord,
  sanitizeAttendanceRecords,
} from './attendance-privacy';

// Company calendar dates are stored as UTC midnight of the punch's UTC date.
function dateOnly(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseHm(hm: string, on: Date) {
  const [h, m] = hm.split(':').map(Number);
  const x = new Date(on);
  x.setHours(h || 0, m || 0, 0, 0);
  return x;
}

function scheduledMinutesBetween(startHm: string, endHm: string): number {
  const [sh, sm] = startHm.split(':').map(Number);
  const [eh, em] = endHm.split(':').map(Number);
  let mins = (eh || 0) * 60 + (em || 0) - ((sh || 0) * 60 + (sm || 0));
  if (mins <= 0) mins += 24 * 60; // overnight
  return mins > 0 ? mins : 480;
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

function recordSnapshot(record: Record<string, unknown>) {
  return JSON.stringify(record);
}

@Injectable()
export class AttendanceService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    try {
      const result = await this.applySystemLogouts(new Date());
      if (result.closed > 0) {
        this.logger.log(
          `System logout catch-up closed ${result.closed} open attendance record(s)`,
        );
      }
    } catch (e) {
      this.logger.error(
        `System logout catch-up failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  @Cron('0 22 * * *', { timeZone: 'Asia/Kolkata' })
  async cronSystemLogout() {
    this.logger.log('10:00 PM Asia/Kolkata system logout cron');
    try {
      const result = await this.applySystemLogouts(new Date());
      this.logger.log(`System logout cron closed ${result.closed} record(s)`);
    } catch (e) {
      this.logger.error(
        `System logout cron failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  @Cron('8 * * * *', { timeZone: 'Asia/Kolkata' })
  async cronSystemLogoutCatchUp() {
    try {
      const result = await this.applySystemLogouts(new Date());
      if (result.closed > 0) {
        this.logger.log(`System logout hourly catch-up closed ${result.closed} record(s)`);
      }
    } catch (e) {
      this.logger.error(
        `System logout catch-up failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  private async setting<T>(companyId: string, key: string, fallback: T): Promise<T> {
    const row = await this.prisma.companySetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    return (row?.value as T) ?? fallback;
  }

  private isAttendanceManager(user: AuthUser) {
    return isHrOrAbove(user);
  }

  private isHr(user: AuthUser) {
    const allowed: string[] = [RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN];
    return user.roles.some((r) => allowed.includes(r));
  }

  private requiresEnterpriseCapture(dto: MarkAttendanceDto): boolean {
    return (
      dto.requireGps === true ||
      dto.method === AttendanceMethod.SELFIE ||
      dto.method === AttendanceMethod.WEB
    );
  }

  private assertEnterpriseCapture(dto: MarkAttendanceDto) {
    if (dto.selfieUrl == null || String(dto.selfieUrl).trim() === '') {
      throw new BadRequestException('Selfie is required to mark attendance');
    }
    if (dto.latitude == null || dto.longitude == null) {
      throw new BadRequestException(
        'GPS coordinates (latitude, longitude) are required to mark attendance',
      );
    }
    if (!dto.address || String(dto.address).trim() === '') {
      throw new BadRequestException(
        'Location permission denied or address unavailable; attendance cannot be submitted',
      );
    }
  }

  private async writeAttendanceAudit(opts: {
    companyId: string;
    recordId: string;
    employeeId: string;
    actorId?: string | null;
    action: string;
    beforeJson?: string | null;
    afterJson?: string | null;
    note?: string | null;
  }) {
    await this.prisma.attendanceAuditLog.create({
      data: {
        companyId: opts.companyId,
        recordId: opts.recordId,
        employeeId: opts.employeeId,
        actorId: opts.actorId ?? undefined,
        action: opts.action,
        beforeJson: opts.beforeJson ?? undefined,
        afterJson: opts.afterJson ?? undefined,
        note: opts.note ?? undefined,
      },
    });
  }

  private async computeOvertimeAndEarnings(opts: {
    companyId: string;
    employeeId: string;
    day: Date;
    punchedAt: Date;
    checkInAt: Date;
    status: AttendanceDayStatus;
    assignmentShift?: {
      startTime: string;
      endTime: string;
      overtimeAfterMinutes: number | null;
    } | null;
  }) {
    const workMinutes = Math.round(
      (opts.punchedAt.getTime() - opts.checkInAt.getTime()) / 60_000,
    );

    const workStart = await this.setting<string>(opts.companyId, 'office.work_start', '10:15');
    const workEnd = await this.setting<string>(opts.companyId, 'office.work_end', '18:30');
    const startHm = opts.assignmentShift?.startTime ?? workStart;
    const endHm = opts.assignmentShift?.endTime ?? workEnd;
    const scheduled = scheduledMinutesBetween(startHm, endHm) || 480;
    const overtimeAfter = opts.assignmentShift?.overtimeAfterMinutes ?? 0;
    const overtimeMinutes = Math.max(0, workMinutes - (scheduled + overtimeAfter));

    const payrollCfg = await this.prisma.employeePayrollConfig.findUnique({
      where: { employeeId: opts.employeeId },
    });
    const dailySalary = payrollCfg?.dailySalary ?? 0;
    const otMultiplier = await this.setting<number>(
      opts.companyId,
      'attendance.ot_multiplier',
      1.5,
    );
    const baseEarning = calcDailyEarning(opts.status, dailySalary);
    const otPay =
      dailySalary > 0 && overtimeMinutes > 0
        ? (dailySalary / 8 / 60) * overtimeMinutes * otMultiplier
        : 0;
    // Absent/ULOB store negative; otherwise clamp base at 0 then add OT
    const todaysEarnings =
      baseEarning.amount < 0
        ? baseEarning.amount
        : Math.max(0, baseEarning.amount) + otPay;

    return { workMinutes, overtimeMinutes, todaysEarnings };
  }

  async mark(user: AuthUser, dto: MarkAttendanceDto) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile linked');
    // Employee self-service always requires selfie + GPS + address
    const result = await this.markForEmployee(
      user.companyId,
      user.employeeId,
      { ...dto, requireGps: true },
      user.id,
    );
    return {
      ...result,
      record: sanitizeAttendanceRecord(result.record, false),
    };
  }

  /** HR manual mark — MANUAL method without selfie/GPS, still audits */
  async manualMark(user: AuthUser, dto: ManualMarkDto) {
    if (!this.isAttendanceManager(user)) {
      throw new ForbiddenException('Only HR and Super Admin can mark attendance for employees');
    }
    const emp = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId: user.companyId, isActive: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    return this.markForEmployee(
      user.companyId,
      dto.employeeId,
      {
        method: dto.method ?? AttendanceMethod.MANUAL,
        punchType: dto.punchType,
        punchedAt: dto.punchedAt,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address,
        mapsUrl: dto.mapsUrl,
        deviceInfo: dto.note ?? 'HR manual mark',
        requireGps: false,
      },
      user.id,
      {
        skipEnterprise: true,
        note: dto.note,
        checkOutSource:
          dto.punchType === 'OUT' ? CHECK_OUT_SOURCE.HR_MANUAL : undefined,
      },
    );
  }

  async markForEmployee(
    companyId: string,
    employeeId: string,
    dto: MarkAttendanceDto,
    actorId?: string,
    opts?: { skipEnterprise?: boolean; note?: string; checkOutSource?: string },
  ) {
    const methods = await this.setting<string[]>(companyId, 'attendance.methods_enabled', [
      'MANUAL',
      'SELFIE',
      'WEB',
    ]);
    if (!methods.includes(dto.method) && dto.method !== AttendanceMethod.BIOMETRIC) {
      throw new BadRequestException(`Method ${dto.method} is not enabled`);
    }

    const enterprise =
      !opts?.skipEnterprise &&
      dto.method !== AttendanceMethod.BIOMETRIC &&
      (dto.requireGps === true ||
        (dto.method !== AttendanceMethod.MANUAL && this.requiresEnterpriseCapture(dto)));

    if (enterprise) {
      this.assertEnterpriseCapture(dto);
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

    if (dto.method === AttendanceMethod.SELFIE && !dto.selfieUrl && !opts?.skipEnterprise) {
      throw new BadRequestException('Selfie URL required');
    }

    const mapsUrl =
      dto.mapsUrl ||
      (dto.latitude != null && dto.longitude != null
        ? buildMapsUrl(dto.latitude, dto.longitude)
        : undefined);

    const punchedAt = dto.punchedAt ? new Date(dto.punchedAt) : new Date();
    const day = dateOnly(punchedAt);

    const weeklyOff = await this.setting<number[]>(companyId, 'weekly_off.days', [0]);
    const isWeeklyOff = weeklyOff.includes(punchedAt.getDay());

    let record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
    });
    const beforeJson = record ? recordSnapshot(record as unknown as Record<string, unknown>) : null;

    const punchType =
      dto.punchType ??
      (!record?.checkInAt ? 'IN' : record.checkOutAt ? 'IN' : 'OUT');

    if (punchType === 'IN' && record?.checkInAt && !record.checkOutAt) {
      throw new BadRequestException('Already checked in. Check out first.');
    }

    if (punchType === 'OUT') {
      if (record?.checkOutAt) {
        throw new BadRequestException('Already checked out.');
      }
      if (!record?.checkInAt && !opts?.skipEnterprise) {
        throw new BadRequestException('No check-in found. Mark IN first.');
      }
    }

    const outSource =
      punchType === 'OUT'
        ? (opts?.checkOutSource ??
          (opts?.skipEnterprise ? undefined : CHECK_OUT_SOURCE.MANUAL_OUT))
        : undefined;

    const workStart = await this.setting<string>(companyId, 'office.work_start', '10:15');
    const grace = await this.setting<number>(companyId, 'office.grace_minutes', 0);
    const lateEnabled = await this.setting<boolean>(companyId, 'attendance.late_mark_enabled', true);

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
      const createData = {
        companyId,
        employeeId,
        date: day,
        status: isWeeklyOff ? AttendanceDayStatus.WO : AttendanceDayStatus.P,
        checkInAt: punchType === 'IN' ? punchedAt : undefined,
        checkOutAt: punchType === 'OUT' ? punchedAt : undefined,
        checkOutSource: outSource,
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
          note: opts?.note ?? null,
        }),
        ...(punchType === 'IN'
          ? {
              checkInLatitude: dto.latitude,
              checkInLongitude: dto.longitude,
              checkInAddress: dto.address,
              checkInSelfieUrl: dto.selfieUrl,
              checkInMapsUrl: mapsUrl,
            }
          : {
              checkOutLatitude: dto.latitude,
              checkOutLongitude: dto.longitude,
              checkOutAddress: dto.address,
              checkOutSelfieUrl: dto.selfieUrl,
              checkOutMapsUrl: mapsUrl,
            }),
      };
      record = await this.prisma.attendanceRecord.create({
        data: createData,
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
          note: opts?.note ?? null,
        }),
      };
      if (punchType === 'IN') {
        data.checkInAt = punchedAt;
        data.isLate = isLate;
        data.lateMinutes = lateMinutes;
        data.checkInLatitude = dto.latitude ?? record.checkInLatitude;
        data.checkInLongitude = dto.longitude ?? record.checkInLongitude;
        data.checkInAddress = dto.address ?? record.checkInAddress;
        data.checkInSelfieUrl = dto.selfieUrl ?? record.checkInSelfieUrl;
        data.checkInMapsUrl = mapsUrl ?? record.checkInMapsUrl;
        if (record.status === AttendanceDayStatus.A) data.status = AttendanceDayStatus.P;
      } else {
        data.checkOutAt = punchedAt;
        if (outSource) data.checkOutSource = outSource;
        data.checkOutLatitude = dto.latitude ?? record.checkOutLatitude;
        data.checkOutLongitude = dto.longitude ?? record.checkOutLongitude;
        data.checkOutAddress = dto.address ?? record.checkOutAddress;
        data.checkOutSelfieUrl = dto.selfieUrl ?? record.checkOutSelfieUrl;
        data.checkOutMapsUrl = mapsUrl ?? record.checkOutMapsUrl;

        if (record.checkInAt) {
          let status: AttendanceDayStatus = record.status;
          const provisionalWork = Math.round(
            (punchedAt.getTime() - new Date(record.checkInAt).getTime()) / 60_000,
          );
          const halfHours = await this.setting<number>(companyId, 'office.half_day_hours', 4);
          const fullHours = await this.setting<number>(companyId, 'office.full_day_hours', 8);
          const hours = provisionalWork / 60;
          if (hours < halfHours) status = AttendanceDayStatus.A;
          else if (hours < fullHours) status = AttendanceDayStatus.HD;
          else status = record.isLate ? AttendanceDayStatus.L : AttendanceDayStatus.P;

          const computed = await this.computeOvertimeAndEarnings({
            companyId,
            employeeId,
            day,
            punchedAt,
            checkInAt: new Date(record.checkInAt),
            status,
            assignmentShift: assignment?.shift ?? null,
          });
          data.workMinutes = computed.workMinutes;
          data.overtimeMinutes = computed.overtimeMinutes;
          data.todaysEarnings = computed.todaysEarnings;
          data.status = status;
        }
      }
      record = await this.prisma.attendanceRecord.update({
        where: { id: record.id },
        data,
      });
    }

    // If OUT created a brand-new record with check-in missing, still try earnings when both exist
    if (punchType === 'OUT' && record.checkInAt && record.checkOutAt && record.workMinutes == null) {
      const computed = await this.computeOvertimeAndEarnings({
        companyId,
        employeeId,
        day,
        punchedAt,
        checkInAt: new Date(record.checkInAt),
        status: record.status,
        assignmentShift: assignment?.shift ?? null,
      });
      record = await this.prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          workMinutes: computed.workMinutes,
          overtimeMinutes: computed.overtimeMinutes,
          todaysEarnings: computed.todaysEarnings,
        },
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
        address: dto.address,
        mapsUrl,
        qrPayload: dto.qrPayload,
        selfieUrl: dto.selfieUrl,
        deviceInfo: dto.deviceInfo,
      },
    });

    if (punchType === 'IN' && isLate) {
      await this.applyLateMark(companyId, employeeId, day);
      record = await this.prisma.attendanceRecord.findUniqueOrThrow({ where: { id: record.id } });
    }

    await this.writeAttendanceAudit({
      companyId,
      recordId: record.id,
      employeeId,
      actorId,
      action: punchType === 'IN' ? 'MARK_IN' : 'MARK_OUT',
      beforeJson,
      afterJson: recordSnapshot(record as unknown as Record<string, unknown>),
      note: opts?.note,
    });

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

    return { year: y, month: m, records: sanitizeAttendanceRecords(records, false), counts, counter, incentive };
  }

  async myCalendar(user: AuthUser, year?: number, month?: number) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    const now = new Date();
    const y = year ?? now.getFullYear();
    const m = month ?? now.getMonth() + 1;
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));
    const daysInMonth = to.getUTCDate();

    const [records, holidays, weeklyOff] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { employeeId: user.employeeId, date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.holiday.findMany({
        where: { companyId: user.companyId, date: { gte: from, lte: to } },
      }),
      this.setting<number[]>(user.companyId, 'weekly_off.days', [0]),
    ]);

    const recordByDate = new Map(
      records.map((r) => [r.date.toISOString().slice(0, 10), r]),
    );
    const holidayByDate = new Map(
      holidays.map((h) => [h.date.toISOString().slice(0, 10), h]),
    );

    const todayKey = dateOnly(now).toISOString().slice(0, 10);
    const days: {
      date: string;
      dayOfWeek: number;
      status: AttendanceDayStatus | 'NONE';
      isToday: boolean;
      isWeekOff: boolean;
      isHoliday: boolean;
      holidayName?: string;
      checkInAt?: string | null;
      checkOutAt?: string | null;
      checkOutSource?: string | null;
      checkOutLabel?: string | null;
      workMinutes?: number | null;
      remarks?: string | null;
    }[] = [];

    const summary = {
      present: 0,
      absent: 0,
      late: 0,
      halfDays: 0,
      paidLeaves: 0,
      wfh: 0,
      holidays: 0,
      weekOffs: 0,
      ulob: 0,
      od: 0,
      totalWorkingDays: 0,
    };

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      const key = dt.toISOString().slice(0, 10);
      const dayOfWeek = dt.getUTCDay();
      const holiday = holidayByDate.get(key);
      const record = recordByDate.get(key);
      const isWeekOff = weeklyOff.includes(dayOfWeek);
      const isHoliday = !!holiday;

      let status: AttendanceDayStatus | 'NONE' = record?.status ?? 'NONE';
      if (!record && isHoliday) status = AttendanceDayStatus.H;
      else if (!record && isWeekOff) status = AttendanceDayStatus.WO;

      if (status === AttendanceDayStatus.P) summary.present += 1;
      if (status === AttendanceDayStatus.A) summary.absent += 1;
      if (status === AttendanceDayStatus.L) {
        summary.late += 1;
        summary.present += 1;
      }
      if (status === AttendanceDayStatus.HD) summary.halfDays += 1;
      if (status === AttendanceDayStatus.PL) summary.paidLeaves += 1;
      if (status === AttendanceDayStatus.WFH) summary.wfh += 1;
      if (status === AttendanceDayStatus.H) summary.holidays += 1;
      if (status === AttendanceDayStatus.WO) summary.weekOffs += 1;
      if (status === AttendanceDayStatus.ULOB) summary.ulob += 1;
      if (status === AttendanceDayStatus.OD) summary.od += 1;
      if (
        !isWeekOff &&
        !isHoliday &&
        status !== AttendanceDayStatus.WO &&
        status !== AttendanceDayStatus.H &&
        status !== AttendanceDayStatus.PL
      ) {
        summary.totalWorkingDays += 1;
      }

      days.push({
        date: key,
        dayOfWeek,
        status,
        isToday: key === todayKey,
        isWeekOff,
        isHoliday,
        holidayName: holiday?.name,
        checkInAt: record?.checkInAt?.toISOString() ?? null,
        checkOutAt: record?.checkOutAt?.toISOString() ?? null,
        checkOutSource: record?.checkOutSource ?? null,
        checkOutLabel: checkOutSourceLabel(record?.checkOutSource),
        workMinutes: record?.workMinutes ?? null,
        remarks:
          record?.correctionNote ??
          (record?.checkOutSource === CHECK_OUT_SOURCE.SYSTEM_LOGOUT ? 'System Logout' : null),
      });
    }

    return { year: y, month: m, days, summary };
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
      record: byEmp.get(e.id)
        ? sanitizeAttendanceRecord(byEmp.get(e.id)!, true)
        : null,
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
    return {
      year,
      month,
      employees,
      records: sanitizeAttendanceRecords(records, true),
    };
  }

  /**
   * Excel-style attendance sheet rows for one employee (or all employees if HR omits employeeId).
   */
  async attendanceSheet(
    user: AuthUser,
    opts: { employeeId?: string; year: number; month: number },
  ) {
    const { year, month } = opts;
    let employeeId = opts.employeeId;

    if (!this.isHr(user)) {
      if (!user.employeeId) throw new ForbiddenException('No employee profile');
      employeeId = user.employeeId;
    }

    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0));

    const empWhere = employeeId
      ? { companyId: user.companyId, id: employeeId }
      : { companyId: user.companyId, isActive: true };

    const employees = await this.prisma.employee.findMany({
      where: empWhere,
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
      orderBy: { employeeCode: 'asc' },
    });
    if (employeeId && employees.length === 0) {
      throw new NotFoundException('Employee not found');
    }

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        companyId: user.companyId,
        date: { gte: from, lte: to },
        employeeId: { in: employees.map((e) => e.id) },
      },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
    });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const byEmpDate = new Map(
      records.map((r) => [`${r.employeeId}:${r.date.toISOString().slice(0, 10)}`, r]),
    );

    const privileged = this.isHr(user);
    const rows: {
      employeeId: string;
      employeeCode: string;
      employeeName: string;
      date: string;
      dayName: string;
      inTime: string;
      inLocation: string;
      outTime: string;
      outLocation: string;
      status: string;
      workingHours: string;
      overtime: string;
      todaysEarnings: number | null;
      checkInSelfieUrl: string | null;
      checkOutSelfieUrl: string | null;
      checkInMapsUrl: string | null;
      checkOutMapsUrl: string | null;
      workMinutes: number | null;
      overtimeMinutes: number;
      checkOutSource: string | null;
      checkOutLabel: string | null;
    }[] = [];

    const daysInMonth = to.getUTCDate();
    for (const emp of employees) {
      for (let d = 1; d <= daysInMonth; d++) {
        const dt = new Date(Date.UTC(year, month - 1, d));
        const key = dt.toISOString().slice(0, 10);
        const record = byEmpDate.get(`${emp.id}:${key}`);
        const dayName = dayNames[dt.getUTCDay()];
        const outLabel = checkOutSourceLabel(record?.checkOutSource);
        rows.push({
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          employeeName: `${emp.firstName}${emp.lastName ? ` ${emp.lastName}` : ''}`,
          date: key,
          dayName,
          inTime: formatTime(record?.checkInAt),
          inLocation: privileged ? shortLocation(record?.checkInAddress) : '—',
          outTime: formatTime(record?.checkOutAt),
          outLocation: privileged
            ? record?.checkOutSource === CHECK_OUT_SOURCE.SYSTEM_LOGOUT
              ? 'System Logout'
              : shortLocation(record?.checkOutAddress)
            : outLabel === 'System Logout'
              ? 'System Logout'
              : '—',
          status: record?.status ?? 'A',
          workingHours: formatMinutes(record?.workMinutes),
          overtime: formatMinutes(record?.overtimeMinutes ?? 0),
          todaysEarnings: record?.todaysEarnings ?? null,
          checkInSelfieUrl: privileged
            ? (record?.checkInSelfieUrl ?? record?.selfieUrl ?? null)
            : null,
          checkOutSelfieUrl: privileged ? (record?.checkOutSelfieUrl ?? null) : null,
          checkInMapsUrl: privileged ? (record?.checkInMapsUrl ?? null) : null,
          checkOutMapsUrl: privileged ? (record?.checkOutMapsUrl ?? null) : null,
          workMinutes: record?.workMinutes ?? null,
          overtimeMinutes: record?.overtimeMinutes ?? 0,
          checkOutSource: record?.checkOutSource ?? null,
          checkOutLabel: outLabel,
        });
      }
    }

    return { year, month, employeeId: employeeId ?? null, rows };
  }

  async recordDetail(user: AuthUser, employeeId: string, date: string) {
    assertEmployeeScope(user, employeeId);
    const privileged = this.isHr(user);
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: user.companyId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const day = dateOnly(new Date(date));
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
      include: {
        punches: { orderBy: { punchedAt: 'asc' } },
        auditLogs: { orderBy: { createdAt: 'asc' } },
      },
    });

    const safeRecord = record ? sanitizeAttendanceRecord(record, privileged) : null;
    const outLabel = checkOutSourceLabel(record?.checkOutSource);

    return {
      employee: emp,
      date: day.toISOString().slice(0, 10),
      record: safeRecord,
      punches: privileged
        ? (record?.punches ?? [])
        : ((safeRecord as { punches?: unknown[] } | null)?.punches ?? []),
      auditLogs: privileged
        ? (record?.auditLogs ?? [])
        : ((safeRecord as { auditLogs?: unknown[] } | null)?.auditLogs ?? []),
      formatted: record
        ? {
            inTime: formatTime(record.checkInAt),
            outTime: formatTime(record.checkOutAt),
            inLocation: privileged ? shortLocation(record.checkInAddress) : '—',
            outLocation: privileged
              ? record.checkOutSource === CHECK_OUT_SOURCE.SYSTEM_LOGOUT
                ? 'System Logout'
                : shortLocation(record.checkOutAddress)
              : outLabel === 'System Logout'
                ? 'System Logout'
                : '—',
            workingHours: formatMinutes(record.workMinutes),
            overtime: formatMinutes(record.overtimeMinutes),
            checkOutSource: record.checkOutSource ?? null,
            checkOutLabel: outLabel,
          }
        : null,
    };
  }

  async auditLogs(
    user: AuthUser,
    opts: { employeeId?: string; from?: string; to?: string },
  ) {
    if (!this.isHr(user) && opts.employeeId && opts.employeeId !== user.employeeId) {
      throw new ForbiddenException();
    }
    const employeeId = this.isHr(user) ? opts.employeeId : user.employeeId ?? undefined;
    const from = opts.from ? new Date(opts.from) : undefined;
    const to = opts.to ? new Date(opts.to) : undefined;

    return this.prisma.attendanceAuditLog.findMany({
      where: {
        companyId: user.companyId,
        ...(employeeId ? { employeeId } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async correct(user: AuthUser, employeeId: string, date: string, dto: CorrectAttendanceDto) {
    if (!this.isAttendanceManager(user)) {
      throw new ForbiddenException('Only HR and Super Admin can correct attendance');
    }
    const day = dateOnly(new Date(date));
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId: user.companyId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId, date: day } },
    });
    const beforeJson = existing
      ? recordSnapshot(existing as unknown as Record<string, unknown>)
      : null;

    const extra: Record<string, unknown> = {};
    if (dto.overtimeMinutes != null) extra.overtimeMinutes = dto.overtimeMinutes;
    if (dto.todaysEarnings != null) extra.todaysEarnings = dto.todaysEarnings;
    if (dto.checkInAddress != null) extra.checkInAddress = dto.checkInAddress;
    if (dto.checkOutAddress != null) extra.checkOutAddress = dto.checkOutAddress;
    if (dto.checkInMapsUrl != null) extra.checkInMapsUrl = dto.checkInMapsUrl;
    if (dto.checkOutMapsUrl != null) extra.checkOutMapsUrl = dto.checkOutMapsUrl;
    if (dto.checkInSelfieUrl != null) extra.checkInSelfieUrl = dto.checkInSelfieUrl;
    if (dto.checkOutSelfieUrl != null) extra.checkOutSelfieUrl = dto.checkOutSelfieUrl;
    if (dto.checkOutAt) extra.checkOutSource = CHECK_OUT_SOURCE.HR_MANUAL;

    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : existing?.checkInAt ?? undefined;
    const checkOutAt = dto.checkOutAt
      ? new Date(dto.checkOutAt)
      : existing?.checkOutAt ?? undefined;
    if (checkInAt && checkOutAt && dto.overtimeMinutes == null) {
      const assignment = await this.prisma.shiftAssignment.findUnique({
        where: { employeeId_date: { employeeId, date: day } },
        include: { shift: true },
      });
      const computed = await this.computeOvertimeAndEarnings({
        companyId: user.companyId,
        employeeId,
        day,
        punchedAt: checkOutAt,
        checkInAt,
        status: dto.status,
        assignmentShift: assignment?.shift ?? null,
      });
      extra.workMinutes = computed.workMinutes;
      if (dto.overtimeMinutes == null) extra.overtimeMinutes = computed.overtimeMinutes;
      if (dto.todaysEarnings == null) extra.todaysEarnings = computed.todaysEarnings;
    }

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
        ...extra,
      },
      update: {
        status: dto.status,
        checkInAt: dto.checkInAt ? new Date(dto.checkInAt) : undefined,
        checkOutAt: dto.checkOutAt ? new Date(dto.checkOutAt) : undefined,
        method: dto.method,
        correctedBy: user.id,
        correctionNote: dto.correctionNote,
        ...extra,
      },
    });

    await this.writeAttendanceAudit({
      companyId: user.companyId,
      recordId: record.id,
      employeeId,
      actorId: user.id,
      action: 'CORRECT',
      beforeJson,
      afterJson: recordSnapshot(record as unknown as Record<string, unknown>),
      note: dto.correctionNote,
    });

    await this.audit.log({
      companyId: user.companyId,
      actorId: user.id,
      action: AuditAction.UPDATE,
      entityType: 'AttendanceRecord',
      entityId: record.id,
      metadata: { correction: true, status: dto.status },
    });
    return sanitizeAttendanceRecord(record, true);
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
    return this.markForEmployee(
      companyId,
      emp.id,
      {
        method: AttendanceMethod.BIOMETRIC,
        punchedAt: dto.punchedAt,
        punchType: dto.punchType,
        deviceInfo: dto.deviceCode,
      },
      undefined,
      { skipEnterprise: true },
    );
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
    const privileged = this.isHr(user);
    return team.map((t) => ({
      employee: t,
      record: map.get(t.id) ? sanitizeAttendanceRecord(map.get(t.id)!, privileged) : null,
    }));
  }

  /**
   * Close open IN records whose 10:00 PM Asia/Kolkata deadline has passed.
   * No selfie/GPS. Idempotent — skips records that already have checkOutAt.
   */
  async applySystemLogouts(now = new Date()) {
    const open = await this.prisma.attendanceRecord.findMany({
      where: { checkInAt: { not: null }, checkOutAt: null },
    });

    let closed = 0;
    for (const rec of open) {
      if (!rec.checkInAt) continue;
      if (!isDueForSystemLogout(rec.checkInAt, now)) continue;
      try {
        const didClose = await this.closeWithSystemLogout(rec, nextSystemLogoutAt(rec.checkInAt));
        if (didClose) closed += 1;
      } catch (e) {
        this.logger.error(
          `SYSTEM LOGOUT failed for record ${rec.id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    return { scanned: open.length, closed, at: now.toISOString() };
  }

  private async closeWithSystemLogout(
    rec: {
      id: string;
      companyId: string;
      employeeId: string;
      date: Date;
      status: AttendanceDayStatus;
      checkInAt: Date | null;
      isLate: boolean;
    },
    logoutAt: Date,
  ): Promise<boolean> {
    if (!rec.checkInAt) return false;

    const claimed = await this.prisma.attendanceRecord.updateMany({
      where: { id: rec.id, checkOutAt: null },
      data: {
        checkOutAt: logoutAt,
        checkOutSource: CHECK_OUT_SOURCE.SYSTEM_LOGOUT,
        checkOutLatitude: null,
        checkOutLongitude: null,
        checkOutAddress: null,
        checkOutSelfieUrl: null,
        checkOutMapsUrl: null,
      },
    });
    if (claimed.count === 0) return false;

    const assignment = await this.prisma.shiftAssignment.findUnique({
      where: { employeeId_date: { employeeId: rec.employeeId, date: rec.date } },
      include: { shift: true },
    });

    let status: AttendanceDayStatus = rec.status;
    const provisionalWork = Math.round(
      (logoutAt.getTime() - new Date(rec.checkInAt).getTime()) / 60_000,
    );
    const halfHours = await this.setting<number>(rec.companyId, 'office.half_day_hours', 4);
    const fullHours = await this.setting<number>(rec.companyId, 'office.full_day_hours', 8);
    const hours = provisionalWork / 60;
    if (hours < halfHours) status = AttendanceDayStatus.A;
    else if (hours < fullHours) status = AttendanceDayStatus.HD;
    else status = rec.isLate ? AttendanceDayStatus.L : AttendanceDayStatus.P;

    const computed = await this.computeOvertimeAndEarnings({
      companyId: rec.companyId,
      employeeId: rec.employeeId,
      day: rec.date,
      punchedAt: logoutAt,
      checkInAt: new Date(rec.checkInAt),
      status,
      assignmentShift: assignment?.shift ?? null,
    });

    await this.prisma.attendanceRecord.update({
      where: { id: rec.id },
      data: {
        workMinutes: computed.workMinutes,
        overtimeMinutes: computed.overtimeMinutes,
        todaysEarnings: computed.todaysEarnings,
        status,
        checkOutSource: CHECK_OUT_SOURCE.SYSTEM_LOGOUT,
      },
    });

    await this.prisma.attendancePunch.create({
      data: {
        companyId: rec.companyId,
        employeeId: rec.employeeId,
        recordId: rec.id,
        punchedAt: logoutAt,
        punchType: 'OUT',
        method: AttendanceMethod.MANUAL,
        deviceInfo: 'SYSTEM LOGOUT',
      },
    });

    await this.writeAttendanceAudit({
      companyId: rec.companyId,
      recordId: rec.id,
      employeeId: rec.employeeId,
      actorId: null,
      action: 'SYSTEM_LOGOUT',
      afterJson: JSON.stringify({
        checkOutAt: logoutAt.toISOString(),
        checkOutSource: CHECK_OUT_SOURCE.SYSTEM_LOGOUT,
      }),
      note: 'System Logout at 10:00 PM',
    });

    this.logger.log(
      `SYSTEM LOGOUT applied for employee ${rec.employeeId} record ${rec.id} at ${logoutAt.toISOString()}`,
    );
    return true;
  }
}
