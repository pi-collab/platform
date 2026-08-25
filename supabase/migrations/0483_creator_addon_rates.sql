-- Migration 0483: per-channel add-on rates (collab, boosting)
--
-- A creator can charge for two things on top of a deliverable: a Collab (they
-- post as a collaborator with the brand) and Boosting (the brand may run the
-- post as paid media). Both are the creator's own rates, set once and applied
-- per deliverable when a brand builds an offer.
--
-- ── Why a table, not columns on creators ─────────────────────────────────────
-- The rates are PER CHANNEL. A creator's collab rate on Instagram is not their
-- collab rate on YouTube, and boosting a Reel is not boosting a long-form video.
-- Columns on `creators` would force one rate across every channel they own.
--
-- Keyed on (creator_id, platform, handle) — the same triple creator_products
-- uses to identify a channel. Not a foreign key to social_accounts, because
-- that is jsonb; the application enforces consistency, exactly as it already
-- does for products.
--
-- It also keeps these rates OFF the creators row, which matters: the public
-- storefront RPC does `SELECT * FROM creators`, and although it emits an
-- explicit allowlist today, a rate sitting on that row is one refactor away
-- from being published on /c/<slug>. Nothing in that RPC touches this table.
--
-- ── Why percent is stored in basis points ────────────────────────────────────
-- 10% is 1000, not 10.00. A numeric(5,2) arrives in JavaScript as a float, and
-- a float in the money path is how totals stop adding up. Every input to the
-- add-on arithmetic is an integer, so the arithmetic is integer throughout.
-- The cost is a precision floor of 0.01%, which no creator prices to.

CREATE TABLE IF NOT EXISTS creator_addon_rates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,

  platform      text NOT NULL,
  handle        text NOT NULL,

  -- NULL type means the creator does not offer a collab on this channel, and
  -- the brand-side control is hidden rather than shown as zero.
  collab_rate_type   text CHECK (collab_rate_type IN ('fixed', 'percent')),
  collab_rate_value  bigint CHECK (collab_rate_value >= 0),

  -- The 30-DAY rate is the source of truth. Per-day is derived at calculation
  -- time and never stored: storing a rounded per-day figure and multiplying it
  -- is what makes 17 days of boosting disagree with the rate the creator set.
  boosting_30day_paise bigint CHECK (boosting_30day_paise >= 0),

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  UNIQUE (creator_id, platform, handle)
);

-- A type without a value, or a value without a type, is a half-set rate that
-- the calculator cannot act on. Rejected here rather than guarded at every
-- call site.
ALTER TABLE creator_addon_rates
  DROP CONSTRAINT IF EXISTS creator_addon_rates_collab_complete;
ALTER TABLE creator_addon_rates
  ADD CONSTRAINT creator_addon_rates_collab_complete
  CHECK (
    (collab_rate_type IS NULL AND collab_rate_value IS NULL)
    OR (collab_rate_type IS NOT NULL AND collab_rate_value IS NOT NULL)
  );

-- A percentage over 100% is a typo, not a rate. 10000 bp = 100%.
ALTER TABLE creator_addon_rates
  DROP CONSTRAINT IF EXISTS creator_addon_rates_percent_range;
ALTER TABLE creator_addon_rates
  ADD CONSTRAINT creator_addon_rates_percent_range
  CHECK (
    collab_rate_type IS DISTINCT FROM 'percent'
    OR (collab_rate_value >= 0 AND collab_rate_value <= 10000)
  );

CREATE INDEX IF NOT EXISTS creator_addon_rates_creator_idx
  ON creator_addon_rates (creator_id);

COMMENT ON TABLE creator_addon_rates IS
  'Per-channel Collab and Boosting rates. One row per (creator, platform, handle). Snapshotted onto deal_deliverable_items at offer time — a rate change must never re-price an agreed deal.';
COMMENT ON COLUMN creator_addon_rates.collab_rate_value IS
  'Paise when collab_rate_type = fixed. BASIS POINTS when percent (1000 = 10%). Integer either way, so no float enters the money path.';
COMMENT ON COLUMN creator_addon_rates.boosting_30day_paise IS
  'The 30-day rate. Per-day is derived at calculation time as (rate * days / 30), rounded once — never stored.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Also consolidated into supabase/rls.sql, which is the source of truth.

ALTER TABLE creator_addon_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_addon_rates_own_all   ON creator_addon_rates;
DROP POLICY IF EXISTS creator_addon_rates_read_vetted ON creator_addon_rates;

-- The creator manages their own rates.
CREATE POLICY creator_addon_rates_own_all
  ON creator_addon_rates FOR ALL
  USING (creator_id = my_creator_id())
  WITH CHECK (creator_id = my_creator_id());

-- Any signed-in user may READ the rates of a vetted creator: a brand building
-- an offer has to price the add-ons before the deal exists. Mirrors how
-- creator_products is already exposed — these are asking prices, published for
-- the same reason a rate card is.
CREATE POLICY creator_addon_rates_read_vetted
  ON creator_addon_rates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creators c
      WHERE c.id = creator_addon_rates.creator_id
        AND c.is_vetted = true
    )
  );
