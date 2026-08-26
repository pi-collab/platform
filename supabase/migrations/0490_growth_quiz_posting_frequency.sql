-- Migration 0490: the Growth quiz asks about cadence, not size, and takes a note
--
-- Two changes to creator_growth_quiz_responses (0488):
--
--   Q1 REPLACED. "How big is your following right now?" (follower_band) becomes
--   "How often do you post right now?" (posting_frequency). Size is already on
--   creators.follower_band from 0474 and asking it twice bought nothing;
--   cadence is the thing Guapd Growth actually has to work with and it is not
--   recorded anywhere else.
--
--   Q4 ADDED. anything_else, optional free text, mirroring the closing question
--   in the Deals welcome flow (creator_onboarding_responses, 0478).
--
-- ── Why the old rows are deleted rather than migrated ────────────────────────
-- A follower band cannot be translated into a posting cadence. Any mapping
-- would be invented data sitting in a table whose whole purpose is to be
-- aggregated honestly, so there is nothing to carry across.
--
-- Deleting is also the correct product outcome. Row presence is what gates the
-- quiz (0488), so removing a row re-opens it, and a creator who answered the
-- old Q1 genuinely has not answered the question we now ask.
--
-- Scope: 0488 has never run in production, so the only rows this can touch are
-- staging test answers.

ALTER TABLE creator_growth_quiz_responses
  ADD COLUMN IF NOT EXISTS posting_frequency text,
  ADD COLUMN IF NOT EXISTS anything_else text;

-- Every pre-existing row, on the first run only: the column was just added, so
-- NULL here means "answered the question that no longer exists". On a re-run
-- nothing is NULL and this matches nothing.
DELETE FROM creator_growth_quiz_responses WHERE posting_frequency IS NULL;

ALTER TABLE creator_growth_quiz_responses
  ALTER COLUMN posting_frequency SET NOT NULL;

-- Codes, never the words shown on screen, exactly as 0488 established.
ALTER TABLE creator_growth_quiz_responses
  DROP CONSTRAINT IF EXISTS creator_growth_quiz_posting_frequency_chk;
ALTER TABLE creator_growth_quiz_responses
  ADD CONSTRAINT creator_growth_quiz_posting_frequency_chk
  CHECK (posting_frequency IN ('daily', 'few_times_week', 'weekly', 'rarely'));

-- Dropping the column takes its CHECK with it. Nothing reads it: the rows that
-- held answers are gone, so there is no evidence being destroyed here.
DROP INDEX IF EXISTS creator_growth_quiz_band_idx;
ALTER TABLE creator_growth_quiz_responses DROP COLUMN IF EXISTS follower_band;

CREATE INDEX IF NOT EXISTS creator_growth_quiz_freq_idx
  ON creator_growth_quiz_responses (posting_frequency);

COMMENT ON COLUMN creator_growth_quiz_responses.posting_frequency IS
  'How often the creator posts today. daily | few_times_week | weekly | rarely. Replaced follower_band in 0490; size lives on creators.follower_band (0474).';
COMMENT ON COLUMN creator_growth_quiz_responses.anything_else IS
  'Optional closing free text, capped at 500 chars by the action. Null when left blank, so an empty string never reads as an answer.';

-- No RLS change. The policies from 0488 are table-scoped, not column-scoped, so
-- they cover both new columns unchanged. This table is NOT subject to the
-- column-level SELECT allowlist that creators carries (0470/0489), so no GRANT
-- is needed here.
