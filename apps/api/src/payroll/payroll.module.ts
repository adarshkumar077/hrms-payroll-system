import { Module, forwardRef } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { AuditModule } from '../audit/audit.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { StatutoryModule } from './statutory/statutory.module';

@Module({
  imports: [AuditModule, StatutoryModule, forwardRef(() => WorkflowModule)],
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
