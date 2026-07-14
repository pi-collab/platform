-- Move boosting_rights + boosting_duration_months from deals to deal_deliverable_items (per-item)
-- Test data only — safe to drop deal-level columns

ALTER TABLE deal_deliverable_items
  ADD COLUMN IF NOT EXISTS boosting_rights boolean,
  ADD COLUMN IF NOT EXISTS boosting_duration_months int CHECK (boosting_duration_months > 0);

ALTER TABLE deals
  DROP COLUMN IF EXISTS boosting_rights,
  DROP COLUMN IF EXISTS boosting_duration_months;
