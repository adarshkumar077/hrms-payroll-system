import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { StorageService } from './storage.service';

const SERVABLE = /^selfies\/[A-Za-z0-9_-]+\/\d{4}-\d{2}\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

/**
 * Serves objects for the `local` driver via short-lived HMAC-signed URLs
 * (issued by StorageService.signedUrl after access checks). Only selfie keys are servable.
 */
@ApiExcludeController()
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get('object')
  async object(@Query('key') key?: string, @Query('exp') exp?: string, @Query('sig') sig?: string) {
    if (!key || !exp || !sig || !SERVABLE.test(key)) throw new ForbiddenException('Invalid link');
    if (!this.storage.verifySignature(key, Number(exp), sig)) {
      throw new ForbiddenException('Link expired or invalid');
    }
    let stream;
    try {
      stream = await this.storage.getStream(key, 'local');
    } catch {
      throw new NotFoundException('File not found');
    }
    const type = key.endsWith('.png')
      ? 'image/png'
      : key.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
    return new StreamableFile(stream, { type, disposition: 'inline' });
  }
}
