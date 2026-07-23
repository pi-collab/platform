-- Per-deal fee override: lets ops set a custom platform fee for a specific
-- brand-creator pair on a deal (e.g. reduced fee for a creator who brought
-- the brand). Nullable — NULL means "use the brand's standard rate."
-- The resolved rate is still snapshotted into fee_percent at deal creation;
-- this column records that an override was applied.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS fee_pct_override numeric;
