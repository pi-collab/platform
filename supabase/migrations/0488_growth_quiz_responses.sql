-- Migration 0488: the Guapd Growth quiz
--
-- Three questions a creator answers once when they land in Growth. The answers
-- are the seed of the Growth product — "growth creators under 5K in finance"
-- is the query this exists to make possible — so they are stored as codes in
-- their own columns, not as free text or a jsonb blob.
--
-- Modelled on creator_onboarding_responses (0478): one row per creator, codes
-- rather than display strings, and a snapshot nobody edits afterwards.

CREATE TABLE IF NOT EXISTS creator_growth_quiz_responses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  uuid NOT NULL UNIQUE REFERENCES creators (id) ON DELETE CASCADE,

  -- Codes, never the words shown on screen. Rewording "Under 5K" must not
  -- silently create a second bucket that no historical row belongs to.
  follower_band text NOT NULL
    CHECK (follower_band IN ('under_5k', '5k_10k', '10k_20k', '20k_plus')),

  growth_goal   text NOT NULL
    CHECK (growth_goal IN ('grow_following', 'first_deals', 'learn_collabs', 'all')),

  niche         text NOT NULL
    CHECK (niche IN ('finance', 'tech', 'fashion', 'fitness', 'food', 'entertainment', 'other')),

  -- Meaningful only when niche = 'other'. Not required even then: a creator who
  -- picks Other and types nothing has still answered the question.
  niche_other   text,

  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_growth_quiz_band_idx  ON creator_growth_quiz_responses (follower_band);
CREATE INDEX IF NOT EXISTS creator_growth_quiz_niche_idx ON creator_growth_quiz_responses (niche);

COMMENT ON TABLE creator_growth_quiz_responses IS
  'One row per creator, answered once on entering Guapd Growth. Row presence is what gates the quiz — no separate completion flag to fall out of step with the answers.';
COMMENT ON COLUMN creator_growth_quiz_responses.niche_other IS
  'Free text, meaningful only when niche = ''other''.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- A snapshot: a creator writes their answers once and reads them back. Update
-- and delete are denied outright, so an answer cannot be revised after the fact
-- and the aggregate stays trustworthy. Also consolidated into rls.sql.

ALTER TABLE creator_growth_quiz_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS growth_quiz_select_own  ON creator_growth_quiz_responses;
DROP POLICY IF EXISTS growth_quiz_insert_own  ON creator_growth_quiz_responses;
DROP POLICY IF EXISTS growth_quiz_deny_update ON creator_growth_quiz_responses;
DROP POLICY IF EXISTS growth_quiz_deny_delete ON creator_growth_quiz_responses;

CREATE POLICY growth_quiz_select_own
  ON creator_growth_quiz_responses FOR SELECT
  USING (creator_id = my_creator_id());

CREATE POLICY growth_quiz_insert_own
  ON creator_growth_quiz_responses FOR INSERT
  WITH CHECK (creator_id = my_creator_id());

CREATE POLICY growth_quiz_deny_update
  ON creator_growth_quiz_responses FOR UPDATE
  USING (false);

CREATE POLICY growth_quiz_deny_delete
  ON creator_growth_quiz_responses FOR DELETE
  USING (false);
