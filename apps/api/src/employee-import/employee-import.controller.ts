import { Body, Controller, Get, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { EmployeeImportService } from './employee-import.service';
import { IMPORT_MAX_BYTES } from './employee-import.parser';

const upload = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } });

@ApiTags('employee-import')
@ApiBearerAuth()
@Controller('employee-import')
export class EmployeeImportController {
  constructor(private readonly svc: EmployeeImportService) {}

  @Get('template')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  async template() {
    return new StreamableFile(await this.svc.template(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="eitf-employee-import-template.xlsx"',
    });
  }

  @Post('preview')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  preview(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.svc.preview(user, file);
  }

  /** Final import: Super Admin only, same file as the preview, backup confirmed. */
  @Post('commit')
  @Roles(RoleCode.SUPER_ADMIN)
  @UseInterceptors(upload)
  @ApiConsumes('multipart/form-data')
  commit(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('jobId') jobId: string,
    @Body('backupConfirmed') backupConfirmed: string,
  ) {
    return this.svc.commit(user, file, String(jobId ?? ''), backupConfirmed === 'true');
  }

  @Get('jobs')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  jobs(@CurrentUser() user: AuthUser) {
    return this.svc.listJobs(user);
  }
}
