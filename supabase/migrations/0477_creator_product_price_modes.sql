-- Migration 0477: how a package's price is expressed
--
-- Until now a package carried one number and a boolean: price_paise, plus
-- display_price to hide it. That forces every creator into "my Reel costs
-- exactly X", which is not how rates are quoted. Real answers are "from ₹60k",
-- "₹60k–₹90k", or "ask me".
--
-- IMPORTANT — this changes DISPLAY, not deal maths. A deal still carries one
-- agreed number. price_mode describes how a creator advertises a rate on their
-- shopfront; the brand still enters or confirms the actual figure when building
-- the offer. Nothing downstream should try to compute with a range.
--
-- price_paise keeps its meaning as the ONE number that anchors every mode:
--   exact       → the price
--   from        → the minimum
--   range       → the low end, with price_max_paise as the high end
--   on_request   → 0, and nothing is shown
--
-- Anchoring on the existing column rather than adding price_min_paise means
-- every current consumer (deal builder, campaign placements, ops, browse)
-- keeps reading a sane figure without being touched.

ALTER TABLE creator_products
  ADD COLUMN IF NOT EXISTS price_mode      text   NOT NULL DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS price_max_paise bigint;

-- Every existing row was an exact price, which the default already states.

ALTER TABLE creator_products
  DROP CONSTRAINT IF EXISTS creator_products_price_mode_chk;
ALTER TABLE creator_products
  ADD CONSTRAINT creator_products_price_mode_chk
  CHECK (price_mode IN ('exact', 'from', 'range', 'on_request'));

-- A high end belongs to a range and only to a range. Without the second half of
-- this, switching a range back to "exact" would silently leave the old maximum
-- behind, and the next reader would not know which number to trust.
ALTER TABLE creator_products
  DROP CONSTRAINT IF EXISTS creator_products_price_max_chk;
ALTER TABLE creator_products
  ADD CONSTRAINT creator_products_price_max_chk
  CHECK (
    (price_mode =  'range' AND price_max_paise IS NOT NULL AND price_max_paise > price_paise)
    OR
    (price_mode <> 'range' AND price_max_paise IS NULL)
  );

-- A price a creator will not name must not be sitting in the column anyway.
-- Read access to this table is wider than the shopfront: any authenticated user
-- can select active products of a vetted creator, so "hidden" has to mean
-- absent, not merely unrendered.
ALTER TABLE creator_products
  DROP CONSTRAINT IF EXISTS creator_products_on_request_chk;
ALTER TABLE creator_products
  ADD CONSTRAINT creator_products_on_request_chk
  CHECK (price_mode <> 'on_request' OR price_paise = 0);

COMMENT ON COLUMN creator_products.price_mode IS
  'How the rate is advertised: exact | from | range | on_request. Display only — a deal always carries one agreed number.';
COMMENT ON COLUMN creator_products.price_max_paise IS
  'High end of a range. NULL for every other mode, enforced by creator_products_price_max_chk.';
COMMENT ON COLUMN creator_products.display_price IS
  'Legacy visibility flag, kept because existing consumers read it. Derived from price_mode: false when on_request, true otherwise. Set it from the mode, never independently.';
