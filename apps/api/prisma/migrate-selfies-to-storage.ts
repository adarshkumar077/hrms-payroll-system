/**
 * One-off: move base64 `data:image` selfies out of Postgres TEXT columns into object storage,
 * rewriting each column to `storage:<key>`. Idempotent (only touches rows still holding data:image).
 *
 *   npm run db:migrate-selfies                 # dry-run (default): counts + bytes
 *   npm run db:migrate-selfies -- --apply      # upload and rewrite
 *
 * Uses STORAGE_DRIVER / S3_* / LOCAL_STORAGE_DIR from the environment.
 */
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../src/documents/storage.service';
import { migrateSelfies, type SelfieMigrationPrisma } from '../src/attendance/selfie-migration';

async function main() {
  try {
    process.loadEnvFile?.();
  } catch {
    /* no .env file; rely on the process environment */
  }
  const apply = process.argv.includes('--apply');
  if (apply && process.argv.includes('--dry-run')) {
    throw new Error('Pass either --dry-run or --apply, not both');
  }
  const prisma = new PrismaClient();
  const config = new ConfigService(process.env as Record<string, unknown>);
  const storage = new StorageService(config);
  storage.onModuleInit();

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}  driver: ${storage.driver}`);
  try {
    const stats = await migrateSelfies(prisma as unknown as SelfieMigrationPrisma, storage, {
      apply,
      log: (m) => console.log(m),
    });
    console.log(JSON.stringify(stats, null, 2));
    console.log(
      `${apply ? 'Migrated' : 'Would migrate'} ${stats.migratable} value(s), ` +
        `${(stats.bytes / 1024 / 1024).toFixed(2)} MB decoded; ${stats.invalid} invalid skipped.`,
    );
    if (!apply) console.log('Dry run only. Re-run with --apply to perform the migration.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
