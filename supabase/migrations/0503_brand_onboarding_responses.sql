-- Migration 0503: the questions a brand answers once, on its first dashboard visit
--
-- The demand-side twin of creator_onboarding_responses (0478-0480). The point
-- is the AGGREGATE, "what share of brands say verifying numbers is their
-- biggest problem", so answers are stored as stable codes rather than the
-- sentences shown on screen. Copy gets edited; a column of display strings
-- stops being comparable the first time it does.
--
-- Asked when the brand PROFILE is created, not when the brand is approved.
-- Approval gates only a brand's first send, and most brands never send: at
-- the time of writing 20 of 22 brands on prod had never sent an offer. Gating
-- on approval would ask almost nobody, and miss exactly the brands whose
-- reasons for not sending are worth knowing.
--
-- RUN BEFORE DEPLOYING the code that writes it: the save action inserts here,
-- so an unmigrated database fails every submission.

CREATE TABLE IF NOT EXISTS brand_onboarding_responses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One response per BRAND, not per member. A brand's team shares one answer:
  -- whoever reaches the dashboard first gives it. UNIQUE is what makes that a
  -- fact rather than a hope; the gate checks for a row before showing the
  -- form, but two teammates or two tabs would race that check, and this cannot.
  brand_id           uuid NOT NULL UNIQUE REFERENCES brands (id) ON DELETE CASCADE,

  -- Which member answered. SET NULL rather than CASCADE: a teammate leaving
  -- must not delete the brand's answer.
  answered_by        uuid REFERENCES users (id) ON DELETE SET NULL,

  -- Multi-select, so plural. A column called challenge holding an array reads
  -- as a single value to everyone who meets it later.
  challenges         text[] NOT NULL,
  -- Only meaningful when challenges contains 'other'. Free text, so the one
  -- field here that can hold anything a person types.
  challenge_other    text,

  current_approach   text NOT NULL,
  monthly_campaigns  text NOT NULL,
  anything_else      text,

  created_at         timestamptz NOT NULL DEFAULT now()
);

-- The codes are the schema. Without these a typo in one deploy quietly splits
-- a bucket in two and the percentages stop adding up.

-- At least one, no more than the five options, and every element a known code.
-- coalesce, because array_length('{}', 1) is NULL, NULL BETWEEN is NULL, and a
-- CHECK only fails on FALSE: without it an empty selection passes (0480 fixed
-- the same hole on the creator table).
ALTER TABLE brand_onboarding_responses
  DROP CONSTRAINT IF EXISTS brand_onboarding_challenges_chk;
ALTER TABLE brand_onboarding_responses
  ADD CONSTRAINT brand_onboarding_challenges_chk
  CHECK (
    coalesce(array_length(challenges, 1), 0) BETWEEN 1 AND 5
    AND challenges <@ ARRAY['finding_creators', 'verifying_numbers', 'managing_campaigns', 'measuring_roi', 'other']::text[]
  );

ALTER TABLE brand_onboarding_responses
  DROP CONSTRAINT IF EXISTS brand_onboarding_current_approach_chk;
ALTER TABLE brand_onboarding_responses
  ADD CONSTRAINT brand_onboarding_current_approach_chk
  CHECK (current_approach IN ('direct', 'agency', 'mix', 'starting'));

-- 6_14 and 15_plus, not 6_15: a bucket boundary belongs to exactly one bucket.
ALTER TABLE brand_onboarding_responses
  DROP CONSTRAINT IF EXISTS brand_onboarding_monthly_campaigns_chk;
ALTER TABLE brand_onboarding_responses
  ADD CONSTRAINT brand_onboarding_monthly_campaigns_chk
  CHECK (monthly_campaigns IN ('0_1', '2_5', '6_14', '15_plus'));

CREATE INDEX IF NOT EXISTS brand_onboarding_responses_created_idx
  ON brand_onboarding_responses (created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Consolidated into supabase/rls.sql in the same commit, per the standing rule.

ALTER TABLE brand_onboarding_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brand_onboarding_select_own  ON brand_onboarding_responses;
DROP POLICY IF EXISTS brand_onboarding_insert_own  ON brand_onboarding_responses;
DROP POLICY IF EXISTS brand_onboarding_deny_update ON brand_onboarding_responses;
DROP POLICY IF EXISTS brand_onboarding_deny_delete ON brand_onboarding_responses;

-- A brand's members see their brand's answers and nobody else's. Ops reads
-- through the service role, which bypasses RLS.
CREATE POLICY brand_onboarding_select_own
  ON brand_onboarding_responses FOR SELECT
  USING (brand_id = my_brand_id());

CREATE POLICY brand_onboarding_insert_own
  ON brand_onboarding_responses FOR INSERT
  WITH CHECK (brand_id = my_brand_id());

-- No edits and no deletes. The answers are a point-in-time snapshot of what a
-- brand said on the day it joined; a dataset whose rows can be rewritten by
-- the people it describes is not one to draw conclusions from.
CREATE POLICY brand_onboarding_deny_update
  ON brand_onboarding_responses FOR UPDATE
  USING (false);

CREATE POLICY brand_onboarding_deny_delete
  ON brand_onboarding_responses FOR DELETE
  USING (false);

COMMENT ON TABLE brand_onboarding_responses IS
  'One-time questionnaire, asked on a brand''s first dashboard visit. One row per brand. Codes, not display strings: the aggregate is the point. Insert-only by policy.';
COMMENT ON COLUMN brand_onboarding_responses.challenges IS
  'One or more challenge codes. Multi-select: percentages computed from this sum to more than 100% of respondents, and should be labelled as such.';
COMMENT ON COLUMN brand_onboarding_responses.challenge_other IS
  'Free text, meaningful only when challenges contains ''other''.';
