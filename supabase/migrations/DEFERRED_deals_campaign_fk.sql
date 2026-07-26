-- Add the missing FK from deals.campaign_id to campaigns(id).
--
-- Migration 002 added campaign_id as a bare uuid (no FK).
-- Migration 015 tried to re-add it with a FK using ADD COLUMN IF NOT EXISTS,
-- but since the column already existed, the FK was silently skipped.
-- Prod also lacks this FK — this migration fixes BOTH prod and staging.
--
-- NOTE: If any existing deals.campaign_id values reference non-existent
-- campaigns, this will fail. Clean up orphans first if needed:
--   DELETE FROM deals WHERE campaign_id IS NOT NULL
--     AND campaign_id NOT IN (SELECT id FROM campaigns);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'deals_campaign_id_fkey'
      AND table_name = 'deals'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id);
  END IF;
END $$;
