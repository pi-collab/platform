-- Migration 0478: the questions a creator answers once, just after approval
--
-- Asked between the approval screen and the dashboard. The point is the
-- AGGREGATE — "what share of creators say late payment is their biggest pain" —
-- so the answers are stored as stable codes rather than the sentences shown on
-- screen. Copy gets edited; a column full of display strings stops being
-- comparable the first time it does.

CREATE TABLE IF NOT EXISTS creator_onboarding_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- UNIQUE is what makes "one response per creator" a fact rather than a hope.
  -- The gate checks for a row before showing the form, but a double-submit or a
  -- second tab would race that check; this cannot.
  creator_id     uuid NOT NULL UNIQUE REFERENCES creators (id) ON DELETE CASCADE,

  biggest_pain   text NOT NULL,
  -- Only meaningful when biggest_pain = 'other'. Free text, so it is the one
  -- field here that can contain anything a person types.
  pain_other     text,

  deal_handling  text NOT NULL,
  monthly_deals  text NOT NULL,
  anything_else  text,

  created_at     timestamptz NOT NULL DEFAULT now()
);

-- The codes are the schema. Without these a typo in one deploy quietly splits a
-- bucket in two and the percentages stop adding up.
ALTER TABLE creator_onboarding_responses
  DROP CONSTRAINT IF EXISTS creator_onboarding_biggest_pain_chk;
ALTER TABLE creator_onboarding_responses
  ADD CONSTRAINT creator_onboarding_biggest_pain_chk
  CHECK (biggest_pain IN ('few_deals', 'slow_payments', 'chaotic_channels', 'no_record', 'other'));

ALTER TABLE creator_onboarding_responses
  DROP CONSTRAINT IF EXISTS creator_onboarding_deal_handling_chk;
ALTER TABLE creator_onboarding_responses
  ADD CONSTRAINT creator_onboarding_deal_handling_chk
  CHECK (deal_handling IN ('direct', 'agency', 'mix', 'starting_out'));

ALTER TABLE creator_onboarding_responses
  DROP CONSTRAINT IF EXISTS creator_onboarding_monthly_deals_chk;
ALTER TABLE creator_onboarding_responses
  ADD CONSTRAINT creator_onboarding_monthly_deals_chk
  CHECK (monthly_deals IN ('0_1', '2_4', '5_plus'));

CREATE INDEX IF NOT EXISTS creator_onboarding_responses_created_idx
  ON creator_onboarding_responses (created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Consolidated into supabase/rls.sql in the same commit, per the standing rule.

ALTER TABLE creator_onboarding_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_onboarding_select_own ON creator_onboarding_responses;
DROP POLICY IF EXISTS creator_onboarding_insert_own ON creator_onboarding_responses;
DROP POLICY IF EXISTS creator_onboarding_deny_update ON creator_onboarding_responses;
DROP POLICY IF EXISTS creator_onboarding_deny_delete ON creator_onboarding_responses;

-- A creator sees their own answers and nobody else's. Ops reads through the
-- service role, which bypasses RLS.
CREATE POLICY creator_onboarding_select_own
  ON creator_onboarding_responses FOR SELECT
  USING (creator_id = my_creator_id());

CREATE POLICY creator_onboarding_insert_own
  ON creator_onboarding_responses FOR INSERT
  WITH CHECK (creator_id = my_creator_id());

-- No edits and no deletes. These answers are a point-in-time snapshot of what
-- someone said on the day they joined; a roster that can rewrite its own
-- answers is not a dataset anyone should draw conclusions from.
CREATE POLICY creator_onboarding_deny_update
  ON creator_onboarding_responses FOR UPDATE
  USING (false);

CREATE POLICY creator_onboarding_deny_delete
  ON creator_onboarding_responses FOR DELETE
  USING (false);

COMMENT ON TABLE creator_onboarding_responses IS
  'One-time post-approval questionnaire. Codes, not display strings — the aggregate is the point. Insert-only by policy.';
