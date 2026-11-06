-- PROD RUN: 0585 → 0590 Guapd AI search (brief search, long briefs, Creator Marketplace + invites tables, /browse visibility, "Your visibility" counts). Prepared 2026-11-06. Includes 0590 (onboarding, Coming soon notes, Meta states, WhatsApp consent).
-- NOT RUN YET. Run in the Supabase SQL editor on PROD, top to bottom, in this order, BEFORE the code release. Then the checks at the end.
-- Safe with every flag off: nothing reads these until CREATOR_SEARCH / CREATOR_SEARCH_NOTICE are set.
-- Check first: SELECT max(version) FROM supabase_migrations.schema_migrations;  (0584 must be applied)

-- ===== STEP START: 0585 =====
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
-- ===== STEP END: 0585 =====

-- ===== STEP START: 0586 =====
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
-- ===== STEP END: 0586 =====

-- ===== STEP START: 0587 =====
-- 0587: Instagram Creator Marketplace for brands, and invites to creators not
-- on Guapd. Behind META_CREATOR_MARKETPLACE=1 (and CREATOR_SEARCH=1).
--
-- Creator Marketplace is a BRAND-side API: the brand signs in with Facebook
-- Login (their Instagram business account linked to a Facebook Page) and the
-- search runs with the Page token on graph.facebook.com. It is separate from
-- the creator Instagram Login connection (0493), which is unchanged.
--
--   A. brand_meta_connections: one per brand. The Facebook user, the Page and
--      its Instagram business account, and the tokens, encrypted with the same
--      AES-256-GCM module as 0493 (lib/instagram-token.ts). Server only.
--   B. brand_creator_invites: a tracked invite link per creator per search
--      (guapd.com/c/i-<token>), for a creator found on Instagram who is not on
--      Guapd. Holds the Instagram username only: no email, bio, insights or
--      other Meta creator data is stored (Meta's retention terms are not yet
--      checked; results are cached in memory for minutes only). Server only.

-- ═════ A. Brand Facebook connection ═════
CREATE TABLE IF NOT EXISTS brand_meta_connections (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           uuid NOT NULL UNIQUE REFERENCES brands (id) ON DELETE CASCADE,
  connected_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  fb_user_id         text NOT NULL,
  page_id            text NOT NULL,
  page_name          text,
  ig_user_id         text NOT NULL,
  ig_username        text,
  status             text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'needs_reconnect')),
  user_token_ciphertext text NOT NULL,
  user_token_iv      text NOT NULL,
  user_token_tag     text NOT NULL,
  page_token_ciphertext text NOT NULL,
  page_token_iv      text NOT NULL,
  page_token_tag     text NOT NULL,
  key_version        int NOT NULL DEFAULT 1,
  user_token_expires_at timestamptz,
  scopes             text[] NOT NULL DEFAULT '{}',
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bmc_fb_user_idx ON brand_meta_connections (fb_user_id);
COMMENT ON TABLE brand_meta_connections IS
  '0587: a brand''s Facebook Login connection for Instagram Creator Marketplace. Tokens encrypted (AES-256-GCM). Server only: RLS on, no policies, no client grants.';

ALTER TABLE brand_meta_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_meta_connections FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_meta_connections TO service_role;

-- ═════ B. Invites ═════
CREATE TABLE IF NOT EXISTS brand_creator_invites (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  search_id          uuid NOT NULL REFERENCES brand_creator_searches (id) ON DELETE CASCADE,
  created_by         uuid REFERENCES users (id) ON DELETE SET NULL,
  -- "i-" + 26 base36 characters: the /c/ path, never a storefront slug.
  token              text NOT NULL UNIQUE CHECK (token ~ '^i-[a-z0-9]{26}$'),
  ig_username        text NOT NULL CHECK (ig_username ~ '^[a-z0-9._]{1,30}$'),
  -- What the creator is shown: Guapd's own reading of the brief, not Meta data.
  summary            text NOT NULL CHECK (length(summary) BETWEEN 1 AND 300),
  deliverables       text[] NOT NULL DEFAULT '{}',
  timeline           text CHECK (timeline IS NULL OR length(timeline) <= 80),
  -- Tracking. sent = the brand used a route (copy, Instagram, WhatsApp).
  sent_at            timestamptz,
  sent_via           text CHECK (sent_via IS NULL OR sent_via IN ('copy', 'instagram', 'whatsapp')),
  opened_at          timestamptz,
  signed_up_at       timestamptz,
  accepted_at        timestamptz,
  creator_id         uuid REFERENCES creators (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, search_id, ig_username)
);
CREATE INDEX IF NOT EXISTS bci_brand_idx ON brand_creator_invites (brand_id, created_at DESC);
COMMENT ON TABLE brand_creator_invites IS
  '0587: tracked invite links to creators found on Instagram who are not on Guapd. Username only, no email or other Meta creator data. Server only: RLS on, no policies, no client grants.';

ALTER TABLE brand_creator_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_creator_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_creator_invites TO service_role;

-- ═════ C. Meta call counts on a saved search (rate limits) ═════
ALTER TABLE brand_creator_searches ADD COLUMN IF NOT EXISTS meta_runs integer NOT NULL DEFAULT 0;
ALTER TABLE brand_creator_searches ADD COLUMN IF NOT EXISTS last_meta_at timestamptz;
-- ===== STEP END: 0587 =====

-- ===== STEP START: 0588 =====
-- 0588: Guapd AI search covers every creator brands can already see.
--
-- Decision (PJ, 2026-11-06): no opt-in. Search uses exactly the visibility
-- rule /browse uses (is_bookable = true AND is_guapd = false), so a brand finds
-- through a brief the same creators it can scroll through on Browse. A creator
-- can opt OUT with "Hide me from Guapd AI search".
--
--   A. creators.search_hidden_at: set when the creator hides themselves from
--      Guapd AI search. NULL = searchable (everyone, by default). Server
--      written only. Replaces 0585's search_opt_in_at, which is dropped.
--   B. creators.search_notice_dismissed_at: the one-time "brands can now find
--      you through Guapd AI search" notice was dismissed. Server written only.
--   C. creator_search_pool(): the /browse rule, minus hidden creators. Same
--      parameters, same columns, same service_role-only access.

-- ═════ A + B. Columns ═════
ALTER TABLE creators ADD COLUMN IF NOT EXISTS search_hidden_at timestamptz;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS search_notice_dismissed_at timestamptz;
COMMENT ON COLUMN creators.search_hidden_at IS
  '0588: when the creator chose "Hide me from Guapd AI search". NULL = searchable. Written by the server only.';
COMMENT ON COLUMN creators.search_notice_dismissed_at IS
  '0588: when the creator dismissed the one-time Guapd AI search notice. Written by the server only.';

-- ═════ C. The pool ═════
-- Recreated before the drop below: the 0585/0586 function reads search_opt_in_at.
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
     -- Exactly /browse's rule (app/browse/page.tsx: is_bookable = true,
     -- is_guapd = false; both columns NOT NULL), minus creators who chose
     -- "Hide me from Guapd AI search".
     WHERE c.is_bookable = true
       AND c.is_guapd = false
       AND c.search_hidden_at IS NULL
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

-- 0585's opt-in column: nothing reads it after this.
ALTER TABLE creators DROP COLUMN IF EXISTS search_opt_in_at;
-- ===== STEP END: 0588 =====

-- ===== STEP START: 0589 =====
-- 0589: "Your visibility" on the creator home: how often a creator appeared in
-- Guapd AI search results in the last 7 days, and how often that led to a
-- brand opening their profile or starting an offer. Counts only: no brand,
-- no brief, no search ever reaches the creator.
--
--   A. brand_search_interactions: a brand opened a creator's profile, or
--      started an offer, FROM a Guapd AI search result. Written by the server
--      (/api/creators/search/interaction) only after checking the creator was
--      in that search's saved results, so nobody can log an interaction for a
--      creator they were never shown. One row per search, creator and kind.
--      The PostHog events result_clicked / offer_started_from_search are sent
--      at the same moment, but PostHog is consent-gated and carries no creator
--      id, so it cannot be counted per creator; this table can.
--   B. creator_search_visibility(creator): the three counts. Server only.
--
-- ── How each number is counted, and why one brand cannot inflate it ────────
-- Every count is DISTINCT (brand, day in India time) pairs, over the last 7
-- days, ignoring Guapd's own house brands:
--   appeared        brand–days on which a saved search of that brand had the
--                   creator in its results (brand_creator_searches.result_ids,
--                   by the search's last run). A brand that re-runs, edits
--                   chips or runs ten briefs in one day counts once that day.
--                   A re-run replaces a search's saved results, so this can
--                   only under-count, never over-count.
--   opened_profile  brand–days with a profile_open interaction for the creator
--   started_offer   brand–days with an offer_started interaction for the creator
-- So the most one brand can add to any number in a week is 7.

-- ═════ A. Interactions ═════
CREATE TABLE IF NOT EXISTS brand_search_interactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id   uuid NOT NULL REFERENCES brand_creator_searches (id) ON DELETE CASCADE,
  brand_id    uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  creator_id  uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('profile_open', 'offer_started')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (search_id, creator_id, kind)
);
CREATE INDEX IF NOT EXISTS bsi_creator_idx ON brand_search_interactions (creator_id, created_at DESC);
COMMENT ON TABLE brand_search_interactions IS
  '0589: a brand opened a profile or started an offer from a Guapd AI search result. Server only: RLS on, no policies, no client grants.';

ALTER TABLE brand_search_interactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_search_interactions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_search_interactions TO service_role;

CREATE INDEX IF NOT EXISTS bcs_result_ids_gin ON brand_creator_searches USING gin (result_ids);

-- ═════ B. The counts ═════
CREATE OR REPLACE FUNCTION creator_search_visibility(p_creator_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_build_object(
    'appeared', (
      SELECT count(DISTINCT (s.brand_id, (s.last_run_at AT TIME ZONE 'Asia/Kolkata')::date))
        FROM brand_creator_searches s JOIN brands b ON b.id = s.brand_id
       WHERE s.result_ids @> ARRAY[p_creator_id]
         AND s.last_run_at > now() - interval '7 days'
         AND b.is_guapd IS NOT TRUE),
    'opened_profile', (
      SELECT count(DISTINCT (i.brand_id, (i.created_at AT TIME ZONE 'Asia/Kolkata')::date))
        FROM brand_search_interactions i JOIN brands b ON b.id = i.brand_id
       WHERE i.creator_id = p_creator_id AND i.kind = 'profile_open'
         AND i.created_at > now() - interval '7 days' AND b.is_guapd IS NOT TRUE),
    'started_offer', (
      SELECT count(DISTINCT (i.brand_id, (i.created_at AT TIME ZONE 'Asia/Kolkata')::date))
        FROM brand_search_interactions i JOIN brands b ON b.id = i.brand_id
       WHERE i.creator_id = p_creator_id AND i.kind = 'offer_started'
         AND i.created_at > now() - interval '7 days' AND b.is_guapd IS NOT TRUE)
  );
$$;
REVOKE EXECUTE ON FUNCTION creator_search_visibility(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION creator_search_visibility(uuid) TO service_role;
-- ===== STEP END: 0589 =====

-- ===== STEP START: 0590 =====
-- 0590: Guapd AI brand onboarding, "Coming soon" feedback, Meta connection
-- states, and an optional WhatsApp product-updates consent for creators.
-- Every table here is server only: RLS on, no policies, no client grants.
--
--   A. brand_user_ai_onboarding: per brand USER (not per device): when the
--      sparkle-icon highlight was done (icon clicked or dismissed) and when
--      the /ai intro was seen.
--   B. ai_feature_interest: a brand tapped a "Coming soon" row on the intro,
--      optionally with a one-line note. Nothing can be started from it.
--   C. brand_meta_eligibility: why a brand cannot use Creator Marketplace
--      (no Facebook Page, no linked Instagram business account, missing
--      permission, or Meta error 10: not eligible), so the app explains it
--      once and stops re-prompting.
--   D. creators.whatsapp_updates_consent_at + creator_consent_log: an
--      optional, unticked "Product updates on WhatsApp". NULL = no consent.
--      Every grant and withdrawal is logged with its time and where it came
--      from. Nothing sends on it yet.

-- ═════ A ═════
CREATE TABLE IF NOT EXISTS brand_user_ai_onboarding (
  user_id            uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  highlight_done_at  timestamptz,
  intro_seen_at      timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_user_ai_onboarding ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_user_ai_onboarding FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_user_ai_onboarding TO service_role;

-- ═════ B ═════
CREATE TABLE IF NOT EXISTS ai_feature_interest (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    uuid NOT NULL REFERENCES brands (id) ON DELETE CASCADE,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  feature     text NOT NULL CHECK (feature IN ('write_brief', 'campaigns')),
  note        text CHECK (note IS NULL OR length(note) BETWEEN 1 AND 200),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS afi_feature_idx ON ai_feature_interest (feature, created_at DESC);
ALTER TABLE ai_feature_interest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_feature_interest FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_feature_interest TO service_role;

-- ═════ C ═════
CREATE TABLE IF NOT EXISTS brand_meta_eligibility (
  brand_id    uuid PRIMARY KEY REFERENCES brands (id) ON DELETE CASCADE,
  state       text NOT NULL CHECK (state IN ('no_page', 'no_instagram', 'missing_permission', 'not_eligible')),
  checked_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_meta_eligibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_meta_eligibility FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brand_meta_eligibility TO service_role;

-- ═════ D ═════
ALTER TABLE creators ADD COLUMN IF NOT EXISTS whatsapp_updates_consent_at timestamptz;
COMMENT ON COLUMN creators.whatsapp_updates_consent_at IS
  '0590: when the creator ticked "Product updates on WhatsApp" (optional, unticked by default). NULL = no consent. Written by the server only; history in creator_consent_log. Not used to send anything yet.';
CREATE TABLE IF NOT EXISTS creator_consent_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL REFERENCES creators (id) ON DELETE CASCADE,
  consent     text NOT NULL CHECK (consent IN ('whatsapp_product_updates')),
  granted     boolean NOT NULL,
  source      text NOT NULL CHECK (source IN ('signup', 'settings')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ccl_creator_idx ON creator_consent_log (creator_id, created_at DESC);
ALTER TABLE creator_consent_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON creator_consent_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON creator_consent_log TO service_role;
-- ===== STEP END: 0590 =====

-- CHECK 1: new tables exist, RLS on, no client rights. Expect 8 rows, rls true, every grant false.
select c.relname, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert
from pg_class c
where c.relname in ('brand_creator_searches', 'brand_meta_connections', 'brand_creator_invites', 'brand_search_interactions',
                    'brand_user_ai_onboarding', 'ai_feature_interest', 'brand_meta_eligibility', 'creator_consent_log') order by 1;

-- CHECK 2: both functions service_role only. Expect false, false, true twice.
select f, has_function_privilege('anon', f, 'EXECUTE') as anon, has_function_privilege('authenticated', f, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', f, 'EXECUTE') as service_role
from unnest(array['creator_search_pool(integer,integer,bigint)', 'creator_search_visibility(uuid)']) f;

-- CHECK 3: search covers exactly what /browse lists (nobody hidden yet). Expect pool = browse.
select (select count(*) from creator_search_pool(null, null, null)) as pool,
       (select count(*) from creators where is_bookable = true and is_guapd = false) as browse;

-- CHECK 4: the 0585 opt-in column is gone. Expect 0 rows.
select column_name from information_schema.columns where table_name = 'creators' and column_name = 'search_opt_in_at';

-- CHECK 5: no storefront already uses the reserved "i-" prefix. Expect 0.
select count(*) as i_slugs from creator_storefronts where slug like 'i-%';

-- Ledger (the CLI is linked to staging; prod is run by hand):
insert into supabase_migrations.schema_migrations (version, name) values
  ('0585', 'creator_search'), ('0586', 'creator_search_long_briefs'), ('0587', 'meta_creator_marketplace'),
  ('0588', 'creator_search_browse_visibility'), ('0589', 'creator_search_visibility_stats'), ('0590', 'guapd_ai_onboarding_and_consent')
on conflict do nothing;
