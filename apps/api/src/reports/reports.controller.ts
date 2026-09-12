import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private q(year?: string, month?: string, limit?: string) {
    return {
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      limit: limit ? Number(limit) : undefined,
    };
  }

  private file(file: { filename: string; content: string | Buffer; contentType: string }) {
    const buf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    return new StreamableFile(buf, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }

  @Get('reports/attendance')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  attendance(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.attendance(user.companyId, year ? Number(year) : undefined, month ? Number(month) : undefined);
  }

  @Get('reports/leave')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  leave(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.reports.leave(user.companyId, year ? Number(year) : undefined);
  }

  @Get('reports/payroll')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  payroll(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.payroll(user.companyId, year ? Number(year) : undefined, month ? Number(month) : undefined);
  }

  @Get('reports/employee')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  employee(@CurrentUser() user: AuthUser) {
    return this.reports.employee(user.companyId);
  }

  @Get('reports/department')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  department(@CurrentUser() user: AuthUser) {
    return this.reports.department(user.companyId);
  }

  @Get('reports/cost')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  cost(@CurrentUser() user: AuthUser) {
    return this.reports.cost(user.companyId);
  }

  @Get('reports/compliance')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  compliance(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.compliance(user.companyId, year ? Number(year) : undefined, month ? Number(month) : undefined);
  }

  @Get('reports/audit')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  audit(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.reports.audit(user.companyId, limit ? Number(limit) : 200);
  }

  @Get('balance-sheets/:kind')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  balance(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.resolveBalance(user.companyId, kind.toLowerCase(), this.q(year, month));
  }

  @Get('reports/:kind/export/excel')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  async reportExcel(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.reports.resolveReport(user.companyId, kind, this.q(year, month));
    return this.file(await this.reports.exportExcel(data.title, data.rows));
  }

  @Get('reports/:kind/export/pdf')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  async reportPdf(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.reports.resolveReport(user.companyId, kind, this.q(year, month));
    return (await this.reports.exportPdfHtml(data.title, data.rows)).content;
  }

  @Get('reports/:kind/export/csv')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN, RoleCode.ADMIN)
  async reportCsv(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.reports.resolveReport(user.companyId, kind, this.q(year, month));
    return this.file(await this.reports.exportCsv(data.title, data.rows));
  }

  @Post('reports/:kind/export/email')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  async reportEmail(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.reports.resolveReport(user.companyId, kind, this.q(year, month));
    return this.reports.exportEmail(
      user.companyId,
      user.id,
      data.title,
      data.rows,
      user.email ?? undefined,
    );
  }

  @Get('balance-sheets/:kind/export/excel')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  async balExcel(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.reports.resolveBalance(user.companyId, kind.toLowerCase(), this.q(year, month));
    return this.file(await this.reports.exportExcel(data.title, data.rows));
  }

  @Get('balance-sheets/:kind/export/pdf')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  async balPdf(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.reports.resolveBalance(user.companyId, kind.toLowerCase(), this.q(year, month));
    return (await this.reports.exportPdfHtml(data.title, data.rows)).content;
  }

  @Get('balance-sheets/:kind/export/csv')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  async balCsv(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.reports.resolveBalance(user.companyId, kind.toLowerCase(), this.q(year, month));
    return this.file(await this.reports.exportCsv(data.title, data.rows));
  }

  @Post('balance-sheets/:kind/export/email')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  async balEmail(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const data = await this.reports.resolveBalance(user.companyId, kind.toLowerCase(), this.q(year, month));
    return this.reports.exportEmail(
      user.companyId,
      user.id,
      data.title,
      data.rows,
      user.email ?? undefined,
    );
  }
}
