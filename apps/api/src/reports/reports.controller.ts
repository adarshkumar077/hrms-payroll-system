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
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE, RoleCode.MANAGER)
  attendance(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.attendance(user.companyId, year ? Number(year) : undefined, month ? Number(month) : undefined);
  }

  @Get('reports/leave')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE, RoleCode.MANAGER)
  leave(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.reports.leave(user.companyId, year ? Number(year) : undefined);
  }

  @Get('reports/payroll')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  payroll(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.payroll(user.companyId, year ? Number(year) : undefined, month ? Number(month) : undefined);
  }

  @Get('reports/employee')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE, RoleCode.MANAGER)
  employee(@CurrentUser() user: AuthUser) {
    return this.reports.employee(user.companyId);
  }

  @Get('reports/department')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  department(@CurrentUser() user: AuthUser) {
    return this.reports.department(user.companyId);
  }

  @Get('reports/cost')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  cost(@CurrentUser() user: AuthUser) {
    return this.reports.cost(user.companyId);
  }

  @Get('reports/compliance')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  compliance(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.compliance(user.companyId, year ? Number(year) : undefined, month ? Number(month) : undefined);
  }

  @Get('reports/audit')
  @Roles(RoleCode.CEO, RoleCode.HR)
  audit(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.reports.audit(user.companyId, limit ? Number(limit) : 200);
  }

  @Get('balance-sheets/:kind')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
  balance(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    return this.reports.resolveBalance(user.companyId, kind.toLowerCase(), this.q(year, month));
  }

  @Get('reports/:kind/export/excel')
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE, RoleCode.MANAGER)
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
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE, RoleCode.MANAGER)
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
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE, RoleCode.MANAGER)
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
  @Roles(RoleCode.CEO, RoleCode.HR)
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
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
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
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
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
  @Roles(RoleCode.CEO, RoleCode.HR, RoleCode.FINANCE)
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
  @Roles(RoleCode.CEO, RoleCode.HR)
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
