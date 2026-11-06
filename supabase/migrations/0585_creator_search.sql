-- 0585: Guapd AI creator search (behind CREATOR_SEARCH=1).
--
-- A brand types a brief and gets a ranked list of creators already on Guapd.
-- The brief is turned into filters by a model (lib/ai/brief-filters.ts); the
-- model never sees or touches the database. Everything here is reached only
-- by the server (service_role), with the validated filters as typed
-- parameters.
--
--   A. creators.search_opt_in_at: a creator is shown in this search only once
--      they switch it on in Settings. NULL = hidden. A timestamp rather than a
--      boolean, so we know when they agreed.
--   B. brand_creator_searches: each search a brand runs (brief, filters it was
--      read as, the creators shown), so the brand can return to it. Also what
--      the per-brand rate limits count. Server only.
--   C. creator_search_pool(): the creators the search may rank, with only the
--      fields a brand may see before a deal (no phone, email, rate card, UPI,
--      token, demographics) and the Guapd track record figures the ranking
--      uses. Server only.

-- ═════ A. Opt-in ═════
ALTER TABLE creators ADD COLUMN IF NOT EXISTS search_opt_in_at timestamptz;
COMMENT ON COLUMN creators.search_opt_in_at IS
  '0585: when the creator agreed to be shown in Guapd AI creator search. NULL = hidden from it. Written by the server only (Settings → Connected accounts).';

-- ═════ B. Saved searches ═════
CREATE TABLE IF NOT EXISTS brand_creator_searches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id      uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  brief         text NOT NULL CHECK (length(brief) BETWEEN 1 AND 500),
  -- The filters as last run: the model's reading, then any chip edits.
  filters       jsonb NOT NULL,
  result_ids    uuid[] NOT NULL DEFAULT '{}',
  result_count  integer NOT NULL DEFAULT 0,
  -- 1 for the brief itself, +1 per chip edit. Capped in the app.
  run_count     integer NOT NULL DEFAULT 1 CHECK (run_count >= 1),
  model         text,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_run_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bcs_brand_created_idx ON brand_creator_searches (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bcs_brand_last_run_idx ON brand_creator_searches (brand_id, last_run_at DESC);
COMMENT ON TABLE brand_creator_searches IS
  '0585: Guapd AI searches, one row per brief. Server only: RLS on, no policies, no client grants. Read and written through /api/creators/search.';

ALTER TABLE brand_creator_searches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_creator_searches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_creator_searches TO service_role;

-- ═════ C. The pool ═════
-- Hard gates written out (the caller is the service role, which skips RLS):
-- opted in, bookable, not rejected, not the Guapd house account.
-- Followers and budget are excluded only on a KNOWN mismatch; a creator with
-- no figure on file is kept and the ranker says so.
-- "Verified" means a connected Instagram synced in the last 10 days: an older
-- snapshot is a token Instagram stopped accepting, and its numbers are not
-- shown as verified.
CREATE OR REPLACE FUNCTION creator_search_pool(
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
           (SELECT max((s->>'follower_count')::numeric)::integer
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.social_accounts) = 'array' THEN b.social_accounts ELSE '[]'::jsonb END) s
             WHERE lower(s->>'platform') = 'instagram'
               AND (s->>'follower_count') ~ '^[0-9]+(\.[0-9]+)?$'
               AND (s->>'follower_count')::numeric > 0) AS typed_followers,
           b.follower_band,
           b.is_verified,
           CASE WHEN b.is_verified AND (b.snapshot->>'followersCount') ~ '^[0-9]+$'
                THEN (b.snapshot->>'followersCount')::integer END AS verified_followers,
           -- Likes and comments only, newest first, for the engagement rate.
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
           -- Marketplace offers older than two days: a creator is not marked
           -- as not replying to an offer they got this morning.
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
