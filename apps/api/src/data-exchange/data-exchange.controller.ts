import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { DataExchangeService } from './data-exchange.service';

@ApiTags('data-exchange')
@ApiBearerAuth()
@Controller()
export class DataExchangeController {
  constructor(private readonly exchange: DataExchangeService) {}

  @Get('import/templates/:entity')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  @Header('Content-Type', 'text/csv')
  template(@Param('entity') entity: string) {
    const t = this.exchange.template(entity);
    return new StreamableFile(Buffer.from(t.csv), {
      type: 'text/csv',
      disposition: `attachment; filename="${t.filename}"`,
    });
  }

  @Get('import/jobs')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  jobs(@CurrentUser() user: AuthUser) {
    return this.exchange.listJobs(user);
  }

  @Get('import/jobs/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  status(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.exchange.jobStatus(user, id);
  }

  @Post('import/:entity')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  importFile(
    @CurrentUser() user: AuthUser,
    @Param('entity') entity: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('dryRun') dryRun?: string,
  ) {
    const csv = file?.buffer?.toString('utf8') ?? '';
    return this.exchange.importCsv(user, entity, file?.originalname ?? 'upload.csv', csv, {
      dryRun: dryRun === 'true' || dryRun === '1',
    });
  }

  @Post('export/:entity')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR, RoleCode.EMPLOYEE)
  async export(
    @CurrentUser() user: AuthUser,
    @Param('entity') entity: string,
    @Body() body: { format?: 'CSV' | 'XLSX' | 'PDF'; year?: number; month?: number },
  ) {
    const result = await this.exchange.exportData(user, entity, body.format ?? 'CSV', {
      year: body.year,
      month: body.month,
    });
    const buf = Buffer.isBuffer(result.file.content)
      ? result.file.content
      : Buffer.from(result.file.content);
    return new StreamableFile(buf, {
      type: result.file.contentType,
      disposition: `attachment; filename="${result.file.filename}"`,
    });
  }
}
