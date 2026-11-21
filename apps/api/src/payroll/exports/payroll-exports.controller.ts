import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { ExportFile } from '../../common/export.engine';
import { PayrollExportsService } from './payroll-exports.service';

function send(res: Response, file: ExportFile, extra: Record<string, string | number> = {}) {
  const buf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, String(v));
  // Let the browser read custom headers on same-origin and proxied downloads.
  res.setHeader('Access-Control-Expose-Headers', ['Content-Disposition', ...Object.keys(extra)].join(', '));
  return new StreamableFile(buf, {
    type: file.contentType,
    disposition: `attachment; filename="${file.filename}"`,
  });
}

@ApiTags('payroll-exports')
@ApiBearerAuth()
@Controller()
export class PayrollExportsController {
  constructor(private readonly exports: PayrollExportsService) {}

  @Get('payroll/runs/:id/exports/validation')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  validation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.exports.validation(user, id);
  }

  @Get('payroll/runs/:id/exports/pf-ecr')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  async pfEcr(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.exports.pfEcr(user, id);
    return send(res, f, { 'X-Missing-UAN': f.missingUan, 'X-Rows-Included': f.included });
  }

  @Get('payroll/runs/:id/exports/esi')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  async esi(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send(res, await this.exports.esiSheet(user, id));
  }

  @Get('payroll/runs/:id/exports/bank')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  async bank(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send(res, await this.exports.bankCsv(user, id));
  }

  /** Data for Form 16 / 24Q preparation (not the official form). ?fy=2026-27&format=excel|csv */
  @Get('payroll/exports/tds')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  async tds(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query('fy') fy: string,
    @Query('format') format?: string,
  ) {
    return send(res, await this.exports.tds(user, fy, format === 'csv' ? 'csv' : 'excel'));
  }
}
