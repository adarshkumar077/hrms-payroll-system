import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { IpAllowlistGuard } from './ip-allowlist.guard';
import { Require2faGuard } from './require-2fa.guard';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SecurityController],
  providers: [SecurityService, IpAllowlistGuard, Require2faGuard],
  exports: [SecurityService, IpAllowlistGuard, Require2faGuard],
})
export class SecurityModule {}
