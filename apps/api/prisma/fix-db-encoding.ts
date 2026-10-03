/**
 * Recreate eitf_hrms as UTF8 if the current DB encoding cannot store emoji/Unicode.
 * Dev-only helper for embedded Postgres on Windows (often initializes as WIN1252).
 */
import { PrismaClient } from '@prisma/client';

const adminUrl =
  process.env.DATABASE_URL?.replace(/\/eitf_hrms(\?|$)/, '/postgres$1') ??
  'postgresql://eitf:eitf_dev_password@localhost:5435/postgres';

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  const rows = await prisma.$queryRawUnsafe<{ enc: string }[]>(
    `SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = 'eitf_hrms'`,
  );
  await prisma.$disconnect();

  const enc = rows[0]?.enc ?? 'unknown';
  console.log(`Current eitf_hrms encoding: ${enc}`);
  if (enc.toUpperCase() === 'UTF8') {
    console.log('Already UTF8 — nothing to do.');
    return;
  }

  console.log('Recreating eitf_hrms as UTF8 (dev data will be wiped; re-run migrate + seed)…');
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  await admin.$executeRawUnsafe(`
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = 'eitf_hrms' AND pid <> pg_backend_pid()
  `);
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS eitf_hrms`);
  await admin.$executeRawUnsafe(`
    CREATE DATABASE eitf_hrms
    WITH ENCODING 'UTF8'
    TEMPLATE template0
    LC_COLLATE 'C'
    LC_CTYPE 'C'
  `);
  await admin.$disconnect();
  console.log('Created eitf_hrms with UTF8 encoding.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
