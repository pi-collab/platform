-- Brand-creator pair rate: lets ops set a custom platform fee for a specific
-- brand-creator relationship. A creator who introduces a brand gets a reduced
-- fee on ALL their deals with that brand, automatically.
--
-- Resolution order at deal creation:
--   1. deals.fee_pct_override (per-deal exception, if set)
--   2. brand_creator_rates.fee_pct (pair rate, if exists)
--   3. brands.platform_fee_percent (brand standard rate)

CREATE TABLE IF NOT EXISTS brand_creator_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  creator_id  uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  fee_pct     numeric NOT NULL CHECK (fee_pct >= 0 AND fee_pct <= 100),
  reason      text NOT NULL,
  set_by      text NOT NULL,  -- ops user email
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, creator_id)
);

CREATE INDEX ON brand_creator_rates (creator_id);
CREATE INDEX ON brand_creator_rates (brand_id);
