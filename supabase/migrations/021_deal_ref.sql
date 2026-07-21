-- Migration 021: deal_ref — human-readable deal reference numbers (GD-1001, GD-1002, ...)
-- Adds a sequential deal_ref column to deals, auto-assigned via BEFORE INSERT trigger.

-- 1. Sequence starting at 1001
CREATE SEQUENCE IF NOT EXISTS deal_ref_seq START WITH 1001;

-- 2. Column
ALTER TABLE deals ADD COLUMN IF NOT EXISTS deal_ref text;

-- 3. Backfill existing deals in creation order
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM deals ORDER BY created_at ASC
  LOOP
    UPDATE deals SET deal_ref = 'GD-' || nextval('deal_ref_seq') WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Unique constraint (after backfill so no nulls conflict during transition)
ALTER TABLE deals ADD CONSTRAINT deals_deal_ref_unique UNIQUE (deal_ref);

-- 5. Trigger: auto-assign deal_ref on INSERT
CREATE OR REPLACE FUNCTION assign_deal_ref()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deal_ref IS NULL THEN
    NEW.deal_ref := 'GD-' || nextval('deal_ref_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_deal_ref ON deals;
CREATE TRIGGER trg_assign_deal_ref
  BEFORE INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION assign_deal_ref();
