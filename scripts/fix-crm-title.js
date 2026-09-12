const { Client } = require('pg');

async function main() {
  const c = new Client({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://eitf:eitf_dev_password@localhost:5433/eitf_hrms?schema=public',
  });
  await c.connect();
  const cols = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='crm_leads' ORDER BY 1",
  );
  console.log(
    'crm_leads cols:',
    cols.rows.map((r) => r.column_name).join(','),
  );
  const hasTitle = cols.rows.some((r) => r.column_name === 'title');
  const hasName = cols.rows.some((r) => r.column_name === 'name');
  if (!hasTitle) {
    await c.query('ALTER TABLE crm_leads ADD COLUMN title TEXT');
    if (hasName) {
      await c.query(
        "UPDATE crm_leads SET title = COALESCE(NULLIF(name, ''), 'Lead')",
      );
    } else {
      await c.query("UPDATE crm_leads SET title = 'Lead' WHERE title IS NULL");
    }
    await c.query("ALTER TABLE crm_leads ALTER COLUMN title SET DEFAULT 'Lead'");
    await c.query('ALTER TABLE crm_leads ALTER COLUMN title SET NOT NULL');
    console.log('title column added');
  } else {
    await c.query(
      "UPDATE crm_leads SET title = COALESCE(NULLIF(title, ''), 'Lead') WHERE title IS NULL OR title = ''",
    );
    console.log('title already present; backfilled');
  }
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
