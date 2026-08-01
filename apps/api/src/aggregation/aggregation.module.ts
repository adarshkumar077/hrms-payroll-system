import { Module } from '@nestjs/common';
import { AggregationController } from './aggregation.controller';
import { EssService } from './ess.service';
import { DashboardService } from './dashboard.service';
import { NotificationsService } from './notifications.service';
import { LeaveModule } from '../leave/leave.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [LeaveModule, AttendanceModule, EmployeesModule],
  controllers: [AggregationController],
  providers: [EssService, DashboardService, NotificationsService],
  exports: [EssService, DashboardService, NotificationsService],
})
export class AggregationModule {}
