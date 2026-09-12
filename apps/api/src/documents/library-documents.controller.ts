import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { LibraryDocumentsService } from './library-documents.service';

@ApiTags('library-documents')
@ApiBearerAuth()
@Controller('library/documents')
export class LibraryDocumentsController {
  constructor(private readonly library: LibraryDocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('folder') folder?: string,
    @Query('search') search?: string,
  ) {
    return this.library.list(user, { folder, search });
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR, RoleCode.EMPLOYEE)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
    @Body('category') category?: string,
    @Body('title') title?: string,
    @Body('employeeId') employeeId?: string,
    @Body('expiresAt') expiresAt?: string,
  ) {
    return this.library.upload(user, file, { folder: folder || 'COMPANY', category, title, employeeId, expiresAt });
  }

  @Put(':id')
  rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { title: string }) {
    return this.library.rename(user, id, body.title);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.HR)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.library.remove(user, id);
  }

  @Get(':id/versions')
  versions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.library.versions(user, id);
  }

  @Get(':id/download')
  async download(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { file, fileName, mimeType } = await this.library.download(user, id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return file;
  }

  @Get(':id/preview')
  async preview(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { file, fileName, mimeType } = await this.library.download(user, id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${fileName}"`,
    });
    return file;
  }
}
