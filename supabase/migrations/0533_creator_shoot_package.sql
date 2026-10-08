-- 0533: the creator shoot package (Experiences stage 3b, part 1).
--
-- A creator's rate card gains a second KIND of package: a shoot day, priced per
-- day (e.g. ₹10,000/day). It prices an Experience creator leg (0534): gross =
-- day rate × days, then the creator's own track % nets it.
--
--   * package_pricing_types: a lookup, so a new pricing type is a ROW, not a
--     migration. Seeded with per_deliverable (every existing package) and
--     per_day. App code treats any type it does not know as hidden from brands
--     and not sendable.
--   * creator_products.pricing_type: FK to the lookup, DEFAULT per_deliverable.
--     Existing rows take the default; no backfill UPDATE and no CHECK that only
--     a backfill satisfies (see the 0516 constraint-plus-backfill trap).
--   * price_paise keeps its meaning: the price per unit of the pricing type.
--     For per_day that is the day rate.
--   * per_day shape: Shoot day, exact price > 0, no range, no revisions; no
--     channel (a shoot day is not tied to one platform), so platform and handle
--     become nullable, still REQUIRED for per_deliverable. At most one active
--     day rate per creator.
--   * Read gating: a non-owner sees ONLY per_deliverable packages. It is an
--     allowlist, so a future type is hidden by default. Brands never read a day
--     rate: a brand that saw it could work out Guapd's margin on an Experience.
--     Most app reads use the service role, which skips this policy, so every
--     brand-facing read also filters explicitly (scripts/check-package-gating.ts).
--   * Staff with Experiences operational access may set a creator's day rate on
--     their behalf (a Kiro creator may not have set one), through one audited
--     definer function. Creators set their own from /creator/packages.

-- ── 1. The pricing-type lookup ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package_pricing_types (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z][a-z_]*$'),
  label      text NOT NULL,
  unit_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE package_pricing_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON package_pricing_types FROM anon, authenticated;

INSERT INTO package_pricing_types (id, label, unit_label) VALUES
  ('per_deliverable', 'Per deliverable', 'deliverable'),
  ('per_day',         'Per shoot day',   'day')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE package_pricing_types IS
  'How a creator_products row is priced. A new type is a row here, not a migration. Server-only.';

-- ── 2. creator_products.pricing_type and the per_day shape ─────────────────
ALTER TABLE creator_products
  ADD COLUMN IF NOT EXISTS pricing_type text NOT NULL DEFAULT 'per_deliverable'
  REFERENCES package_pricing_types (id);

COMMENT ON COLUMN creator_products.pricing_type IS
  'per_deliverable: a priced deliverable on a channel (the marketplace rate card). per_day: a shoot day rate, priced per day, used only for Guapd Experience creator legs and never shown to brands.';
COMMENT ON COLUMN creator_products.price_paise IS
  'Price per unit of pricing_type: per deliverable, or per day for per_day.';

ALTER TABLE creator_products ALTER COLUMN platform DROP NOT NULL;
ALTER TABLE creator_products ALTER COLUMN handle   DROP NOT NULL;

-- A marketplace package still needs its channel. Every existing row has one
-- (both were NOT NULL until this migration), and every insert path sets both.
ALTER TABLE creator_products DROP CONSTRAINT IF EXISTS creator_products_channel_by_type;
ALTER TABLE creator_products ADD CONSTRAINT creator_products_channel_by_type CHECK (
  pricing_type = 'per_day' OR (platform IS NOT NULL AND handle IS NOT NULL)
);

-- Written as "not per_day OR …", so it constrains nothing but per_day rows.
ALTER TABLE creator_products DROP CONSTRAINT IF EXISTS creator_products_per_day_shape;
ALTER TABLE creator_products ADD CONSTRAINT creator_products_per_day_shape CHECK (
  pricing_type <> 'per_day' OR (
        product_type = 'Shoot day'
    AND price_mode = 'exact'
    AND price_max_paise IS NULL
    AND price_paise > 0
    AND revisions_enabled = false
    AND included_revisions = 0
    AND price_per_extra_revision_paise = 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_products_one_active_day_rate
  ON creator_products (creator_id) WHERE pricing_type = 'per_day' AND is_active;

-- ── 3. Read gating ─────────────────────────────────────────────────────────
-- Same as 0507's policy, plus: a non-owner sees per_deliverable only.
DROP POLICY IF EXISTS creator_products_read ON creator_products;
CREATE POLICY creator_products_read ON creator_products FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      creator_id = my_creator_id()
      OR (
        is_active = true
        AND pricing_type = 'per_deliverable'
        AND EXISTS (SELECT 1 FROM creators WHERE creators.id = creator_products.creator_id AND creators.is_bookable = true)
      )
    )
  );

-- ── 4. Staff set a creator's day rate on their behalf ──────────────────────
-- Creates the creator's one active day rate, or reprices it. Audited with the
-- before and after rate. Never touches a per_deliverable package. A sent leg
-- is unaffected: its rate was frozen onto experience_creator_terms (0534).
CREATE OR REPLACE FUNCTION experience_console_set_day_rate(p_creator_id uuid, p_day_rate_paise bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_before bigint;
BEGIN
  PERFORM experience_console_require();
  IF NOT EXISTS (SELECT 1 FROM creators c WHERE c.id = p_creator_id AND NOT c.is_guapd) THEN
    RAISE EXCEPTION 'Creator not found';
  END IF;
  -- ₹1 to ₹1 crore a day, in whole rupees: the same sanity cap as the rate card.
  IF p_day_rate_paise IS NULL OR p_day_rate_paise < 100 OR p_day_rate_paise > 1000000000 OR p_day_rate_paise % 100 <> 0 THEN
    RAISE EXCEPTION 'A day rate is a whole number of rupees between ₹1 and ₹1,00,00,000';
  END IF;

  SELECT cp.id, cp.price_paise INTO v_id, v_before
    FROM creator_products cp
    WHERE cp.creator_id = p_creator_id AND cp.pricing_type = 'per_day' AND cp.is_active
    FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO creator_products (creator_id, pricing_type, platform, handle, product_type, description,
                                  price_paise, price_mode, price_max_paise, display_price, is_active,
                                  revisions_enabled, included_revisions, price_per_extra_revision_paise)
    VALUES (p_creator_id, 'per_day', NULL, NULL, 'Shoot day', NULL,
            p_day_rate_paise, 'exact', NULL, false, true, false, 0, 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE creator_products SET price_paise = p_day_rate_paise WHERE id = v_id;
  END IF;

  PERFORM experience_console_audit('creator.day_rate_set_by_staff', 'creator_products', v_id,
    jsonb_build_object('creator_id', p_creator_id, 'day_rate_paise_before', v_before, 'day_rate_paise_after', p_day_rate_paise));
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION experience_console_set_day_rate(uuid, bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION experience_console_set_day_rate(uuid, bigint) TO authenticated;
