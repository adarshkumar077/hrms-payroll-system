import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { DocumentsService } from './documents.service';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('documents')
@ApiBearerAuth()
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get('document-types')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  listTypes(@CurrentUser() user: AuthUser) {
    return this.documents.listTypes(user.companyId);
  }

  @Post('document-types/seed')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  seedTypes(@CurrentUser() user: AuthUser) {
    return this.documents.ensureDefaultTypes(user.companyId);
  }

  @Get('employees/:employeeId/documents')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR, RoleCode.ADMIN)
  listForEmployee(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.documents.listForEmployee(user, employeeId);
  }

  @Post('employees/:employeeId/documents')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'documentTypeCode'],
      properties: {
        file: { type: 'string', format: 'binary' },
        documentTypeCode: { type: 'string', example: 'AADHAAR' },
        title: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentTypeCode') documentTypeCode: string,
    @Body('title') title?: string,
    @Body('notes') notes?: string,
  ) {
    return this.documents.upload(
      user,
      employeeId,
      file,
      documentTypeCode || 'CUSTOM',
      title,
      notes,
    );
  }

  @Get('documents/:id/download')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, fileName, mimeType } = await this.documents.download(user, id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return file;
  }

  @Get('documents/:id/view')
  async view(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, fileName, mimeType } = await this.documents.view(user, id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${fileName}"`,
    });
    return file;
  }

  @Post('documents/:id/replace')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('title') title?: string,
  ) {
    return this.documents.replace(user, id, file, title);
  }

  @Delete('documents/:id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.softDelete(user, id);
  }

  @Get('me/documents')
  myDocuments(@CurrentUser() user: AuthUser) {
    return this.documents.listMine(user);
  }
}
