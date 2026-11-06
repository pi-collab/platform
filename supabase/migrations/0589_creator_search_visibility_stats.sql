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
