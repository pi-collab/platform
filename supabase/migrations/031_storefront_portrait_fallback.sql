-- 031: Storefront portrait fallback to creators.profile_photo_url
-- When portrait_path is null, fall back to the creator's profile_photo_url
-- so one uploaded photo shows consistently everywhere.

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
  v_portrait    text;
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
  SELECT id, full_name, profile_photo_url
    INTO v_creator
    FROM creators
   WHERE id = v_storefront.creator_id
     AND is_vetted = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Portrait: storefront portrait_path overrides, falls back to profile_photo_url
  v_portrait := COALESCE(v_storefront.portrait_path, v_creator.profile_photo_url);

  -- 3. Build base result
  v_result := jsonb_build_object(
    'slug',           v_storefront.slug,
    'display_name',   COALESCE(v_storefront.display_name, v_creator.full_name),
    'headline',       v_storefront.headline,
    'bio',            v_storefront.bio,
    'portrait_path',  v_portrait,
    'categories',     v_storefront.categories,
    'stats',          v_storefront.stats,
    'platform_links', v_storefront.platform_links,
    'content_items',  v_storefront.content_items
  );

  -- 4. Conditionally include packages
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
