-- PROD RUN: 0585 → 0586 → 0587 Guapd AI search, long briefs, Creator Marketplace + invites (prepared 2026-11-06)
-- NOT RUN YET. Run in the Supabase SQL editor on PROD, top to bottom, BEFORE the code release. Then the checks at the end.
-- Safe with every flag off: nothing reads these until CREATOR_SEARCH / META_CREATOR_MARKETPLACE are set.
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

-- CHECK 1: tables exist, RLS on, no client rights. Expect 3 rows, rls true, every grant false.
select c.relname, c.relrowsecurity as rls,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert
from pg_class c where c.relname in ('brand_creator_searches', 'brand_meta_connections', 'brand_creator_invites') order by 1;

-- CHECK 2: the pool function is service_role only. Expect false, false, true.
select has_function_privilege('anon', 'creator_search_pool(integer,integer,bigint)', 'EXECUTE') as anon,
       has_function_privilege('authenticated', 'creator_search_pool(integer,integer,bigint)', 'EXECUTE') as authenticated,
       has_function_privilege('service_role', 'creator_search_pool(integer,integer,bigint)', 'EXECUTE') as service_role;

-- CHECK 3: new creator columns exist and nobody is opted in yet. Expect 0.
select count(*) as opted_in from creators where search_opt_in_at is not null;

-- CHECK 4: no storefront already uses the reserved "i-" prefix. Expect 0.
select count(*) as i_slugs from creator_storefronts where slug like 'i-%';

-- Ledger (the CLI is linked to staging; prod is run by hand):
insert into supabase_migrations.schema_migrations (version, name) values
  ('0585', 'creator_search'), ('0586', 'creator_search_long_briefs'), ('0587', 'meta_creator_marketplace')
on conflict do nothing;
