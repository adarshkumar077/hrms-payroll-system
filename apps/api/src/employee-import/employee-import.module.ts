import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { EmployeeImportController } from './employee-import.controller';
import { EmployeeImportService } from './employee-import.service';

@Module({
  imports: [EmployeesModule],
  controllers: [EmployeeImportController],
  providers: [EmployeeImportService],
})
export class EmployeeImportModule {}
