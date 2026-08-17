-- Platform fee foundation: brand-level defaults + deal-level snapshot.
-- Purely additive. Existing deals get fee_percent 0 (no retroactive fee).

-- Brand defaults (ops-configurable per brand)
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS platform_fee_percent numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS fee_mode text NOT NULL DEFAULT 'on_top'
    CHECK (fee_mode IN ('on_top', 'deducted'));

-- Deal snapshot (copied from brand at deal creation, immutable after)
-- Default 0 so existing/test deals are unaffected.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS fee_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_mode text NOT NULL DEFAULT 'on_top'
    CHECK (fee_mode IN ('on_top', 'deducted'));
