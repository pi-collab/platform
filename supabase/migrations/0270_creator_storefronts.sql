-- =============================================================================
-- Migration 022: Creator Storefronts (public profile + pitch panel)
--
-- New table: creator_storefronts (one per creator, slug-based public page)
-- New column: brands.allow_public_attribution (opt-in for past-collabs display)
-- New column: deals.source (tracks where a deal originated)
-- New function: get_public_storefront(slug) — SECURITY DEFINER for anon access
-- RLS: creator_storefronts (own-only CRUD, NO anon read — all public access
--       goes through the function)
-- =============================================================================

-- ── 1. brands.allow_public_attribution ──────────────────────────────────────
-- Default false — brands must explicitly opt in to appear on creator storefronts.

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS allow_public_attribution boolean NOT NULL DEFAULT false;


-- ── 2. deals.source ─────────────────────────────────────────────────────────
-- Tracks deal origin: 'platform' (default), 'storefront', 'campaign', etc.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'platform';


-- ── 3. creator_storefronts table ────────────────────────────────────────────

CREATE TABLE creator_storefronts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid NOT NULL UNIQUE REFERENCES creators (id) ON DELETE CASCADE,

  -- URL slug: /c/{slug}. Unique, case-insensitive enforced via lower() index.
  -- Only lowercase alphanumeric + hyphens allowed. 3-30 chars.
  slug            text NOT NULL,

  -- Profile display (creator-controlled, overrides ops-entered data)
  display_name    text,
  headline        text,
  bio             text,
  portrait_path   text,           -- storage path in public storefront bucket

  -- Structured fields (all JSONB, validated on write in server actions)
  categories      jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats           jsonb NOT NULL DEFAULT '{}'::jsonb,
  platform_links  jsonb NOT NULL DEFAULT '[]'::jsonb,
  content_items   jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Visibility toggles
  show_rates          boolean NOT NULL DEFAULT true,
  show_past_collabs   boolean NOT NULL DEFAULT false,
  is_published        boolean NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Slug format: lowercase alphanumeric + hyphens, 3-30 chars, starts/ends with alphanumeric
  CONSTRAINT slug_format CHECK (
    slug ~ '^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$'
  ),

  -- Reserved words: all existing app route segments + common reserved paths
  CONSTRAINT slug_not_reserved CHECK (
    lower(slug) NOT IN (
      'api', 'admin', 'app', 'c', 'www', 'help', 'support', 'about',
      'blog', 'pricing', 'terms', 'privacy',
      'auth', 'brand', 'brands', 'browse', 'callback', 'campaigns',
      'creator', 'creators', 'dashboard', 'deals', 'inbox', 'invite',
      'login', 'notifications', 'offer', 'onboarding', 'ops',
      'settings', 'signup', 'test-rls'
    )
  )
);

-- Case-insensitive unique slug
CREATE UNIQUE INDEX creator_storefronts_slug_lower_idx
  ON creator_storefronts (lower(slug));

-- Fast lookup by creator_id (already UNIQUE, but explicit index)
CREATE INDEX ON creator_storefronts (creator_id);

-- Auto-touch updated_at
CREATE TRIGGER t_creator_storefronts_touch
  BEFORE UPDATE ON creator_storefronts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ── 4. RLS on creator_storefronts ───────────────────────────────────────────
-- Own-only CRUD. NO anon read policy — public access goes through
-- get_public_storefront() which is SECURITY DEFINER (bypasses RLS).

ALTER TABLE creator_storefronts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_storefronts_read_own ON creator_storefronts;
DROP POLICY IF EXISTS creator_storefronts_insert_own ON creator_storefronts;
DROP POLICY IF EXISTS creator_storefronts_update_own ON creator_storefronts;
DROP POLICY IF EXISTS creator_storefronts_deny_delete ON creator_storefronts;

CREATE POLICY creator_storefronts_read_own
  ON creator_storefronts FOR SELECT TO authenticated
  USING (creator_id = my_creator_id());

CREATE POLICY creator_storefronts_insert_own
  ON creator_storefronts FOR INSERT TO authenticated
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY creator_storefronts_update_own
  ON creator_storefronts FOR UPDATE TO authenticated
  USING (creator_id = my_creator_id())
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY creator_storefronts_deny_delete
  ON creator_storefronts FOR DELETE
  USING (false);


-- ── 5. get_public_storefront() — SECURITY DEFINER ──────────────────────────
-- Anonymous-safe: returns whitelisted JSON only.
-- Returns NULL for missing/unpublished/unvetted — prevents slug enumeration.

CREATE OR REPLACE FUNCTION get_public_storefront(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_storefront  record;
  v_creator     record;
  v_packages    jsonb;
  v_past_collabs jsonb;
  v_result      jsonb;
BEGIN
  -- 1. Find published storefront by slug (case-insensitive)
  SELECT *
    INTO v_storefront
    FROM creator_storefronts
   WHERE lower(slug) = lower(p_slug)
     AND is_published = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 2. Load creator — must be vetted
  SELECT id, full_name
    INTO v_creator
    FROM creators
   WHERE id = v_storefront.creator_id
     AND is_vetted = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 3. Build base result
  --    Never returns: creator_id, phone, handle, user_id, auth_id, rate_card,
  --                   niche, profile_photo_url (ops-entered external URL)
  --    Bio: storefront-authored only (no fallback to ops-entered creators.bio)
  --    Photo: portrait_path only (storefront bucket path, validated on write)
  --           No fallback to creators.profile_photo_url (external URL, not validated)
  --    Categories: creator-controlled storefront field, not ops-entered niche
  v_result := jsonb_build_object(
    'slug',           v_storefront.slug,
    'display_name',   COALESCE(v_storefront.display_name, v_creator.full_name),
    'headline',       v_storefront.headline,
    'bio',            v_storefront.bio,
    'portrait_path',  v_storefront.portrait_path,
    'categories',     v_storefront.categories,
    'stats',          v_storefront.stats,
    'platform_links', v_storefront.platform_links,
    'content_items',  v_storefront.content_items
  );

  -- 4. Conditionally include packages
  --    show_rates = false -> hide ALL packages (storefront-level toggle)
  --    display_price = false -> hide THAT product (product-level toggle)
  --    Both must be true for a package to appear.
  IF v_storefront.show_rates = true THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'platform',     cp.platform,
        'product_type', cp.product_type,
        'description',  cp.description,
        'price_paise',  cp.price_paise
      )
      ORDER BY cp.created_at
    ), '[]'::jsonb)
      INTO v_packages
      FROM creator_products cp
     WHERE cp.creator_id = v_creator.id
       AND cp.is_active = true
       AND cp.display_price = true;

    v_result := v_result || jsonb_build_object('packages', v_packages);
  END IF;

  -- 5. Conditionally include past collabs
  --    Three gates, ALL required:
  --      a) show_past_collabs = true (creator opted in)
  --      b) deal status = 'complete' (deal is fully done)
  --      c) brand.allow_public_attribution = true (brand explicitly consented)
  --    Only brand name exposed — no deal details, no IDs.
  IF v_storefront.show_past_collabs = true THEN
    SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
      'brand_name', b.name
    )), '[]'::jsonb)
      INTO v_past_collabs
      FROM deals d
      JOIN brands b ON b.id = d.brand_id
     WHERE d.creator_id = v_creator.id
       AND d.status = 'complete'
       AND b.allow_public_attribution = true;

    v_result := v_result || jsonb_build_object('past_collabs', v_past_collabs);
  END IF;

  RETURN v_result;
END;
$$;
