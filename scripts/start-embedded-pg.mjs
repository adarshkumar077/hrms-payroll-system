import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const databaseDir = path.join(root, 'data', 'pg-hrms');
const marker = path.join(databaseDir, 'PG_VERSION');

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'eitf',
  password: 'eitf_dev_password',
  port: 5435,
  persistent: true,
  // Windows defaults to WIN1252; force UTF8 so announcements/emoji work.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

async function ensureUtf8Database() {
  // createDatabase uses template1; if cluster is old WIN1252, recreate explicitly.
  const { Client } = await import('pg');
  const client = new Client({
    host: '127.0.0.1',
    port: 5435,
    user: 'eitf',
    password: 'eitf_dev_password',
    database: 'postgres',
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = 'eitf_hrms'`,
    );
    const enc = rows[0]?.enc;
    if (!enc) {
      await client.query(`
        CREATE DATABASE eitf_hrms
        WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'
      `);
      console.log('Created database eitf_hrms (UTF8)');
      return;
    }
    if (String(enc).toUpperCase() === 'UTF8') {
      console.log('Database eitf_hrms already exists (UTF8)');
      return;
    }
    console.log(`Database eitf_hrms is ${enc}; recreating as UTF8…`);
    await client.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = 'eitf_hrms' AND pid <> pg_backend_pid()
    `);
    await client.query(`DROP DATABASE eitf_hrms`);
    await client.query(`
      CREATE DATABASE eitf_hrms
      WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'
    `);
    console.log('Recreated eitf_hrms as UTF8 — run npm run db:migrate && npm run db:seed');
  } finally {
    await client.end();
  }
}

async function main() {
  if (!existsSync(marker)) {
    console.log('Initialising embedded Postgres cluster…');
    await pg.initialise();
  }

  console.log('Starting embedded Postgres on port 5435…');
  await pg.start();

  try {
    await ensureUtf8Database();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`UTF8 database ensure note: ${msg}`);
    try {
      await pg.createDatabase('eitf_hrms');
      console.log('Created database eitf_hrms');
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : String(err2);
      if (!/already exists/i.test(msg2)) {
        console.log(`createDatabase note: ${msg2}`);
      } else {
        console.log('Database eitf_hrms already exists');
      }
    }
  }

  console.log('Embedded Postgres is running.');
  console.log('DATABASE_URL=postgresql://eitf:eitf_dev_password@localhost:5435/eitf_hrms?schema=public');
  console.log('Keep this process open while developing. Ctrl+C to stop.');

  const keepAlive = () => {};
  setInterval(keepAlive, 60_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
