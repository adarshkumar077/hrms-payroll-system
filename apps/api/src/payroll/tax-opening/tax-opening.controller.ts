import { Body, Controller, Delete, Get, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../auth/decorators/current-user.decorator';
import { OpeningRowInput, TaxOpeningService } from './tax-opening.service';

/** Tax opening balances for a mid-year go-live. Super Admin only (payroll runs are Super Admin only). */
@ApiTags('payroll')
@ApiBearerAuth()
@Controller('payroll/tax-opening-balances')
@Roles(RoleCode.SUPER_ADMIN)
export class TaxOpeningController {
  constructor(private readonly svc: TaxOpeningService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('financialYear') financialYear?: string) {
    return this.svc.list(user, financialYear);
  }

  @Put()
  save(
    @CurrentUser() user: AuthUser,
    @Body() body: { financialYear: string; source: string; rows: OpeningRowInput[]; dryRun?: boolean },
  ) {
    return this.svc.save(user, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user, id);
  }
}
