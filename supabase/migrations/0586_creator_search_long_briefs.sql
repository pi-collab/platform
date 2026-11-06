-- 0586: Guapd AI search for long briefs, and creator languages.
--
--   A. creators.languages: the languages a creator makes content in, optional,
--      set in Settings. Used by Guapd AI search as a filter (a known mismatch
--      excludes; none on file is kept and named). No client grant: written and
--      read by the server only, like search_opt_in_at.
--   B. creator_search_pool() gains three columns, used by the ranker and never
--      returned to a brand as-is:
--        languages          the filter above
--        past_brands        creators.worked_with, so a brief's exclusions
--                           ("no one who has worked with <competitor>") can
--                           remove a creator
--        deliverable_types  the types of the creator's active packages
--                           ("Instagram Reel"), so a brief asking for reels
--                           ranks creators who sell reels higher
--      Same gates, same parameters, same service_role-only access as 0585.

-- ═════ A. Languages ═════
ALTER TABLE creators ADD COLUMN IF NOT EXISTS languages text[];
ALTER TABLE creators DROP CONSTRAINT IF EXISTS creators_languages_check;
ALTER TABLE creators ADD CONSTRAINT creators_languages_check
  CHECK (languages IS NULL OR coalesce(array_length(languages, 1), 0) <= 8);
COMMENT ON COLUMN creators.languages IS
  '0586: languages the creator makes content in (English names, from the Settings list). Optional. Written by the server only.';

-- ═════ B. The pool ═════
DROP FUNCTION IF EXISTS creator_search_pool(integer, integer, bigint);
CREATE FUNCTION creator_search_pool(
  p_followers_min integer,
  p_followers_max integer,
  p_budget_max_paise bigint
)
RETURNS TABLE (
  creator_id          uuid,
  full_name           text,
  handle              text,
  photo_url           text,
  has_storefront      boolean,
  bio                 text,
  niches              text[],
  city                text,
  state               text,
  languages           text[],
  past_brands         text[],
  deliverable_types   text[],
  typed_followers     integer,
  follower_band       text,
  verified            boolean,
  verified_followers  integer,
  ig_media            jsonb,
  ig_synced_at        timestamptz,
  starting_rate_paise bigint,
  completed_deals     integer,
  on_time_measured    integer,
  on_time             integer,
  offers_received     integer,
  offers_responded    integer
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH base AS (
    SELECT c.*,
           sf.creator_id IS NOT NULL AS sf_published,
           sf.bio AS sf_bio,
           sf.categories AS sf_categories,
           (ic.status = 'connected' AND ic.snapshot IS NOT NULL
             AND ic.last_synced_at > now() - interval '10 days') IS TRUE AS is_verified,
           ic.snapshot,
           ic.last_synced_at
      FROM creators c
      LEFT JOIN creator_storefronts sf ON sf.creator_id = c.id AND sf.is_published IS TRUE
      LEFT JOIN creator_instagram_connections ic ON ic.creator_id = c.id
     WHERE c.search_opt_in_at IS NOT NULL
       AND c.is_bookable IS TRUE
       AND c.is_rejected IS NOT TRUE
       AND c.is_guapd IS NOT TRUE
  ),
  shaped AS (
    SELECT b.id,
           b.full_name,
           b.handle,
           b.profile_photo_url,
           b.sf_published,
           coalesce(nullif(btrim(b.sf_bio), ''), nullif(btrim(b.bio), '')) AS bio,
           ARRAY(
             SELECT DISTINCT btrim(x) FROM (
               SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(b.sf_categories)) = 'array' THEN to_jsonb(b.sf_categories) ELSE '[]'::jsonb END) AS x
               UNION ALL SELECT unnest(coalesce(b.niches, '{}'::text[]))
               UNION ALL SELECT b.niche
             ) n WHERE x IS NOT NULL AND btrim(x) <> ''
           ) AS niches,
           coalesce(nullif(btrim(b.city), ''), nullif(btrim(b.location), '')) AS city,
           nullif(btrim(b.state), '') AS state,
           coalesce(b.languages, '{}'::text[]) AS languages,
           ARRAY(
             SELECT btrim(x) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(to_jsonb(b.worked_with)) = 'array' THEN to_jsonb(b.worked_with) ELSE '[]'::jsonb END) x
              WHERE btrim(x) <> ''
           ) AS past_brands,
           ARRAY(
             SELECT DISTINCT p.product_type FROM creator_products p
              WHERE p.creator_id = b.id AND p.is_active IS TRUE AND p.product_type IS NOT NULL
           ) AS deliverable_types,
           (SELECT max((s->>'follower_count')::numeric)::integer
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.social_accounts) = 'array' THEN b.social_accounts ELSE '[]'::jsonb END) s
             WHERE lower(s->>'platform') = 'instagram'
               AND (s->>'follower_count') ~ '^[0-9]+(\.[0-9]+)?$'
               AND (s->>'follower_count')::numeric > 0) AS typed_followers,
           b.follower_band,
           b.is_verified,
           CASE WHEN b.is_verified AND (b.snapshot->>'followersCount') ~ '^[0-9]+$'
                THEN (b.snapshot->>'followersCount')::integer END AS verified_followers,
           CASE WHEN b.is_verified THEN (
             SELECT coalesce(jsonb_agg(jsonb_build_object('likes', m->'likeCount', 'comments', m->'commentsCount') ORDER BY ord), '[]'::jsonb)
               FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.snapshot->'media') = 'array' THEN b.snapshot->'media' ELSE '[]'::jsonb END)
                    WITH ORDINALITY AS t(m, ord)
              WHERE ord <= 12) END AS ig_media,
           CASE WHEN b.is_verified THEN b.last_synced_at END AS ig_synced_at,
           (SELECT min(p.price_paise) FROM creator_products p
             WHERE p.creator_id = b.id AND p.is_active IS TRUE AND p.display_price IS TRUE
               AND p.pricing_type = 'per_deliverable'
               AND p.price_mode IS DISTINCT FROM 'on_request'
               AND p.price_paise > 0) AS starting_rate_paise
      FROM base b
  ),
  history AS (
    SELECT d.creator_id,
           count(*) FILTER (WHERE d.status IN ('paid', 'complete'))::integer AS completed_deals,
           count(*) FILTER (WHERE d.status IN ('approved', 'paid', 'complete') AND d.timeline_date IS NOT NULL AND fs.first_submit IS NOT NULL)::integer AS on_time_measured,
           count(*) FILTER (WHERE d.status IN ('approved', 'paid', 'complete') AND d.timeline_date IS NOT NULL AND fs.first_submit IS NOT NULL
                              AND (fs.first_submit AT TIME ZONE 'Asia/Kolkata')::date <= d.timeline_date)::integer AS on_time,
           count(*) FILTER (WHERE d.leg_role IS NULL AND d.created_at < now() - interval '2 days')::integer AS offers_received,
           count(*) FILTER (WHERE d.leg_role IS NULL AND d.created_at < now() - interval '2 days'
                              AND (d.status NOT IN ('negotiating', 'cancelled') OR d.last_offer_by = 'creator'
                                   OR EXISTS (SELECT 1 FROM messages mm WHERE mm.deal_id = d.id AND mm.sender_party = 'creator')))::integer AS offers_responded
      FROM deals d
      LEFT JOIN LATERAL (SELECT min(i.submitted_at) AS first_submit FROM deal_deliverable_items i WHERE i.deal_id = d.id) fs ON true
     WHERE d.creator_id IN (SELECT id FROM base)
     GROUP BY d.creator_id
  )
  SELECT s.id, s.full_name, s.handle, s.profile_photo_url, s.sf_published, s.bio, s.niches, s.city, s.state,
         s.languages, s.past_brands, s.deliverable_types,
         s.typed_followers, s.follower_band, s.is_verified, s.verified_followers, s.ig_media, s.ig_synced_at,
         s.starting_rate_paise,
         coalesce(h.completed_deals, 0), coalesce(h.on_time_measured, 0), coalesce(h.on_time, 0),
         coalesce(h.offers_received, 0), coalesce(h.offers_responded, 0)
    FROM shaped s
    LEFT JOIN history h ON h.creator_id = s.id
   WHERE (p_followers_min IS NULL OR coalesce(s.verified_followers, s.typed_followers) IS NULL
          OR coalesce(s.verified_followers, s.typed_followers) >= p_followers_min)
     AND (p_followers_max IS NULL OR coalesce(s.verified_followers, s.typed_followers) IS NULL
          OR coalesce(s.verified_followers, s.typed_followers) <= p_followers_max)
     AND (p_budget_max_paise IS NULL OR s.starting_rate_paise IS NULL OR s.starting_rate_paise <= p_budget_max_paise);
$$;
REVOKE EXECUTE ON FUNCTION creator_search_pool(integer, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION creator_search_pool(integer, integer, bigint) TO service_role;

-- ═════ C. Saved searches hold a full brief ═════
ALTER TABLE brand_creator_searches DROP CONSTRAINT IF EXISTS brand_creator_searches_brief_check;
ALTER TABLE brand_creator_searches ADD CONSTRAINT brand_creator_searches_brief_check
  CHECK (length(brief) BETWEEN 1 AND 6000);
