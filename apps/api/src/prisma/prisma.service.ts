import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    const maxAttempts = 8;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        // Embedded Postgres on Windows can default client_encoding to WIN1252,
        // which rejects emoji/Unicode in announcements and other text fields.
        await this.$executeRawUnsafe(`SET client_encoding TO 'UTF8'`);
        return;
      } catch (err) {
        this.logger.warn(`Database connect attempt ${attempt}/${maxAttempts} failed`);
        if (attempt === maxAttempts) throw err;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
