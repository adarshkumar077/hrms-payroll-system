import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { SecurityService } from './security.service';
import { buildExport } from '../common/export.engine';

@ApiTags('security')
@ApiBearerAuth()
@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  private file(file: { filename: string; content: string | Buffer; contentType: string }) {
    const buf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    return new StreamableFile(buf, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get('settings')
  @Roles(RoleCode.SUPER_ADMIN)
  settings(@CurrentUser() user: AuthUser) {
    return this.security.getSecuritySettings(user.companyId);
  }

  @Put('settings')
  @Roles(RoleCode.SUPER_ADMIN)
  update(
    @CurrentUser() user: AuthUser,
    @Body() body: { settings: Record<string, unknown> },
    @Req() req: { ip?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    const fwd = req.headers?.['x-forwarded-for'];
    const ip =
      (typeof fwd === 'string' ? fwd.split(',')[0]?.trim() : undefined) || req.ip;
    return this.security.updateSecuritySettings(user.companyId, user.id, body.settings ?? {}, {
      ip,
    });
  }

  @Get('audit')
  @Roles(RoleCode.SUPER_ADMIN)
  audit(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.security.listAudit(user.companyId, {
      limit: limit ? Number(limit) : 200,
      action,
      entityType,
      actorId,
    });
  }

  @Get('audit/export/csv')
  @Roles(RoleCode.SUPER_ADMIN)
  async auditCsv(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
  ) {
    const data = await this.security.listAudit(user.companyId, {
      limit: limit ? Number(limit) : 1000,
    });
    const rows = data.rows.map((r) => ({
      at: r.at,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorName: r.actorName,
      actorEmail: r.actorEmail,
      ipAddress: r.ipAddress,
    }));
    if (!rows.length) {
      return new StreamableFile(Buffer.from(''), {
        type: 'text/csv',
        disposition: 'attachment; filename="audit.csv"',
      });
    }
    const keys = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(','))].join(
      '\n',
    );
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv',
      disposition: 'attachment; filename="audit.csv"',
    });
  }

  @Get('backups')
  @Roles(RoleCode.SUPER_ADMIN)
  backups(@CurrentUser() user: AuthUser) {
    return this.security.listBackups(user.companyId);
  }

  @Post('backups/run')
  @Roles(RoleCode.SUPER_ADMIN)
  runBackup(@CurrentUser() user: AuthUser) {
    return this.security.runBackup(user.companyId, 'manual', user.id);
  }

  @Get('compliance/:kind')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  compliance(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.security.statutoryCompliance(
      user.companyId,
      kind,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
  }

  @Get('compliance/:kind/export/csv')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  async complianceCsv(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.security.statutoryCompliance(
      user.companyId,
      kind,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
    const rows = data.rows as Record<string, unknown>[];
    if (!rows.length) {
      return new StreamableFile(Buffer.from(''), {
        type: 'text/csv',
        disposition: `attachment; filename="${kind}.csv"`,
      });
    }
    const keys = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
    return new StreamableFile(Buffer.from(csv, 'utf8'), {
      type: 'text/csv',
      disposition: `attachment; filename="${kind}-${data.year}-${data.month}.csv"`,
    });
  }

  @Get('compliance/:kind/export/excel')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  async complianceExcel(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.security.statutoryCompliance(
      user.companyId,
      kind,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
    return this.file(await buildExport('excel', data.title, data.rows as Record<string, unknown>[]));
  }

  @Get('compliance/:kind/export/pdf')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  async compliancePdf(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.security.statutoryCompliance(
      user.companyId,
      kind,
      year ? Number(year) : undefined,
      month ? Number(month) : undefined,
    );
    return (await buildExport('pdf', data.title, data.rows as Record<string, unknown>[])).content;
  }
}
