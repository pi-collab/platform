-- ================================================================
-- STRUCTURED RIGHTS FIELDS
-- Additive columns for content rights terms on deals + items.
-- Existing RLS covers all new fields (no new policies needed).
-- ================================================================

-- Per-item: reel type (collab vs non-collab)
ALTER TABLE deal_deliverable_items
  ADD COLUMN IF NOT EXISTS reel_type text CHECK (reel_type IN ('collab', 'non_collab'));

-- Per-deal: structured rights terms
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS boosting_rights         boolean,
  ADD COLUMN IF NOT EXISTS boosting_duration_months int CHECK (boosting_duration_months > 0),
  ADD COLUMN IF NOT EXISTS usage_rights_end_date   date,
  ADD COLUMN IF NOT EXISTS rights_confirmed_at     timestamptz;
