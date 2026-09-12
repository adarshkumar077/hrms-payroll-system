import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async check() {
    const mem = process.memoryUsage();
    let db: 'ok' | 'error' = 'ok';
    let redis: 'ok' | 'skipped' | 'error' = 'skipped';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      try {
        const { default: Redis } = await import('ioredis');
        const client = new Redis(redisUrl, { connectTimeout: 3000, maxRetriesPerRequest: 1, lazyConnect: true });
        await client.connect();
        await client.ping();
        await client.quit();
        redis = 'ok';
      } catch {
        redis = 'error';
      }
    }
    const status = db === 'ok' && redis !== 'error' ? 'ok' : 'degraded';
    const body = {
      status,
      service: 'eitf-hrms-api',
      version: process.env.npm_package_version ?? '0.1.0',
      db,
      redis,
      uptimeSec: Math.floor(process.uptime()),
      memoryMb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      },
      ts: new Date().toISOString(),
    };
    if (db === 'error') throw new ServiceUnavailableException(body);
    return body;
  }
}
