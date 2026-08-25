-- Migration 0484: add-on charges on each deliverable
--
-- deal_deliverable_items already carried collab and boosting as FLAGS with no
-- money attached (0180, 0190): reel_type, boosting_rights,
-- boosting_duration_months. This gives them a price.
--
-- ── Everything here is a SNAPSHOT ────────────────────────────────────────────
-- The rate is copied onto the row at offer time, not referenced from
-- creator_addon_rates. A creator who raises their collab rate next month must
-- not silently re-price a deal that was already agreed — the same reason
-- price_paise has been a snapshot since 0070.
--
-- Storing the resolved amount AND the rate it came from means the invoice can
-- show "Collab 10%: ₹6,000" years later without re-deriving anything, and
-- without the number moving if the rate does.
--
-- ── Boosting is in DAYS ──────────────────────────────────────────────────────
-- boosting_duration_months stays for rows written before this and is not read
-- by anything new. Months could not express "boost this for 10 days", which is
-- what brands actually buy.

ALTER TABLE deal_deliverable_items
  ADD COLUMN IF NOT EXISTS collab_charge_paise   bigint CHECK (collab_charge_paise >= 0),
  ADD COLUMN IF NOT EXISTS collab_rate_type      text CHECK (collab_rate_type IN ('fixed', 'percent')),
  ADD COLUMN IF NOT EXISTS collab_rate_value     bigint CHECK (collab_rate_value >= 0),
  ADD COLUMN IF NOT EXISTS boosting_days         int CHECK (boosting_days > 0),
  ADD COLUMN IF NOT EXISTS boosting_charge_paise bigint CHECK (boosting_charge_paise >= 0),
  ADD COLUMN IF NOT EXISTS boosting_30day_paise  bigint CHECK (boosting_30day_paise >= 0);

-- A charge with no rate behind it cannot be explained on an invoice, and a rate
-- with no charge is a control that was shown and never applied. Both halves or
-- neither.
ALTER TABLE deal_deliverable_items
  DROP CONSTRAINT IF EXISTS ddi_collab_complete;
ALTER TABLE deal_deliverable_items
  ADD CONSTRAINT ddi_collab_complete
  CHECK (
    (collab_charge_paise IS NULL AND collab_rate_type IS NULL AND collab_rate_value IS NULL)
    OR (collab_charge_paise IS NOT NULL AND collab_rate_type IS NOT NULL AND collab_rate_value IS NOT NULL)
  );

ALTER TABLE deal_deliverable_items
  DROP CONSTRAINT IF EXISTS ddi_boosting_complete;
ALTER TABLE deal_deliverable_items
  ADD CONSTRAINT ddi_boosting_complete
  CHECK (
    (boosting_days IS NULL AND boosting_charge_paise IS NULL AND boosting_30day_paise IS NULL)
    OR (boosting_days IS NOT NULL AND boosting_charge_paise IS NOT NULL AND boosting_30day_paise IS NOT NULL)
  );

COMMENT ON COLUMN deal_deliverable_items.collab_charge_paise IS
  'Resolved collab amount in paise, rounded half-up ONCE at offer time. The deal total is the sum of stored line amounts — never recomputed from the rate.';
COMMENT ON COLUMN deal_deliverable_items.boosting_charge_paise IS
  'Resolved boosting amount: (boosting_30day_paise * boosting_days / 30), rounded half-up once. Per-day is never stored, only displayed.';
COMMENT ON COLUMN deal_deliverable_items.boosting_days IS
  'Days of boosting. Supersedes boosting_duration_months, which is retained only for rows written before migration 0484.';

-- No RLS change: policies on this table key on can_access_deal(deal_id), which
-- these columns do not affect.
