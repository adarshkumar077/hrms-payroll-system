import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { readFile } from 'fs/promises';
import path from 'path';
import { Roles } from '../auth/decorators/roles.decorator';

const MAP: Record<string, string> = {
  'user-manuals': 'USER_MANUALS.md',
  training: 'TRAINING.md',
  deployment: 'DEPLOYMENT.md',
  backup: 'BACKUP_AND_RECOVERY.md',
  security: 'AUDIT_AND_SECURITY.md',
  database: 'DATABASE.md',
  exports: 'EXPORT_ENGINE.md',
};

@ApiTags('help-docs')
@ApiBearerAuth()
@Controller('help-docs')
@Roles(RoleCode.SUPER_ADMIN, RoleCode.HR)
export class HelpDocsController {
  @Get(':slug')
  async getDoc(@Param('slug') slug: string) {
    const file = MAP[slug];
    if (!file) throw new NotFoundException('Document not found');
    const candidates = [
      path.join(process.cwd(), 'docs', file),
      path.join(process.cwd(), '..', '..', 'docs', file),
      path.join(process.cwd(), '..', 'docs', file),
    ];
    for (const p of candidates) {
      try {
        const body = await readFile(p, 'utf8');
        return { slug, title: slug.replace(/-/g, ' '), body };
      } catch {
        /* try next */
      }
    }
    throw new NotFoundException('Document file missing on server');
  }
}
