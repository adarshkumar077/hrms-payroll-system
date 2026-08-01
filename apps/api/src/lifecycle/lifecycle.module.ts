import { Module, forwardRef } from '@nestjs/common';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';
import { AuditModule } from '../audit/audit.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [AuditModule, DocumentsModule, forwardRef(() => WorkflowModule)],
  controllers: [LifecycleController],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
