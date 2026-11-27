import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { MonitoringService } from './monitoring.service';

@ApiTags('monitoring')
@ApiBearerAuth()
@Controller('admin/system-health')
@Roles(RoleCode.SUPER_ADMIN)
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  /** Current health checks (no secrets). ?refresh=1 re-runs them now. */
  @Get()
  async get(@Query('refresh') refresh?: string) {
    if (refresh === '1' || !this.monitoring.snapshot()) {
      const checks = await this.monitoring.runChecks();
      return { checkedAt: new Date(), checks };
    }
    return this.monitoring.snapshot();
  }
}
