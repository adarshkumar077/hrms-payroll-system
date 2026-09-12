-- Align crm_leads with eitf CrmLead.title without wiping data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'crm_leads') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'crm_leads' AND column_name = 'title'
    ) THEN
      ALTER TABLE crm_leads ADD COLUMN title TEXT;
      -- backfill from Orbit-style "name" if present
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'crm_leads' AND column_name = 'name'
      ) THEN
        EXECUTE 'UPDATE crm_leads SET title = COALESCE(NULLIF(title, ''''), NULLIF(name, ''''), ''Lead'')';
      ELSE
        UPDATE crm_leads SET title = COALESCE(NULLIF(title, ''), 'Lead');
      END IF;
      ALTER TABLE crm_leads ALTER COLUMN title SET DEFAULT 'Lead';
      ALTER TABLE crm_leads ALTER COLUMN title SET NOT NULL;
    END IF;
  END IF;
END $$;
