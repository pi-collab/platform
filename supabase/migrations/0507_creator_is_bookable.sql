-- Growth creators become visible to brands — WITHOUT flipping is_vetted.
--
-- ── Why not just set is_vetted = true for growth creators ───────────────────
-- Migration 0487 encoded growth as is_vetted = false ON PURPOSE, and said why:
--
--   "Every brand-facing surface already filters on is_vetted ... Encoding
--    growth as not-vetted makes Growth creators invisible to brands without
--    touching a single one of them. The alternative — a new condition added in
--    26 places — is 26 chances to miss one."
--
-- That worked. It is also exactly what now has to be undone for brands to SEE
-- Growth creators, and flipping the boolean would undo far more than intended:
-- is_vetted also gates the storefront RPC, the verified badge and offer
-- creation. A Growth creator has PACKAGES, not a storefront, and is not
-- "verified" in the sense that badge means. Flipping would put them into the
-- Deals roster everywhere at once.
--
-- ── So: a second derived boolean, and three predicates ──────────────────────
-- is_bookable means "a brand may see and book this creator", which is true for
-- BOTH approved tracks. is_vetted keeps its existing meaning — "approved for
-- Deals" — and every surface that means THAT keeps reading it.
--
-- Derived by the same trigger, for the same reason: a status column plus
-- booleans that can disagree puts the truth in two places.

ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS is_bookable boolean NOT NULL DEFAULT false;

-- ── Extend the existing trigger function ────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_creator_vetting_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Deliberately ignores whatever the booleans were set to. vetting_status is
  -- the single source of truth; a caller that still writes one directly gets it
  -- overwritten rather than silently splitting the truth in two.
  NEW.is_vetted   := (NEW.vetting_status = 'deals_approved');
  NEW.is_rejected := (NEW.vetting_status = 'rejected');
  -- Both approved tracks. This is the ONLY difference from is_vetted, and the
  -- whole of how Growth creators reach brands.
  NEW.is_bookable := (NEW.vetting_status IN ('deals_approved', 'growth'));
  RETURN NEW;
END;
$$;

-- Backfill: the trigger only fires on write, and every existing row predates it.
UPDATE creators
SET is_bookable = (vetting_status IN ('deals_approved', 'growth'))
WHERE is_bookable IS DISTINCT FROM (vetting_status IN ('deals_approved', 'growth'));

CREATE INDEX IF NOT EXISTS creators_is_bookable_idx ON creators (is_bookable)
  WHERE is_bookable = true;

COMMENT ON COLUMN creators.is_bookable IS
  'DERIVED from vetting_status by creators_sync_vetting_flags. Do not write. TRUE for deals_approved AND growth — "a brand may see and book this creator". Distinct from is_vetted, which still means "approved for Deals" and still gates storefronts and the verified badge.';

-- ── THE GRANT. Do not skip this line. ───────────────────────────────────────
-- creators has a COLUMN-LEVEL SELECT allowlist. A column that is not granted
-- makes any query NAMING it fail with "permission denied for table creators" —
-- the whole query, not just that column. vetting_status was added without a
-- grant and the creator layout stopped being able to read its own row at all.
--
-- Repeated in supabase/rls.sql, which is the source of truth for the full list.
GRANT SELECT (
  id, user_id, full_name, niche, niches, handle, bio, profile_photo_url,
  worked_with, portfolio_links, social_accounts, location, primary_platform,
  is_vetted, is_rejected, vetting_status, is_bookable,
  revisions_enabled, included_revisions, price_per_extra_revision_paise,
  created_at, updated_at
) ON public.creators TO anon, authenticated;

-- ── The three brand-facing predicates ───────────────────────────────────────
-- These three, and no others. Everything else reading is_vetted means "Deals",
-- and is correct as it stands.

DROP POLICY IF EXISTS creators_read ON creators;
CREATE POLICY creators_read
  ON creators FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      -- WAS is_vetted = true. Growth creators now reach the brand-facing list.
      is_bookable = true
      OR user_id = my_user_id()
      OR EXISTS (
        SELECT 1 FROM deals
        WHERE deals.creator_id = creators.id
          AND deals.brand_id   = my_brand_id()
      )
    )
  );

DROP POLICY IF EXISTS creator_products_read ON creator_products;
CREATE POLICY creator_products_read
  ON creator_products FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      creator_id = my_creator_id()
      OR (
        is_active = true
        AND EXISTS (
          SELECT 1 FROM creators
          WHERE creators.id = creator_products.creator_id
            AND creators.is_bookable = true
        )
      )
    )
  );

DROP POLICY IF EXISTS creator_addon_rates_read_vetted ON creator_addon_rates;
CREATE POLICY creator_addon_rates_read_vetted
  ON creator_addon_rates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM creators c
      WHERE c.id = creator_addon_rates.creator_id
        AND c.is_bookable = true
    )
  );
