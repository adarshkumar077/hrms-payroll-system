import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LoanAdvanceType,
  NotificationStatus,
  PayrollRunStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../auth/decorators/current-user.decorator';
import { LeaveService } from '../leave/leave.service';
import { AttendanceService } from '../attendance/attendance.service';
import { EmployeesService } from '../employees/employees.service';
import { ApplyLeaveDto } from '../leave/dto/leave.dto';
import { MarkAttendanceDto } from '../attendance/dto/attendance.dto';
import { UpdateMyProfileDto } from '../employees/dto/employee.dto';

@Injectable()
export class EssService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
    private readonly attendance: AttendanceService,
    private readonly employees: EmployeesService,
  ) {}

  private requireEmployee(user: AuthUser) {
    if (!user.employeeId) throw new ForbiddenException('No employee profile');
    return user.employeeId;
  }

  async myAttendance(user: AuthUser, year?: number, month?: number) {
    const employeeId = this.requireEmployee(user);
    const y = year ?? new Date().getFullYear();
    const m = month ?? new Date().getMonth() + 1;
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0));
    const records = await this.prisma.attendanceRecord.findMany({
      where: { employeeId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });
    const counters = await this.attendance.mySummary(user, y, m);
    return { year: y, month: m, records, counters };
  }

  markAttendance(user: AuthUser, dto: MarkAttendanceDto) {
    return this.attendance.mark(user, dto);
  }

  applyLeave(user: AuthUser, dto: ApplyLeaveDto) {
    return this.leave.apply(user, dto);
  }

  myPayslips(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    return this.prisma.payrollLine.findMany({
      where: {
        employeeId,
        payrollRun: { status: { in: [PayrollRunStatus.APPROVED, PayrollRunStatus.LOCKED] } },
      },
      include: { payrollRun: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async myReports(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    const [attendanceCount, leaveApps, payslips, loans, tickets] = await Promise.all([
      this.prisma.attendanceRecord.count({ where: { employeeId } }),
      this.prisma.leaveApplication.count({ where: { employeeId } }),
      this.prisma.payrollLine.count({
        where: {
          employeeId,
          payrollRun: { status: { in: [PayrollRunStatus.LOCKED, PayrollRunStatus.APPROVED] } },
        },
      }),
      this.prisma.loanAdvance.count({ where: { employeeId } }),
      this.prisma.ticket.count({ where: { requesterId: employeeId } }),
    ]);
    return {
      links: [
        { key: 'attendance', path: '/me/attendance', count: attendanceCount },
        { key: 'leaves', path: '/me/leave/applications', count: leaveApps },
        { key: 'payslips', path: '/me/payslips', count: payslips },
        { key: 'loans', path: '/me/loans', count: loans },
        { key: 'tickets', path: '/tickets?mine=1', count: tickets },
      ],
    };
  }

  myProfile(user: AuthUser) {
    return this.employees.getMe(user);
  }

  patchProfile(user: AuthUser, dto: UpdateMyProfileDto) {
    return this.employees.updateMyProfile(user, dto);
  }

  myDocuments(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    return this.prisma.employeeDocument.findMany({
      where: { employeeId },
      include: { documentType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async mySalary(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    const structure = await this.prisma.employeeSalaryStructure.findFirst({
      where: { employeeId, isActive: true },
      include: { lines: { include: { component: true } } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!structure) throw new NotFoundException('No active salary structure');
    return structure;
  }

  async myDeposits(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    const last = await this.prisma.esdLedgerEntry.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
    const ledger = await this.prisma.esdLedgerEntry.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { balance: last?.balanceAfter ?? 0, ledger };
  }

  myLoans(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    return this.prisma.loanAdvance.findMany({
      where: { employeeId, type: LoanAdvanceType.LOAN },
      include: { emis: { orderBy: { installmentNo: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  myAdvances(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    return this.prisma.loanAdvance.findMany({
      where: { employeeId, type: LoanAdvanceType.ADVANCE },
      include: { emis: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Compact ESS home payload */
  async home(user: AuthUser) {
    const employeeId = this.requireEmployee(user);
    const [profile, notifications, announcements, unpaid] = await Promise.all([
      this.employees.getMe(user),
      this.prisma.notification.findMany({
        where: {
          companyId: user.companyId,
          OR: [{ employeeId }, { employeeId: null }],
          status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.announcement.findMany({
        where: {
          companyId: user.companyId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { publishedAt: 'desc' },
        take: 5,
      }),
      this.prisma.notification.count({
        where: {
          employeeId,
          status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] },
          readAt: null,
        },
      }),
    ]);
    return { profile, unreadNotifications: unpaid, notifications, announcements };
  }
}
