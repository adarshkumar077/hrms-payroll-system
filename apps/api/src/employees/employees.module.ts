import { Module, forwardRef } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeePayrollService } from './employee-payroll.service';
import { EmployeesController } from './employees.controller';
import { LifecycleModule } from '../lifecycle/lifecycle.module';

@Module({
  imports: [forwardRef(() => LifecycleModule)],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeePayrollService],
  exports: [EmployeesService, EmployeePayrollService],
})
export class EmployeesModule {}