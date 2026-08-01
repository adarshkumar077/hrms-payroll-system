import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const databaseDir = path.join(root, 'data', 'pg');
const marker = path.join(databaseDir, 'PG_VERSION');

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'eitf',
  password: 'eitf_dev_password',
  port: 5433,
  persistent: true,
});

async function main() {
  if (!existsSync(marker)) {
    console.log('Initialising embedded Postgres cluster…');
    await pg.initialise();
  }

  console.log('Starting embedded Postgres on port 5433…');
  await pg.start();

  try {
    await pg.createDatabase('eitf_hrms');
    console.log('Created database eitf_hrms');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/already exists/i.test(msg)) {
      // createDatabase may throw if exists — ignore that case
      console.log(`createDatabase note: ${msg}`);
    } else {
      console.log('Database eitf_hrms already exists');
    }
  }

  console.log('Embedded Postgres is running.');
  console.log('DATABASE_URL=postgresql://eitf:eitf_dev_password@localhost:5433/eitf_hrms?schema=public');
  console.log('Keep this process open while developing. Ctrl+C to stop.');

  const keepAlive = () => {};
  setInterval(keepAlive, 60_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
