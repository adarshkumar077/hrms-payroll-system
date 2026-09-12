import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CompanyModule } from './company/company.module';
import { HealthModule } from './health/health.module';
import { AuditModule } from './audit/audit.module';
import { EmployeesModule } from './employees/employees.module';
import { DocumentsModule } from './documents/documents.module';
import { HolidaysModule } from './holidays/holidays.module';
import { ShiftsModule } from './shifts/shifts.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { PayrollModule } from './payroll/payroll.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { GrowthModule } from './growth/growth.module';
import { AggregationModule } from './aggregation/aggregation.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ReportsModule } from './reports/reports.module';
import { SecurityModule } from './security/security.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { AiModule } from './ai/ai.module';
import { AdminModule } from './admin/admin.module';
import { HelpDocsModule } from './help-docs/help-docs.module';
import { StudioModule } from './studio/studio.module';
import { DataExchangeModule } from './data-exchange/data-exchange.module';
import { CrmModule } from './crm/crm.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { IpAllowlistGuard } from './security/ip-allowlist.guard';
import { Require2faGuard } from './security/require-2fa.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    CompanyModule,
    EmployeesModule,
    DocumentsModule,
    HolidaysModule,
    ShiftsModule,
    AttendanceModule,
    LeaveModule,
    PayrollModule,
    LifecycleModule,
    GrowthModule,
    AggregationModule,
    WorkflowModule,
    ReportsModule,
    SecurityModule,
    IntegrationsModule,
    AiModule,
    AdminModule,
    HelpDocsModule,
    StudioModule,
    DataExchangeModule,
    CrmModule,
    HealthModule, // public /health for local + tunnel probes
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: IpAllowlistGuard },
    { provide: APP_GUARD, useClass: Require2faGuard },
  ],
})
export class AppModule {}
